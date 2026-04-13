/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  previewWorkspaceReference,
  processFileReferences,
  searchWorkspaceReferences,
} from './file-references.js';

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'gemini-web-refs-'));
  await mkdir(path.join(workspace, 'src'), { recursive: true });
  await mkdir(path.join(workspace, 'node_modules', 'ignored'), {
    recursive: true,
  });
  await writeFile(path.join(workspace, 'README.md'), 'Root readme');
  await writeFile(path.join(workspace, 'src', 'app.ts'), 'export const app = 1;');
  await writeFile(
    path.join(workspace, 'node_modules', 'ignored', 'pkg.js'),
    'ignored',
  );
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('searchWorkspaceReferences', () => {
  it('finds workspace paths while skipping generated directories', async () => {
    const results = await searchWorkspaceReferences(workspace, 'app');

    expect(results).toEqual([
      expect.objectContaining({
        path: 'src/app.ts',
        type: 'file',
      }),
    ]);
    expect(results.some((result) => result.path.includes('node_modules'))).toBe(
      false,
    );
  });
});

describe('previewWorkspaceReference', () => {
  it('previews files inside the workspace', async () => {
    await expect(
      previewWorkspaceReference(workspace, 'src/app.ts'),
    ).resolves.toEqual({
      path: 'src/app.ts',
      type: 'file',
      content: 'export const app = 1;',
      truncated: false,
    });
  });

  it('rejects traversal outside the workspace', async () => {
    await expect(
      previewWorkspaceReference(workspace, '../secret.txt'),
    ).rejects.toThrow(/outside the workspace/);
  });
});

describe('processFileReferences', () => {
  it('appends referenced file content to the Gemini prompt', async () => {
    const result = await processFileReferences(
      'Explain @src/app.ts now',
      workspace,
    );

    expect(result.references).toEqual([
      expect.objectContaining({ path: 'src/app.ts', type: 'file' }),
    ]);
    expect(result.prompt).toContain('Explain @src/app.ts now');
    expect(result.prompt).toContain('--- Content from referenced files ---');
    expect(result.prompt).toContain('Content from @src/app.ts:');
    expect(result.prompt).toContain('export const app = 1;');
  });

  it('leaves prompts without existing references unchanged', async () => {
    const result = await processFileReferences('Email user@example.com', workspace);

    expect(result.references).toEqual([]);
    expect(result.prompt).toBe('Email user@example.com');
  });
});
