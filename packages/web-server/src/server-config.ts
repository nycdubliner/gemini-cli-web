/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';

export interface WebServerConfig {
  host: string;
  port: number;
  authToken?: string;
  authTokenFile?: string;
  authRequired: boolean;
  allowedOrigin?: string;
}

export interface AuthConfig {
  authRequired: boolean;
  authToken?: string;
  authTokenFile?: string;
  allowedOrigin?: string;
}

export interface RequestAuth {
  authorization?: string;
  token?: string;
}

export function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

export function loadWebServerConfig(env: NodeJS.ProcessEnv): WebServerConfig {
  const host = env['WEB_HOST'] || '127.0.0.1';
  const port = Number(env['PORT'] || 3001);
  const authToken = env['GEMINI_WEB_TOKEN'] || undefined;
  const authTokenFile = env['GEMINI_WEB_TOKEN_FILE'] || undefined;
  const allowedOrigin = env['GEMINI_WEB_ORIGIN'] || undefined;

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env['PORT']}`);
  }

  if (!isLoopbackHost(host) && !authToken && !authTokenFile) {
    throw new Error(
      'GEMINI_WEB_TOKEN or GEMINI_WEB_TOKEN_FILE is required when WEB_HOST is not localhost.',
    );
  }

  return {
    host,
    port,
    authToken,
    authTokenFile,
    authRequired: Boolean(authToken || authTokenFile),
    allowedOrigin,
  };
}

export function getRequestToken(
  authorization?: string,
  requestUrl?: string,
): string | undefined {
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length);
  }

  if (requestUrl) {
    const url = new URL(requestUrl, 'http://localhost');
    return url.searchParams.get('token') ?? undefined;
  }

  return undefined;
}

export function isAuthorized(
  config: AuthConfig,
  request: RequestAuth,
): boolean {
  if (!config.authRequired) {
    return true;
  }

  const token = request.token ?? getRequestToken(request.authorization);
  const expectedToken = resolveAuthToken(config);
  return Boolean(expectedToken && token === expectedToken);
}

export function getCorsAllowOrigin(
  config: AuthConfig,
  requestOrigin: string | undefined,
): string | undefined {
  if (config.allowedOrigin && requestOrigin === config.allowedOrigin) {
    return config.allowedOrigin;
  }

  if (!config.authRequired) {
    return '*';
  }

  return undefined;
}

function resolveAuthToken(config: AuthConfig): string | undefined {
  if (config.authTokenFile) {
    try {
      return readFileSync(config.authTokenFile, 'utf8').trim() || undefined;
    } catch {
      return undefined;
    }
  }

  return config.authToken;
}
