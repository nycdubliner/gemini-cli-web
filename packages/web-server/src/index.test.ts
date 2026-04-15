/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiCliAgent } from '@google/gemini-cli-sdk';
import { ApprovalMode } from '@google/gemini-cli-core';
import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createWebServer } from './index.js';
import type { PolicyController } from './policy.js';
import type { WebCommandMetadataProvider } from './command-metadata.js';

describe('createWebServer', () => {
  function createPolicy(): PolicyController {
    return {
      snapshot: () => ({
        allowAll: false,
        approvalMode: ApprovalMode.DEFAULT,
        label: 'Safe',
      }),
      setAllowAll: vi.fn(),
      addSession: vi.fn(() => vi.fn()),
    };
  }

  it('registers routes without throwing', () => {
    const agent = {
      session: vi.fn(),
      resumeSession: vi.fn(),
    } as unknown as GeminiCliAgent;

    const server = createWebServer({
      agent,
      config: {
        host: '127.0.0.1',
        port: 3001,
        authRequired: false,
      },
      cwd: process.cwd(),
      policy: createPolicy(),
    });

    expect(server.listening).toBe(false);
    server.close();
  });

  it('serves slash command metadata from the command metadata provider', async () => {
    const agent = {
      session: vi.fn(),
      resumeSession: vi.fn(),
    } as unknown as GeminiCliAgent;
    const commandMetadataProvider: WebCommandMetadataProvider = {
      list: vi.fn(async () => [
        {
          name: 'memory',
          description: 'Manage memory',
          usage: '/memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
              usage: '/memory show',
            },
          ],
        },
      ]),
    };
    const server = createWebServer({
      agent,
      config: {
        host: '127.0.0.1',
        port: 3001,
        authRequired: false,
      },
      cwd: process.cwd(),
      policy: createPolicy(),
      commandMetadataProvider,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/slash-commands`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      commands: [
        {
          name: 'memory',
          description: 'Manage memory',
          usage: '/memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
              usage: '/memory show',
            },
          ],
        },
      ],
    });
    server.close();
  });

  it('treats known terminal metadata commands as unsupported web commands', async () => {
    const session = {
      id: 'session-1',
      initialize: vi.fn(async () => {}),
      getModel: vi.fn(() => 'gemini-pro'),
      getQuota: vi.fn(() => ({})),
      messageBus: {
        on: vi.fn(),
        off: vi.fn(),
        publish: vi.fn(),
      },
      sendStream: vi.fn(),
    };
    const agent = {
      session: vi.fn(),
      resumeSession: vi.fn(async () => session),
    } as unknown as GeminiCliAgent;
    const commandMetadataProvider: WebCommandMetadataProvider = {
      list: vi.fn(async () => [
        {
          name: 'memory',
          description: 'Manage memory',
          usage: '/memory',
        },
      ]),
    };
    const server = createWebServer({
      agent,
      config: {
        host: '127.0.0.1',
        port: 3001,
        authRequired: false,
      },
      cwd: process.cwd(),
      policy: createPolicy(),
      commandMetadataProvider,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws/session-1`);
    await new Promise<void>((resolve) => ws.once('open', resolve));
    const messages: unknown[] = [];
    ws.on('message', (data) => {
      messages.push(JSON.parse(String(data)));
    });
    ws.send(JSON.stringify({ type: 'chat', text: '/memory' }));

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (
          messages.some(
            (message) =>
              typeof message === 'object' &&
              message !== null &&
              'type' in message &&
              message.type === 'stream_end',
          )
        ) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    expect(session.sendStream).not.toHaveBeenCalled();
    expect(messages).toContainEqual({
      type: 'slash_command',
      payload: {
        command: 'memory',
        status: 'error',
        message:
          '/memory is visible from the terminal CLI command registry, but web execution for it is not implemented yet.',
      },
    });
    ws.close();
    server.close();
  });
});
