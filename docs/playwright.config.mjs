import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4321/squad/',
    browserName: 'chromium',
    headless: true,
  },
});
