/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  lstat,
  opendir,
  readFile,
  readdir,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import {
  REFERENCE_CONTENT_END,
  REFERENCE_CONTENT_START,
} from '@google/gemini-cli-core';

const SKIPPED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);
const MAX_SEARCH_ENTRIES = 3000;
const MAX_SEARCH_RESULTS = 25;
const MAX_PREVIEW_BYTES = 64 * 1024;
const MAX_REFERENCE_FILE_BYTES = 256 * 1024;
const MAX_REFERENCE_TOTAL_BYTES = 1024 * 1024;
const MAX_DIRECTORY_FILES = 25;

export interface WorkspaceReference {
  path: string;
  type: 'file' | 'directory';
}

export interface WorkspaceReferencePreview extends WorkspaceReference {
  content: string;
  truncated: boolean;
}

export interface ProcessedFileReferences {
  prompt: string;
  references: WorkspaceReference[];
}

interface ParsedReference {
  raw: string;
  path: string;
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

function unescapeReferencePath(value: string): string {
  const unquoted =
    value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  return unquoted.replace(/\\([\\\s])/g, '$1');
}

function parseReferences(prompt: string): ParsedReference[] {
  const regex =
    /(?<!\\)@(?:"([^"]+)"|((?:\\.|[^\s,;!?()[\]{}])+))/g;
  const references: ParsedReference[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(prompt)) !== null) {
    const value = match[1] ?? match[2] ?? '';
    const resolvedPath = unescapeReferencePath(value);
    if (resolvedPath && !resolvedPath.includes('@')) {
      references.push({
        raw: match[0],
        path: resolvedPath,
      });
    }
  }

  return references;
}

function resolveWorkspacePath(workspace: string, referencePath: string): string {
  const absolutePath = path.resolve(workspace, referencePath);
  const relativePath = path.relative(workspace, absolutePath);
  if (
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath) ||
    relativePath === ''
  ) {
    throw new Error(`Path ${referencePath} is outside the workspace.`);
  }
  return absolutePath;
}

async function collectDirectoryFiles(
  workspace: string,
  directory: string,
): Promise<string[]> {
  const files: string[] = [];

  async function visit(current: string): Promise<void> {
    if (files.length >= MAX_DIRECTORY_FILES) {
      return;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= MAX_DIRECTORY_FILES) {
        return;
      }
      if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(normalizeRelativePath(path.relative(workspace, absolutePath)));
      }
    }
  }

  await visit(directory);
  return files;
}

async function readReferenceContent(
  workspace: string,
  referencePath: string,
): Promise<{ references: WorkspaceReference[]; blocks: string[] }> {
  const absolutePath = resolveWorkspacePath(workspace, referencePath);
  const stats = await stat(absolutePath);

  const references: WorkspaceReference[] = [];
  const pathsToRead = stats.isDirectory()
    ? await collectDirectoryFiles(workspace, absolutePath)
    : [normalizeRelativePath(path.relative(workspace, absolutePath))];

  if (stats.isDirectory()) {
    references.push({
      path: normalizeRelativePath(path.relative(workspace, absolutePath)),
      type: 'directory',
    });
  }

  const blocks: string[] = [];
  let totalBytes = 0;

  for (const relativePath of pathsToRead) {
    const filePath = resolveWorkspacePath(workspace, relativePath);
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      continue;
    }

    const remainingBytes = MAX_REFERENCE_TOTAL_BYTES - totalBytes;
    if (remainingBytes <= 0) {
      break;
    }

    const maxBytes = Math.min(MAX_REFERENCE_FILE_BYTES, remainingBytes);
    const buffer = await readFile(filePath);
    const truncated = buffer.byteLength > maxBytes;
    const content = buffer.subarray(0, maxBytes).toString('utf8');
    totalBytes += Math.min(buffer.byteLength, maxBytes);

    if (!stats.isDirectory()) {
      references.push({ path: relativePath, type: 'file' });
    }

    blocks.push(
      [
        `Content from @${relativePath}:`,
        content,
        truncated ? '[truncated]' : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return { references, blocks };
}

export async function searchWorkspaceReferences(
  workspace: string,
  query: string,
): Promise<WorkspaceReference[]> {
  const normalizedQuery = query.replace(/^@/, '').toLowerCase();
  const results: WorkspaceReference[] = [];
  let visited = 0;

  async function visit(current: string): Promise<void> {
    if (visited >= MAX_SEARCH_ENTRIES || results.length >= MAX_SEARCH_RESULTS) {
      return;
    }

    const dir = await opendir(current);
    for await (const entry of dir) {
      if (
        visited >= MAX_SEARCH_ENTRIES ||
        results.length >= MAX_SEARCH_RESULTS
      ) {
        return;
      }
      visited++;

      if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(current, entry.name);
      const relativePath = normalizeRelativePath(
        path.relative(workspace, absolutePath),
      );
      const entryStats = await lstat(absolutePath);

      if (!normalizedQuery || relativePath.toLowerCase().includes(normalizedQuery)) {
        results.push({
          path: relativePath,
          type: entryStats.isDirectory() ? 'directory' : 'file',
        });
      }

      if (entryStats.isDirectory()) {
        await visit(absolutePath);
      }
    }
  }

  await visit(workspace);
  return results;
}

export async function previewWorkspaceReference(
  workspace: string,
  referencePath: string,
): Promise<WorkspaceReferencePreview> {
  const absolutePath = resolveWorkspacePath(workspace, referencePath);
  const stats = await stat(absolutePath);
  const relativePath = normalizeRelativePath(path.relative(workspace, absolutePath));

  if (stats.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    const content = entries
      .filter((entry) => !entry.name.startsWith('.'))
      .slice(0, 50)
      .map((entry) => `${entry.isDirectory() ? 'dir ' : 'file'} ${entry.name}`)
      .join('\n');
    return {
      path: relativePath,
      type: 'directory',
      content,
      truncated: entries.length > 50,
    };
  }

  const buffer = await readFile(absolutePath);
  return {
    path: relativePath,
    type: 'file',
    content: buffer.subarray(0, MAX_PREVIEW_BYTES).toString('utf8'),
    truncated: buffer.byteLength > MAX_PREVIEW_BYTES,
  };
}

export async function processFileReferences(
  prompt: string,
  workspace: string,
): Promise<ProcessedFileReferences> {
  const parsedReferences = parseReferences(prompt);
  const references: WorkspaceReference[] = [];
  const contentBlocks: string[] = [];

  for (const reference of parsedReferences) {
    try {
      const result = await readReferenceContent(workspace, reference.path);
      references.push(...result.references);
      contentBlocks.push(...result.blocks);
    } catch {
      // Unknown @ references intentionally fall through as normal prompt text,
      // matching CLI behavior for inputs like user@example.com.
    }
  }

  if (contentBlocks.length === 0) {
    return { prompt, references: [] };
  }

  return {
    prompt: [
      prompt,
      REFERENCE_CONTENT_START,
      contentBlocks.join('\n\n'),
      REFERENCE_CONTENT_END,
    ].join('\n'),
    references,
  };
}
