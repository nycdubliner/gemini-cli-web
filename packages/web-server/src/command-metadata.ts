/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSlashCommand } from './protocol.js';
import {
  toWebSlashCommands,
  type TerminalSlashCommandLike,
} from './command-adapter.js';

export interface WebCommandMetadataProvider {
  list(signal?: AbortSignal): Promise<WebSlashCommand[]>;
}

function mergeCommandMetadata(
  terminalCommands: readonly WebSlashCommand[],
  webCommands: readonly WebSlashCommand[],
): WebSlashCommand[] {
  const merged = new Map<string, WebSlashCommand>();

  for (const command of terminalCommands) {
    merged.set(command.name, command);
  }

  for (const command of webCommands) {
    merged.set(command.name, command);
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

async function importTerminalCommandServices(): Promise<{
  BuiltinCommandLoader: new (config: null) => {
    loadCommands(signal: AbortSignal): Promise<unknown[]>;
  };
  CommandService: {
    create(
      loaders: Array<{ loadCommands(signal: AbortSignal): Promise<unknown[]> }>,
      signal: AbortSignal,
    ): Promise<{ getCommands(): readonly unknown[] }>;
  };
}> {
  try {
    const [loaderModule, serviceModule] = await Promise.all([
      import('@google/gemini-cli/dist/src/services/BuiltinCommandLoader.js'),
      import('@google/gemini-cli/dist/src/services/CommandService.js'),
    ]);
    return {
      BuiltinCommandLoader: loaderModule.BuiltinCommandLoader,
      CommandService: serviceModule.CommandService,
    };
  } catch {
    const [loaderModule, serviceModule] = await Promise.all([
      import('../../cli/src/services/BuiltinCommandLoader.js'),
      import('../../cli/src/services/CommandService.js'),
    ]);
    return {
      BuiltinCommandLoader: loaderModule.BuiltinCommandLoader,
      CommandService: serviceModule.CommandService,
    };
  }
}

export function createWebCommandMetadataProvider(
  webCommands: () => WebSlashCommand[],
): WebCommandMetadataProvider {
  return {
    async list(signal = new AbortController().signal): Promise<WebSlashCommand[]> {
      const { BuiltinCommandLoader, CommandService } =
        await importTerminalCommandServices();
      const commandService = await CommandService.create(
        [new BuiltinCommandLoader(null)],
        signal,
      );
      return mergeCommandMetadata(
        toWebSlashCommands(
          commandService.getCommands() as readonly TerminalSlashCommandLike[],
        ),
        webCommands(),
      );
    },
  };
}

export function findWebSlashCommand(
  commands: readonly WebSlashCommand[],
  name: string,
): WebSlashCommand | undefined {
  return commands.find(
    (command) =>
      command.name === name || (command.altNames ?? []).includes(name),
  );
}
