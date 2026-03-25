import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Force vitest to resolve @bradygaster/squad-sdk from the workspace root,
    // not from a duplicate copy under packages/squad-cli/node_modules/.
    // Without this, vi.mock('@bradygaster/squad-sdk') targets the root copy
    // but the code under test imports from the duplicate — bypassing the mock.
    dedupe: ['@bradygaster/squad-sdk'],
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**'],
    },
  },
});
