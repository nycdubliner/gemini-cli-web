/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getCorsAllowOrigin,
  getRequestToken,
  isAuthorized,
  loadWebServerConfig,
} from './server-config.js';

describe('loadWebServerConfig', () => {
  it('uses localhost without auth by default', () => {
    expect(loadWebServerConfig({})).toEqual({
      host: '127.0.0.1',
      port: 3001,
      authToken: undefined,
      authTokenFile: undefined,
      authRequired: false,
      allowedOrigin: undefined,
    });
  });

  it('requires a token for LAN binding', () => {
    expect(() => loadWebServerConfig({ WEB_HOST: '0.0.0.0' })).toThrow(
      /GEMINI_WEB_TOKEN/,
    );
  });

  it('allows LAN binding when a token is configured', () => {
    expect(
      loadWebServerConfig({
        WEB_HOST: '0.0.0.0',
        PORT: '3001',
        GEMINI_WEB_TOKEN: 'secret',
        GEMINI_WEB_ORIGIN: 'http://example.local:3000',
      }),
    ).toEqual({
      host: '0.0.0.0',
      port: 3001,
      authToken: 'secret',
      authTokenFile: undefined,
      authRequired: true,
      allowedOrigin: 'http://example.local:3000',
    });
  });

  it('supports token files for reloadable LAN tokens', () => {
    expect(
      loadWebServerConfig({
        WEB_HOST: '0.0.0.0',
        GEMINI_WEB_TOKEN_FILE: '/tmp/gemini-web-token',
      }),
    ).toEqual({
      host: '0.0.0.0',
      port: 3001,
      authToken: undefined,
      authTokenFile: '/tmp/gemini-web-token',
      authRequired: true,
      allowedOrigin: undefined,
    });
  });
});

describe('request auth helpers', () => {
  it('accepts localhost requests when auth is not configured', () => {
    expect(
      isAuthorized({ authRequired: false }, { authorization: undefined }),
    ).toBe(true);
  });

  it('requires a matching bearer token when auth is configured', () => {
    const config = { authRequired: true, authToken: 'secret' };

    expect(isAuthorized(config, { authorization: 'Bearer wrong' })).toBe(false);
    expect(isAuthorized(config, { authorization: 'Bearer secret' })).toBe(true);
  });

  it('reads websocket tokens from the query string', () => {
    expect(getRequestToken(undefined, '/ws/session?token=secret')).toBe(
      'secret',
    );
  });

  it('reloads tokens from a token file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gemini-token-'));
    const tokenFile = path.join(dir, 'token');
    await writeFile(tokenFile, 'first\n');

    const config = { authRequired: true, authTokenFile: tokenFile };
    expect(isAuthorized(config, { authorization: 'Bearer first' })).toBe(true);

    await writeFile(tokenFile, 'second\n');
    expect(isAuthorized(config, { authorization: 'Bearer first' })).toBe(false);
    expect(isAuthorized(config, { authorization: 'Bearer second' })).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('getCorsAllowOrigin', () => {
  it('allows wildcard CORS only when auth is disabled', () => {
    expect(
      getCorsAllowOrigin({ authRequired: false }, 'http://example.com'),
    ).toBe('*');
  });

  it('allows the configured origin', () => {
    expect(
      getCorsAllowOrigin(
        { authRequired: true, allowedOrigin: 'http://example.com' },
        'http://example.com',
      ),
    ).toBe('http://example.com');
  });

  it('does not allow arbitrary origins in authenticated LAN mode', () => {
    expect(
      getCorsAllowOrigin({ authRequired: true }, 'http://evil.example'),
    ).toBeUndefined();
  });
});
