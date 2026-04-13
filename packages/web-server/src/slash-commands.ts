/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PolicyController } from './policy.js';
import type { WebSlashCommand } from './protocol.js';
import type { WebSessionStore } from './session-store.js';

export type WebSlashCommandAction = 'clear';

export interface WebSlashCommandResult {
  handled: boolean;
  command?: string;
  status?: 'success' | 'error';
  message?: string;
  action?: WebSlashCommandAction;
}

interface ExecuteContext {
  sessionId: string;
  sessionStore: WebSessionStore;
  policy: PolicyController;
}

type SlashCommandHandler = (
  raw: string,
  context: ExecuteContext,
) => Omit<WebSlashCommandResult, 'handled' | 'command'>;

interface SlashCommandDefinition extends WebSlashCommand {
  handler: SlashCommandHandler;
}

function formatCommandList(commands: readonly WebSlashCommand[]): string {
  return commands
    .map((command) => `${command.usage} - ${command.description}`)
    .join('\n');
}

export class WebSlashCommandService {
  constructor(private readonly commands: readonly SlashCommandDefinition[]) {}

  list(): WebSlashCommand[] {
    return this.commands.map(({ handler: _handler, ...command }) => command);
  }

  execute(raw: string, context: ExecuteContext): WebSlashCommandResult {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('/') && trimmed !== '?') {
      return { handled: false };
    }

    const normalized = trimmed === '?' ? '/help' : trimmed;
    const [commandName = ''] = normalized.slice(1).trim().split(/\s+/, 1);
    const command = this.commands.find(
      (item) =>
        item.name === commandName || (item.altNames ?? []).includes(commandName),
    );

    if (!command) {
      return { handled: false };
    }

    const result = command.handler(normalized, context);
    return {
      handled: true,
      command: command.name,
      ...result,
    };
  }
}

export function createWebSlashCommandService(): WebSlashCommandService {
  const commands: SlashCommandDefinition[] = [
    {
      name: 'help',
      altNames: ['?'],
      usage: '/help',
      description: 'Show web CLI slash command help',
      handler: (raw, { sessionId, sessionStore }) => {
        const message = `Available slash commands:\n${formatCommandList(commands)}`;
        sessionStore.appendUserMessage(sessionId, raw);
        sessionStore.appendSystemMessage(sessionId, message);
        return { status: 'success', message };
      },
    },
    {
      name: 'commands',
      usage: '/commands',
      description: 'List available slash commands',
      handler: (raw, { sessionId, sessionStore }) => {
        const message = formatCommandList(commands);
        sessionStore.appendUserMessage(sessionId, raw);
        sessionStore.appendSystemMessage(sessionId, message);
        return { status: 'success', message };
      },
    },
    {
      name: 'about',
      usage: '/about',
      description: 'Show web CLI runtime information',
      handler: (raw, { sessionId, sessionStore, policy }) => {
        const snapshot = policy.snapshot();
        const message = [
          'Gemini CLI Web',
          `Safety mode: ${snapshot.label}`,
          `Session: ${sessionId}`,
        ].join('\n');
        sessionStore.appendUserMessage(sessionId, raw);
        sessionStore.appendSystemMessage(sessionId, message);
        return { status: 'success', message };
      },
    },
    {
      name: 'clear',
      usage: '/clear',
      description: 'Clear this web session transcript',
      handler: (_raw, { sessionId, sessionStore }) => {
        const message = 'Transcript cleared.';
        sessionStore.clear(sessionId);
        sessionStore.appendSystemMessage(sessionId, message);
        return { status: 'success', message, action: 'clear' };
      },
    },
    {
      name: 'yolo',
      usage: '/yolo',
      description: 'Toggle auto-approve mode, equivalent to Ctrl-Y',
      handler: (raw, { sessionId, sessionStore, policy }) => {
        sessionStore.appendUserMessage(sessionId, raw);
        const snapshot = policy.setAllowAll(!policy.snapshot().allowAll);
        const message = `Mode: ${snapshot.label}.`;
        sessionStore.appendSystemMessage(sessionId, message);
        return { status: 'success', message };
      },
    },
  ];

  return new WebSlashCommandService(commands);
}
