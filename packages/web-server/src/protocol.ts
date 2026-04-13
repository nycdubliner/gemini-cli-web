/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ServerGeminiStreamEvent,
  ToolCallsUpdateMessage,
  ToolConfirmationRequest,
  ToolConfirmationOutcome,
} from '@google/gemini-cli-core';

export interface ClientChatMessage {
  type: 'chat';
  text: string;
}

export interface ClientConfirmationResponse {
  type: 'confirmation_response';
  correlationId: string;
  confirmed: boolean;
  outcome?: ToolConfirmationOutcome;
}

export type ClientMessage = ClientChatMessage | ClientConfirmationResponse;

export interface WebTranscriptMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

export interface WebSlashCommand {
  name: string;
  description: string;
  usage: string;
  altNames?: string[];
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

export interface ServerSlashCommandMessage {
  type: 'slash_command';
  payload: {
    command: string;
    status: 'success' | 'error';
    message: string;
    action?: 'clear';
  };
}

export interface ServerGeminiEventMessage {
  type: 'gemini_event';
  payload: ServerGeminiStreamEvent;
}

export interface ServerConfirmationRequestMessage {
  type: 'confirmation_request';
  payload: ToolConfirmationRequest;
}

export interface ServerToolCallsUpdateMessage {
  type: 'tool_calls_update';
  payload: Omit<ToolCallsUpdateMessage, 'type'>;
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
  | ServerSlashCommandMessage
  | ServerGeminiEventMessage
  | ServerConfirmationRequestMessage
  | ServerToolCallsUpdateMessage
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

function isToolConfirmationOutcome(
  value: unknown,
): value is ToolConfirmationOutcome {
  return (
    value === 'proceed_once' ||
    value === 'proceed_always' ||
    value === 'proceed_always_and_save' ||
    value === 'proceed_always_server' ||
    value === 'proceed_always_tool' ||
    value === 'modify_with_editor' ||
    value === 'cancel'
  );
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
      ...(isToolConfirmationOutcome(parsed['outcome'])
        ? { outcome: parsed['outcome'] }
        : {}),
    };
  }

  throw new Error('Invalid client message.');
}
