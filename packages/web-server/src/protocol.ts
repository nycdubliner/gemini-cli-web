/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ServerGeminiStreamEvent,
  ToolConfirmationRequest,
} from '@google/gemini-cli-core';

export interface ClientChatMessage {
  type: 'chat';
  text: string;
}

export interface ClientConfirmationResponse {
  type: 'confirmation_response';
  correlationId: string;
  confirmed: boolean;
}

export type ClientMessage = ClientChatMessage | ClientConfirmationResponse;

export interface WebTranscriptMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

export interface WebSessionSummary {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface WebSessionState {
  sessionId: string;
  messages: WebTranscriptMessage[];
}

export interface ServerSessionStateMessage {
  type: 'session_state';
  payload: WebSessionState;
}

export interface ServerGeminiEventMessage {
  type: 'gemini_event';
  payload: ServerGeminiStreamEvent;
}

export interface ServerConfirmationRequestMessage {
  type: 'confirmation_request';
  payload: ToolConfirmationRequest;
}

export interface ServerStreamEndMessage {
  type: 'stream_end';
}

export interface ServerErrorMessage {
  type: 'error';
  error: string;
}

export type ServerMessage =
  | ServerSessionStateMessage
  | ServerGeminiEventMessage
  | ServerConfirmationRequestMessage
  | ServerStreamEndMessage
  | ServerErrorMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function parseClientMessage(data: string): ClientMessage {
  const parsed: unknown = JSON.parse(data);

  if (!isRecord(parsed) || !isString(parsed['type'])) {
    throw new Error('Invalid client message.');
  }

  if (parsed['type'] === 'chat' && isString(parsed['text'])) {
    return { type: 'chat', text: parsed['text'] };
  }

  if (
    parsed['type'] === 'confirmation_response' &&
    isString(parsed['correlationId']) &&
    isBoolean(parsed['confirmed'])
  ) {
    return {
      type: 'confirmation_response',
      correlationId: parsed['correlationId'],
      confirmed: parsed['confirmed'],
    };
  }

  throw new Error('Invalid client message.');
}
