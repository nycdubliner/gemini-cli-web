/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { WebSessionStore } from './session-store.js';

describe('WebSessionStore', () => {
  it('creates and replays empty sessions', () => {
    const store = new WebSessionStore();

    expect(store.ensure('session-1')).toEqual({
      sessionId: 'session-1',
      messages: [],
    });
    expect(store.get('session-1')).toEqual({
      sessionId: 'session-1',
      messages: [],
    });
  });

  it('tracks user and streaming model messages', () => {
    const store = new WebSessionStore();

    const user = store.appendUserMessage('session-1', 'hello');
    const model = store.startModelMessage('session-1');
    store.appendModelChunk('session-1', model.id, 'hi');
    store.appendModelChunk('session-1', model.id, ' there');
    store.finishModelMessage('session-1', model.id);

    expect(store.get('session-1')?.messages).toEqual([
      expect.objectContaining({
        id: user.id,
        role: 'user',
        content: 'hello',
      }),
      expect.objectContaining({
        id: model.id,
        role: 'model',
        content: 'hi there',
        isStreaming: false,
      }),
    ]);
  });

  it('tracks system messages and clears a session transcript', () => {
    const store = new WebSessionStore();

    store.appendUserMessage('session-1', 'hello');
    const system = store.appendSystemMessage('session-1', 'Transcript cleared.');
    store.clear('session-1');
    store.appendSystemMessage('session-1', 'Ready.');

    expect(system.role).toBe('system');
    expect(store.get('session-1')?.messages).toEqual([
      expect.objectContaining({
        role: 'system',
        content: 'Ready.',
      }),
    ]);
  });

  it('lists sessions by most recent update', () => {
    const store = new WebSessionStore();

    store.appendUserMessage('older', 'one');
    store.appendUserMessage('newer', 'two');

    expect(store.list().map((session) => session.sessionId)).toEqual([
      'newer',
      'older',
    ]);
  });
});
