/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiCliAgent } from '@google/gemini-cli-sdk';
import { ApprovalMode } from '@google/gemini-cli-core';
import { describe, expect, it, vi } from 'vitest';
import { createWebServer } from './index.js';
import type { PolicyController } from './policy.js';

describe('createWebServer', () => {
  it('registers routes without throwing', () => {
    const agent = {
      session: vi.fn(),
      resumeSession: vi.fn(),
    } as unknown as GeminiCliAgent;
    const policy: PolicyController = {
      snapshot: () => ({
        allowAll: false,
        approvalMode: ApprovalMode.DEFAULT,
        label: 'Safe',
      }),
      setAllowAll: vi.fn(),
      addSession: vi.fn(() => vi.fn()),
    };

    const server = createWebServer({
      agent,
      config: {
        host: '127.0.0.1',
        port: 3001,
        authRequired: false,
      },
      cwd: process.cwd(),
      policy,
    });

    expect(server.listening).toBe(false);
    server.close();
  });
});
