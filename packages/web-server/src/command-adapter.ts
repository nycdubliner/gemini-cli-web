/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSlashCommand } from './protocol.js';

export interface TerminalSlashCommandLike {
  name: string;
  altNames?: string[];
  description?: string;
  hidden?: boolean;
  subCommands?: TerminalSlashCommandLike[];
}

export type WebCommandExclusionReason =
  | 'terminal-only'
  | 'not-yet-supported'
  | 'web-specific-replacement'
  | 'admin-disabled'
  | 'conditional';

export type WebCommandExclusionMap = Record<string, WebCommandExclusionReason>;

export const WEB_COMMAND_EXCLUSIONS: WebCommandExclusionMap = {
  agents: 'not-yet-supported',
  auth: 'not-yet-supported',
  bug: 'not-yet-supported',
  chat: 'not-yet-supported',
  compress: 'not-yet-supported',
  corgi: 'terminal-only',
  copy: 'not-yet-supported',
  directory: 'not-yet-supported',
  docs: 'not-yet-supported',
  editor: 'not-yet-supported',
  extensions: 'not-yet-supported',
  footer: 'web-specific-replacement',
  hooks: 'not-yet-supported',
  ide: 'not-yet-supported',
  init: 'not-yet-supported',
  mcp: 'not-yet-supported',
  memory: 'not-yet-supported',
  permissions: 'not-yet-supported',
  plan: 'not-yet-supported',
  policies: 'not-yet-supported',
  privacy: 'not-yet-supported',
  profile: 'conditional',
  quit: 'terminal-only',
  restore: 'not-yet-supported',
  resume: 'not-yet-supported',
  rewind: 'not-yet-supported',
  settings: 'not-yet-supported',
  setup_github: 'not-yet-supported',
  'setup-github': 'not-yet-supported',
  shortcuts: 'web-specific-replacement',
  skills: 'not-yet-supported',
  stats: 'not-yet-supported',
  tasks: 'not-yet-supported',
  'terminal-setup': 'terminal-only',
  theme: 'web-specific-replacement',
  tools: 'not-yet-supported',
  upgrade: 'conditional',
  vim: 'terminal-only',
};

export const WEB_COMMAND_OVERRIDES = new Set(['clear', 'model', 'yolo']);

export function getWebCommandPath(
  command: Pick<TerminalSlashCommandLike, 'name'>,
  parentPath = '',
): string {
  return parentPath ? `${parentPath} ${command.name}` : command.name;
}

export function toWebSlashCommand(
  command: TerminalSlashCommandLike,
  parentPath = '',
): WebSlashCommand | undefined {
  if (command.hidden) {
    return undefined;
  }

  const commandPath = getWebCommandPath(command, parentPath);
  return {
    name: command.name,
    description: command.description ?? '',
    usage: `/${commandPath}`,
    ...(command.altNames ? { altNames: command.altNames } : {}),
    ...(command.subCommands
      ? {
          subCommands: command.subCommands
            .map((subCommand) => toWebSlashCommand(subCommand, commandPath))
            .filter((subCommand): subCommand is WebSlashCommand =>
              Boolean(subCommand),
            ),
        }
      : {}),
  };
}

export function toWebSlashCommands(
  commands: readonly TerminalSlashCommandLike[],
): WebSlashCommand[] {
  return commands
    .map((command) => toWebSlashCommand(command))
    .filter((command): command is WebSlashCommand => Boolean(command));
}

export function flattenCommandPaths(
  commands: readonly TerminalSlashCommandLike[],
  parentPath = '',
): string[] {
  return commands.flatMap((command) => {
    if (command.hidden) {
      return [];
    }

    const commandPath = getWebCommandPath(command, parentPath);
    return [
      commandPath,
      ...flattenCommandPaths(command.subCommands ?? [], commandPath),
    ];
  });
}

export function findUndecidedCommandPaths(
  commands: readonly TerminalSlashCommandLike[],
  supportedCommandPaths: ReadonlySet<string>,
  exclusionMap: WebCommandExclusionMap = WEB_COMMAND_EXCLUSIONS,
): string[] {
  return flattenCommandPaths(commands).filter((commandPath) => {
    const topLevelCommand = commandPath.split(/\s+/, 1)[0] ?? commandPath;
    return (
      !supportedCommandPaths.has(commandPath) &&
      !WEB_COMMAND_OVERRIDES.has(topLevelCommand) &&
      exclusionMap[commandPath] === undefined &&
      exclusionMap[topLevelCommand] === undefined
    );
  });
}
