/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vitest is configured with two environments:
// - node (default): pure domain/property tests (src/domain, src/data, src/services)
// - jsdom: React component tests (src/components) and any *.dom.test.* files
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API routes to the local Cloudflare Pages Functions dev server
    // (`wrangler pages dev` on :8788) so the SPA calls same-origin `/api/*`
    // in development, exactly as in production on Cloudflare Pages.
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    environmentMatchGlobs: [
      ['src/components/**', 'jsdom'],
      ['**/*.dom.test.{ts,tsx}', 'jsdom'],
    ],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
