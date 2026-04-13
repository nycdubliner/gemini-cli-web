/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  WebSessionState,
  WebSessionSummary,
  WebTranscriptMessage,
} from './protocol.js';

interface StoredSession {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  updateOrder: number;
  messages: WebTranscriptMessage[];
}

export class WebSessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private nextMessageId = 1;
  private nextUpdateOrder = 1;

  ensure(sessionId: string): WebSessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return this.toState(existing);
    }

    const now = new Date().toISOString();
    const session: StoredSession = {
      sessionId,
      createdAt: now,
      updatedAt: now,
      updateOrder: this.nextUpdateOrder++,
      messages: [],
    };
    this.sessions.set(sessionId, session);
    return this.toState(session);
  }

  list(): WebSessionSummary[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updateOrder - a.updateOrder)
      .map((session) => ({
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
      }));
  }

  get(sessionId: string): WebSessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    return this.toState(session);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  appendUserMessage(sessionId: string, content: string): WebTranscriptMessage {
    return this.appendMessage(sessionId, {
      role: 'user',
      content,
    });
  }

  appendSystemMessage(sessionId: string, content: string): WebTranscriptMessage {
    return this.appendMessage(sessionId, {
      role: 'system',
      content,
    });
  }

  clear(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.messages = [];
    session.updatedAt = new Date().toISOString();
    session.updateOrder = this.nextUpdateOrder++;
  }

  startModelMessage(sessionId: string): WebTranscriptMessage {
    return this.appendMessage(sessionId, {
      role: 'model',
      content: '',
      isStreaming: true,
    });
  }

  appendModelChunk(
    sessionId: string,
    messageId: string,
    chunk: string,
  ): WebTranscriptMessage | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const message = session.messages.find((item) => item.id === messageId);
    if (!message) {
      return undefined;
    }

    message.content += chunk;
    session.updatedAt = new Date().toISOString();
    session.updateOrder = this.nextUpdateOrder++;
    return { ...message };
  }

  finishModelMessage(sessionId: string, messageId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const message = session.messages.find((item) => item.id === messageId);
    if (message) {
      message.isStreaming = false;
      session.updatedAt = new Date().toISOString();
      session.updateOrder = this.nextUpdateOrder++;
    }
  }

  private appendMessage(
    sessionId: string,
    message: Omit<WebTranscriptMessage, 'id' | 'createdAt'>,
  ): WebTranscriptMessage {
    const session = this.sessions.get(sessionId) ?? this.create(sessionId);
    const now = new Date().toISOString();
    const stored: WebTranscriptMessage = {
      id: String(this.nextMessageId++),
      createdAt: now,
      ...message,
    };
    session.messages.push(stored);
    session.updatedAt = now;
    session.updateOrder = this.nextUpdateOrder++;
    return { ...stored };
  }

  private create(sessionId: string): StoredSession {
    const now = new Date().toISOString();
    const session: StoredSession = {
      sessionId,
      createdAt: now,
      updatedAt: now,
      updateOrder: this.nextUpdateOrder++,
      messages: [],
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  private toState(session: StoredSession): WebSessionState {
    return {
      sessionId: session.sessionId,
      messages: session.messages.map((message) => ({ ...message })),
    };
  }
}
