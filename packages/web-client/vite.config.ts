/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.WEB_CLIENT_HOST || process.env.WEB_HOST || '127.0.0.1',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'ECONNREFUSED') {
              // Ignore initial connection errors while server is booting
              return;
            }
            console.error('proxy error', err);
          });
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'ECONNREFUSED') {
              return;
            }
            console.error('ws proxy error', err);
          });
        },
      },
    },
  },
});
