/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { GeminiCliAgent } from '@google/gemini-cli-sdk';
import {
  GeminiEventType,
  MessageBusType,
  type ToolConfirmationRequest,
} from '@google/gemini-cli-core';
import { createPolicyController, type PolicyController } from './policy.js';
import {
  getRequestToken,
  isAuthorized,
  loadWebServerConfig,
  type WebServerConfig,
} from './server-config.js';
import { parseClientMessage, type ServerMessage } from './protocol.js';
import { WebSessionStore } from './session-store.js';

interface WebServerOptions {
  agent: GeminiCliAgent;
  config: WebServerConfig;
  cwd: string;
  policy: PolicyController;
  sessionStore?: WebSessionStore;
}

function sendJson(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

function readCommand(command: string, cwd: string, fallback: string): string {
  try {
    return execSync(command, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

function readCount(command: string, cwd: string): number {
  const value = Number.parseInt(readCommand(command, cwd, '0'), 10);
  return Number.isFinite(value) ? value : 0;
}

export function createWebServer({
  agent,
  config,
  cwd,
  policy,
  sessionStore = new WebSessionStore(),
}: WebServerOptions): http.Server {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const webClientDist = path.resolve(cwd, 'packages/web-client/dist');

  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    if (config.allowedOrigin) {
      if (requestOrigin === config.allowedOrigin) {
        res.header('Access-Control-Allow-Origin', config.allowedOrigin);
      }
    } else if (!config.authRequired) {
      res.header('Access-Control-Allow-Origin', '*');
    }

    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Content-Length, X-Requested-With',
    );
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', authRequired: config.authRequired });
  });

  app.use('/api', (req, res, next) => {
    if (
      isAuthorized(config, {
        authorization: req.headers.authorization,
      })
    ) {
      next();
      return;
    }

    res.status(401).json({ error: 'Unauthorized' });
  });

  app.get('/api/metadata', (_req, res) => {
    const branch = readCommand(
      'git rev-parse --abbrev-ref HEAD',
      cwd,
      'unknown',
    );
    const geminiMdCount = readCount('find . -name "GEMINI.md" | wc -l', cwd);
    const skillsCount = readCount(
      'find .gemini/skills -mindepth 1 -maxdepth 1 2>/dev/null | wc -l',
      cwd,
    );
    const policySnapshot = policy.snapshot();

    res.json({
      workspace: cwd,
      branch,
      geminiMdCount,
      skillsCount,
      mcpServersCount: 3,
      policy: policySnapshot.allowAll ? 'allow' : 'default',
      policyLabel: policySnapshot.label,
      approvalMode: policySnapshot.approvalMode,
      allowAll: policySnapshot.allowAll,
      model: 'Auto (Gemini 3)',
      sandbox: 'no sandbox',
    });
  });

  app.get('/api/sessions', (_req, res) => {
    res.json({ sessions: sessionStore.list() });
  });

  app.post('/api/policy', (req, res) => {
    if (typeof req.body?.allowAll !== 'boolean') {
      res.status(400).json({ error: 'allowAll must be a boolean' });
      return;
    }

    res.json({ status: 'ok', ...policy.setAllowAll(req.body.allowAll) });
  });

  app.post('/api/sessions', async (_req, res) => {
    try {
      const session = agent.session();
      await session.initialize();
      const state = sessionStore.ensure(session.id);
      res.json({ sessionId: session.id, session: state });
    } catch (error) {
      console.error('Failed to create session:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/sessions/:sessionId', (req, res) => {
    const sessionId = req.params['sessionId'];
    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId' });
      return;
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({ session });
  });

  app.delete('/api/sessions/:sessionId', (req, res) => {
    const sessionId = req.params['sessionId'];
    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId' });
      return;
    }

    res.json({ deleted: sessionStore.delete(sessionId) });
  });

  app.use(express.static(webClientDist));

  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      next();
      return;
    }

    res.sendFile(path.join(webClientDist, 'index.html'), (error) => {
      if (error) {
        next();
      }
    });
  });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const sessionId = url.pathname.split('/').pop();

    if (
      !isAuthorized(config, {
        authorization: request.headers.authorization,
        token: getRequestToken(undefined, request.url),
      })
    ) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (sessionId) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, sessionId);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on(
    'connection',
    async (
      ws: WebSocket,
      _request: http.IncomingMessage,
      sessionId: string,
    ) => {
      console.log(`WebSocket connected for session: ${sessionId}`);

      try {
        const session = await agent
          .resumeSession(sessionId)
          .catch(() => agent.session({ sessionId }));
        await session.initialize();
        const state = sessionStore.ensure(session.id);
        const removeSession = policy.addSession(session);

        const messageBus = session.messageBus;

        sendJson(ws, {
          type: 'session_state',
          payload: state,
        });

        const onConfirmationRequest = async (
          message: ToolConfirmationRequest,
        ) => {
          sendJson(ws, {
            type: 'confirmation_request',
            payload: message,
          });
        };

        messageBus.on(
          MessageBusType.TOOL_CONFIRMATION_REQUEST,
          onConfirmationRequest,
        );

        ws.on('message', async (data) => {
          try {
            const msg = parseClientMessage(data.toString());

            if (msg.type === 'chat') {
              sessionStore.appendUserMessage(session.id, msg.text);
              const modelMessage = sessionStore.startModelMessage(session.id);
              const stream = session.sendStream(msg.text);
              for await (const event of stream) {
                if (event.type === GeminiEventType.Content) {
                  sessionStore.appendModelChunk(
                    session.id,
                    modelMessage.id,
                    event.value,
                  );
                  sendJson(ws, {
                    type: 'gemini_event',
                    payload: event,
                  });
                }
              }
              sessionStore.finishModelMessage(session.id, modelMessage.id);
              sendJson(ws, { type: 'stream_end' });
            } else if (msg.type === 'confirmation_response') {
              void messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId: msg.correlationId,
                confirmed: msg.confirmed,
              });
            }
          } catch (error) {
            console.error('Error handling WebSocket message:', error);
            sendJson(ws, { type: 'error', error: String(error) });
          }
        });

        ws.on('close', () => {
          console.log(`WebSocket closed for session: ${sessionId}`);
          messageBus.off(
            MessageBusType.TOOL_CONFIRMATION_REQUEST,
            onConfirmationRequest,
          );
          removeSession();
        });
      } catch (error) {
        console.error('WebSocket session initialization failed:', error);
        ws.close(1011, String(error));
      }
    },
  );

  return server;
}

function start(): void {
  const config = loadWebServerConfig(process.env);
  const agent = new GeminiCliAgent({
    instructions:
      'You are a helpful assistant running in a web-based Gemini CLI interface.',
    debug: true,
    cwd: process.cwd(),
  });
  const policy = createPolicyController(agent);
  const server = createWebServer({
    agent,
    config,
    cwd: process.cwd(),
    policy,
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `Web API server listening on http://${config.host}:${config.port}`,
    );
    if (config.authRequired) {
      console.log('Web API authentication is enabled with GEMINI_WEB_TOKEN.');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
