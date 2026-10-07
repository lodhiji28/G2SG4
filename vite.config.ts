/// <reference types="vite/client" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * Dev + preview config.
 *
 * - `/api` is proxied to the local API server (`node server.js`, :8787) so the
 *   browser only ever talks to ONE origin (no CORS, no localhost calls from
 *   the client) and the same relative URLs work unchanged in production.
 * - `allowedHosts` keeps the sandbox/live-preview hostname working.
 */
export default defineConfig(() => {
  const apiTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8787';
  const disableHmr = process.env.DISABLE_HMR === 'true';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: false,
      hmr: disableHmr ? false : true,
      watch: disableHmr ? null : {},
      allowedHosts: ['.e2b.app', 'e2b.app', '.localhost'],
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false,
          ws: false,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: ['.e2b.app', 'e2b.app'],
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
      },
    },
    build: {
      target: 'es2022',
      cssCodeSplit: true,
      reportCompressedSize: true,
      // Kept in ONE JS chunk on purpose: for a public site the 108 KB gzipped
      // bundle is cached by the CDN/browser for a month, so splitting it only
      // adds requests without adding speed.
      assetsInlineLimit: 4096,
    },
  };
});
