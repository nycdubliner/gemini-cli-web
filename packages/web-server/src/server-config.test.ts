/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
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
      authRequired: true,
      allowedOrigin: 'http://example.local:3000',
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
});
