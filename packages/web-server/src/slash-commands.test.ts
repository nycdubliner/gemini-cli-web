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

describe('createWebSlashCommandService', () => {
  it('lists discoverable commands', () => {
    const service = createWebSlashCommandService();

    expect(service.list().map((command) => command.name)).toEqual([
      'help',
      'commands',
      'about',
      'clear',
      'yolo',
    ]);
  });

  it('handles help commands as system transcript messages', () => {
    const service = createWebSlashCommandService();
    const store = new WebSessionStore();

    const result = service.execute('/help', {
      sessionId: 'session-1',
      sessionStore: store,
      policy: createPolicy(),
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBeUndefined();
    expect(store.get('session-1')?.messages).toEqual([
      expect.objectContaining({ role: 'user', content: '/help' }),
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('/commands'),
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
      }),
    ).toEqual({ handled: false });
  });
});
