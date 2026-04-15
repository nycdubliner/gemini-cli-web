/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  findUndecidedCommandPaths,
  toWebSlashCommand,
  toWebSlashCommands,
  WEB_COMMAND_EXCLUSIONS,
  WEB_COMMAND_OVERRIDES,
  type TerminalSlashCommandLike,
} from './command-adapter.js';

describe('command adapter', () => {
  it('converts terminal command metadata into web slash command metadata', () => {
    expect(
      toWebSlashCommand({
        name: 'memory',
        altNames: ['mem'],
        description: 'Manage memory',
        subCommands: [
          {
            name: 'show',
            description: 'Show memory',
          },
          {
            name: 'add',
            description: 'Add memory',
          },
        ],
      }),
    ).toEqual({
      name: 'memory',
      altNames: ['mem'],
      description: 'Manage memory',
      usage: '/memory',
      subCommands: [
        {
          name: 'show',
          description: 'Show memory',
          usage: '/memory show',
        },
        {
          name: 'add',
          description: 'Add memory',
          usage: '/memory add',
        },
      ],
    });
  });

  it('omits hidden commands and hidden subcommands', () => {
    expect(
      toWebSlashCommands([
        {
          name: 'visible',
          description: 'Visible command',
          subCommands: [
            { name: 'show', description: 'Show visible command' },
            { name: 'debug', description: 'Debug visible command', hidden: true },
          ],
        },
        {
          name: 'hidden',
          description: 'Hidden command',
          hidden: true,
        },
      ]),
    ).toEqual([
      {
        name: 'visible',
        description: 'Visible command',
        usage: '/visible',
        subCommands: [
          {
            name: 'show',
            description: 'Show visible command',
            usage: '/visible show',
          },
        ],
      },
    ]);
  });

  it('defaults missing descriptions to an empty string', () => {
    expect(toWebSlashCommand({ name: 'about' })).toEqual({
      name: 'about',
      description: '',
      usage: '/about',
    });
  });

  it('reports terminal command paths without support or explicit exclusions', () => {
    const terminalCommands: TerminalSlashCommandLike[] = [
      {
        name: 'stats',
        description: 'Show stats',
        subCommands: [{ name: 'model', description: 'Show model stats' }],
      },
      {
        name: 'theme',
        description: 'Terminal theme dialog',
      },
      {
        name: 'memory',
        description: 'Manage memory',
      },
      {
        name: 'clear',
        description: 'Clear screen',
      },
    ];

    expect(
      findUndecidedCommandPaths(
        terminalCommands,
        new Set(['stats', 'stats model']),
        { theme: 'web-specific-replacement' },
      ),
    ).toEqual(['memory']);
  });

  it('has explicit parity decisions for current terminal built-ins', () => {
    const currentTerminalBuiltIns: TerminalSlashCommandLike[] = [
      { name: 'about' },
      { name: 'agents' },
      { name: 'auth' },
      { name: 'bug' },
      { name: 'chat', subCommands: [{ name: 'list' }, { name: 'resume' }] },
      { name: 'clear' },
      { name: 'commands' },
      { name: 'compress' },
      { name: 'copy' },
      { name: 'corgi' },
      { name: 'directory' },
      { name: 'docs' },
      { name: 'editor' },
      { name: 'extensions' },
      { name: 'footer' },
      { name: 'help' },
      { name: 'hooks' },
      { name: 'ide' },
      { name: 'init' },
      { name: 'mcp' },
      { name: 'memory' },
      { name: 'model' },
      { name: 'permissions' },
      { name: 'plan' },
      { name: 'policies' },
      { name: 'privacy' },
      { name: 'profile' },
      { name: 'quit' },
      { name: 'restore' },
      { name: 'resume' },
      { name: 'rewind' },
      { name: 'settings' },
      { name: 'setup-github' },
      { name: 'shortcuts' },
      { name: 'skills' },
      { name: 'stats' },
      { name: 'tasks' },
      { name: 'terminal-setup' },
      { name: 'theme' },
      { name: 'tools' },
      { name: 'upgrade' },
      { name: 'vim' },
    ];
    const supported = new Set([
      'about',
      'commands',
      'help',
    ]);

    expect(
      findUndecidedCommandPaths(
        currentTerminalBuiltIns,
        supported,
        WEB_COMMAND_EXCLUSIONS,
      ).filter((path) => !WEB_COMMAND_OVERRIDES.has(path)),
    ).toEqual([]);
  });
});
