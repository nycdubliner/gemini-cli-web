/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApprovalMode } from '@google/gemini-cli-core';
import { describe, expect, it, vi } from 'vitest';
import { createWebSlashCommandService } from './slash-commands.js';
import type { PolicyController, PolicySnapshot } from './policy.js';
import { WebSessionStore } from './session-store.js';
import type { GeminiCliSession } from '@google/gemini-cli-sdk';

function createPolicy(): PolicyController {
  let allowAll = false;
  const snapshot = (): PolicySnapshot => ({
    allowAll,
    approvalMode: allowAll ? ApprovalMode.YOLO : ApprovalMode.DEFAULT,
    label: allowAll ? 'Auto-approve' : 'Safe',
  });

  return {
    snapshot,
    setAllowAll: vi.fn((nextAllowAll: boolean) => {
      allowAll = nextAllowAll;
      return snapshot();
    }),
    addSession: vi.fn(() => vi.fn()),
  };
}

function createSession(
  quota: ReturnType<GeminiCliSession['getQuota']> = {},
): GeminiCliSession {
  return {
    getModel: vi.fn(() => 'gemini-pro'),
    setModel: vi.fn(),
    getQuota: vi.fn(() => quota),
  } as unknown as GeminiCliSession;
}

describe('createWebSlashCommandService', () => {
  it('lists discoverable commands', () => {
    const service = createWebSlashCommandService();

    const commands = service.list();
    expect(commands.map((command) => command.name)).toEqual([
      'help',
      'commands',
      'about',
      'model',
      'clear',
      'yolo',
    ]);
    expect(commands.find((command) => command.name === 'model')).toMatchObject({
      subCommands: [
        {
          name: 'set',
          usage: '/model set <model-name> [--persist]',
        },
      ],
    });
  });

  it('handles help commands as system transcript messages', () => {
    const service = createWebSlashCommandService();
    const store = new WebSessionStore();

    const result = service.execute('/help', {
      sessionId: 'session-1',
      sessionStore: store,
      policy: createPolicy(),
      session: createSession(),
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBeUndefined();
    expect(store.get('session-1')?.messages).toEqual([
      expect.objectContaining({ role: 'user', content: '/help' }),
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining(
          '/model set <model-name> [--persist]',
        ),
      }),
    ]);
  });

  it('clears the current transcript', () => {
    const service = createWebSlashCommandService();
    const store = new WebSessionStore();
    store.appendUserMessage('session-1', 'hello');

    const result = service.execute('/clear', {
      sessionId: 'session-1',
      sessionStore: store,
      policy: createPolicy(),
      session: createSession(),
    });

    expect(result).toEqual({
      handled: true,
      command: 'clear',
      status: 'success',
      message: 'Transcript cleared.',
      action: 'clear',
    });
    expect(store.get('session-1')?.messages).toEqual([
      expect.objectContaining({
        role: 'system',
        content: 'Transcript cleared.',
      }),
    ]);
  });

  it('toggles auto-approve mode', () => {
    const service = createWebSlashCommandService();
    const store = new WebSessionStore();
    const policy = createPolicy();

    const result = service.execute('/yolo', {
      sessionId: 'session-1',
      sessionStore: store,
      policy,
      session: createSession(),
    });

    expect(result.handled).toBe(true);
    expect(policy.snapshot().allowAll).toBe(true);
    expect(store.get('session-1')?.messages.at(-1)?.content).toBe(
      'Mode: Auto-approve.',
    );
  });

  it('leaves unknown slash inputs unhandled', () => {
    const service = createWebSlashCommandService();

    expect(
      service.execute('/not-a-command', {
        sessionId: 'session-1',
        sessionStore: new WebSessionStore(),
        policy: createPolicy(),
        session: createSession(),
      }),
    ).toEqual({ handled: false });
  });

  it('handles /model command to view model', () => {
    const service = createWebSlashCommandService();
    const store = new WebSessionStore();
    const session = createSession({
      remaining: 25,
      limit: 100,
      resetTime: 'tomorrow',
    });

    const result = service.execute('/model', {
      sessionId: 'session-1',
      sessionStore: store,
      policy: createPolicy(),
      session,
    });

    expect(result.handled).toBe(true);
    expect(session.getModel).toHaveBeenCalled();
    expect(store.get('session-1')?.messages.at(-1)?.content).toBe(
      'Current model: gemini-pro\nQuota: 25 / 100 remaining, resets tomorrow',
    );
  });

  it('handles /model set command to change model', () => {
    const service = createWebSlashCommandService();
    const store = new WebSessionStore();
    const session = createSession();

    const result = service.execute('/model set gemini-flash', {
      sessionId: 'session-1',
      sessionStore: store,
      policy: createPolicy(),
      session,
    });

    expect(result.handled).toBe(true);
    expect(session.setModel).toHaveBeenCalledWith('gemini-flash', false);
    expect(store.get('session-1')?.messages.at(-1)?.content).toBe(
      'Model set to gemini-flash',
    );
  });

  it('handles /model set --persist to persist the model', () => {
    const service = createWebSlashCommandService();
    const store = new WebSessionStore();
    const session = createSession();

    const result = service.execute('/model set gemini-flash --persist', {
      sessionId: 'session-1',
      sessionStore: store,
      policy: createPolicy(),
      session,
    });

    expect(result.handled).toBe(true);
    expect(session.setModel).toHaveBeenCalledWith('gemini-flash', true);
    expect(store.get('session-1')?.messages.at(-1)?.content).toBe(
      'Model set to gemini-flash (persisted)',
    );
  });

  it('rejects malformed /model set commands', () => {
    const service = createWebSlashCommandService();
    const store = new WebSessionStore();
    const session = createSession();

    const result = service.execute('/model set --persist', {
      sessionId: 'session-1',
      sessionStore: store,
      policy: createPolicy(),
      session,
    });

    expect(result).toEqual({
      handled: true,
      command: 'model',
      status: 'error',
      message: 'Usage: /model set <model-name> [--persist]',
    });
    expect(session.setModel).not.toHaveBeenCalled();
    expect(store.get('session-1')?.messages.at(-1)?.content).toBe(
      'Usage: /model set <model-name> [--persist]',
    );
  });
});
