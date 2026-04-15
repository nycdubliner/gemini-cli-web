/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiCliSession } from '@google/gemini-cli-sdk';
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
  session: GeminiCliSession;
}

type SlashCommandHandler = (
  raw: string,
  context: ExecuteContext,
) => Omit<WebSlashCommandResult, 'handled' | 'command'>;

interface SlashCommandDefinition extends WebSlashCommand {
  handler: SlashCommandHandler;
}

function formatCommandList(commands: readonly WebSlashCommand[]): string {
  const lines: string[] = [];
  const visit = (command: WebSlashCommand) => {
    lines.push(`${command.usage} - ${command.description}`);
    for (const subCommand of command.subCommands ?? []) {
      visit(subCommand);
    }
  };

  commands.forEach(visit);
  return lines.join('\n');
}

function formatQuota(quota: ReturnType<GeminiCliSession['getQuota']>): string {
  if (quota.limit === undefined || quota.remaining === undefined) {
    return '';
  }

  const resetTime = quota.resetTime ? `, resets ${quota.resetTime}` : '';
  return `\nQuota: ${quota.remaining} / ${quota.limit} remaining${resetTime}`;
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
      name: 'model',
      usage: '/model [set <name> [--persist]]',
      description: 'View the current model or set it by name',
      subCommands: [
        {
          name: 'set',
          usage: '/model set <model-name> [--persist]',
          description: 'Set the model to use',
        },
      ],
      handler: (raw, { sessionId, sessionStore, session }) => {
        sessionStore.appendUserMessage(sessionId, raw);

        const [, subCommand, ...args] = raw.trim().split(/\s+/);
        if (subCommand === 'set') {
          const persist = args.includes('--persist');
          const modelName = args.find((part) => part !== '--persist');

          if (!modelName) {
            const message = 'Usage: /model set <model-name> [--persist]';
            sessionStore.appendSystemMessage(sessionId, message);
            return { status: 'error', message };
          }

          session.setModel(modelName, persist);
          const message = `Model set to ${modelName}${persist ? ' (persisted)' : ''}`;
          sessionStore.appendSystemMessage(sessionId, message);
          return { status: 'success', message };
        }

        if (subCommand && subCommand !== 'set') {
          const message = 'Usage: /model [set <model-name> [--persist]]';
          sessionStore.appendSystemMessage(sessionId, message);
          return { status: 'error', message };
        }

        const model = session.getModel();
        const quota = session.getQuota();
        const message = `Current model: ${model}${formatQuota(quota)}`;
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
