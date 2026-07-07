/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vitest is configured with two environments:
// - node (default): pure domain/property tests (src/domain, src/data, src/services)
// - jsdom: React component tests (src/components) and any *.dom.test.* files
export default defineConfig({
  plugins: [react()],
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
