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
  type ToolCallsUpdateMessage,
  type ToolConfirmationRequest,
} from '@google/gemini-cli-core';
import { createPolicyController, type PolicyController } from './policy.js';
import {
  getRequestToken,
  getCorsAllowOrigin,
  isAuthorized,
  loadWebServerConfig,
  type WebServerConfig,
} from './server-config.js';
import { parseClientMessage, type ServerMessage } from './protocol.js';
import { WebSessionStore } from './session-store.js';
import {
  createWebSlashCommandService,
  type WebSlashCommandService,
} from './slash-commands.js';
import {
  previewWorkspaceReference,
  processFileReferences,
  searchWorkspaceReferences,
} from './file-references.js';

interface WebServerOptions {
  agent: GeminiCliAgent;
  config: WebServerConfig;
  cwd: string;
  policy: PolicyController;
  sessionStore?: WebSessionStore;
  slashCommandService?: WebSlashCommandService;
}

interface ConnectedClient {
  id: string;
  sessionId: string;
  address: string;
  connectedAt: string;
}

interface AuditEvent {
  id: number;
  type: 'prompt' | 'tool_approval';
  sessionId: string;
  timestamp: string;
  detail: string;
}

function sendJson(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

function getQueryParam(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
  slashCommandService = createWebSlashCommandService(),
}: WebServerOptions): http.Server {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const webClientDist = path.resolve(cwd, 'packages/web-client/dist');
  const connectedClients = new Map<WebSocket, ConnectedClient>();
  const auditEvents: AuditEvent[] = [];
  let nextClientId = 1;
  let nextAuditId = 1;

  const audit = (
    type: AuditEvent['type'],
    sessionId: string,
    detail: string,
  ) => {
    auditEvents.push({
      id: nextAuditId++,
      type,
      sessionId,
      timestamp: new Date().toISOString(),
      detail,
    });
    if (auditEvents.length > 200) {
      auditEvents.splice(0, auditEvents.length - 200);
    }
  };

  app.use((req, res, next) => {
    const allowedOrigin = getCorsAllowOrigin(config, req.headers.origin);
    if (allowedOrigin) {
      res.header('Access-Control-Allow-Origin', allowedOrigin);
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
      connectedClients: connectedClients.size,
      clients: Array.from(connectedClients.values()),
      auditEvents: auditEvents.slice(-20),
    });
  });

  app.get('/api/audit-log', (_req, res) => {
    res.json({ events: auditEvents.slice(-100) });
  });

  app.get('/api/sessions', (_req, res) => {
    res.json({ sessions: sessionStore.list() });
  });

  app.get('/api/slash-commands', (_req, res) => {
    res.json({ commands: slashCommandService.list() });
  });

  app.get('/api/references/search', async (req, res) => {
    const query = getQueryParam(req.query['q']);
    try {
      res.json({ results: await searchWorkspaceReferences(cwd, query) });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/references/preview', async (req, res) => {
    const referencePath = getQueryParam(req.query['path']);
    if (!referencePath) {
      res.status(400).json({ error: 'Missing path' });
      return;
    }

    try {
      res.json({ preview: await previewWorkspaceReference(cwd, referencePath) });
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
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
      request: http.IncomingMessage,
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
        let activeAbortController: AbortController | undefined;
        connectedClients.set(ws, {
          id: String(nextClientId++),
          sessionId: session.id,
          address: request.socket.remoteAddress ?? 'unknown',
          connectedAt: new Date().toISOString(),
        });

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
        const onToolCallsUpdate = (message: ToolCallsUpdateMessage) => {
          sendJson(ws, {
            type: 'tool_calls_update',
            payload: {
              toolCalls: message.toolCalls,
              schedulerId: message.schedulerId,
            },
          });
        };

        messageBus.on(
          MessageBusType.TOOL_CONFIRMATION_REQUEST,
          onConfirmationRequest,
        );
        messageBus.on(MessageBusType.TOOL_CALLS_UPDATE, onToolCallsUpdate);

        ws.on('message', async (data) => {
          try {
            const msg = parseClientMessage(data.toString());

            if (msg.type === 'chat') {
              const slashCommandResult = slashCommandService.execute(msg.text, {
                sessionId: session.id,
                sessionStore,
                policy,
              });
              if (slashCommandResult.handled) {
                sendJson(ws, {
                  type: 'slash_command',
                  payload: {
                    command: slashCommandResult.command ?? '',
                    status: slashCommandResult.status ?? 'success',
                    message: slashCommandResult.message ?? '',
                    action: slashCommandResult.action,
                  },
                });
                sendJson(ws, {
                  type: 'session_state',
                  payload: sessionStore.ensure(session.id),
                });
                sendJson(ws, { type: 'stream_end' });
                return;
              }

              audit('prompt', session.id, msg.text);
              activeAbortController = new AbortController();
              const processedPrompt = await processFileReferences(
                msg.text,
                cwd,
              );
              sessionStore.appendUserMessage(session.id, msg.text);
              if (processedPrompt.references.length > 0) {
                sessionStore.appendSystemMessage(
                  session.id,
                  `Attached references: ${processedPrompt.references
                    .map((reference) => `@${reference.path}`)
                    .join(', ')}`,
                );
                sendJson(ws, {
                  type: 'session_state',
                  payload: sessionStore.ensure(session.id),
                });
              }
              const modelMessage = sessionStore.startModelMessage(session.id);
              const runController = activeAbortController;
              let wasCancelled = false;
              try {
                const stream = session.sendStream(
                  processedPrompt.prompt,
                  runController.signal,
                );
                for await (const event of stream) {
                  if (event.type === GeminiEventType.Content) {
                    sessionStore.appendModelChunk(
                      session.id,
                      modelMessage.id,
                      event.value,
                    );
                  }
                  sendJson(ws, {
                    type: 'gemini_event',
                    payload: event,
                  });
                }
              } catch (error) {
                if (runController.signal.aborted) {
                  wasCancelled = true;
                } else {
                  throw error;
                }
              } finally {
                activeAbortController = undefined;
              }
              sessionStore.finishModelMessage(session.id, modelMessage.id);
              if (wasCancelled) {
                sessionStore.appendSystemMessage(session.id, 'Run cancelled.');
                sendJson(ws, {
                  type: 'session_state',
                  payload: sessionStore.ensure(session.id),
                });
              }
              sendJson(ws, { type: 'stream_end' });
            } else if (msg.type === 'confirmation_response') {
              audit(
                'tool_approval',
                session.id,
                `${msg.outcome ?? (msg.confirmed ? 'allow' : 'deny')} ${msg.correlationId}`,
              );
              void messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId: msg.correlationId,
                confirmed: msg.confirmed,
                outcome: msg.outcome,
              });
            } else if (msg.type === 'cancel_stream') {
              activeAbortController?.abort();
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
          messageBus.off(MessageBusType.TOOL_CALLS_UPDATE, onToolCallsUpdate);
          connectedClients.delete(ws);
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
