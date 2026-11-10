import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';

// Local settings (for TEST_DATABASE_URL); existing variables are not overridden.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
