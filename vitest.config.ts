import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve CLI shell-metrics to source so vi.mock('@bradygaster/squad-sdk')
      // intercepts correctly. Without this, npm ci may install a duplicate squad-sdk
      // under squad-cli/node_modules which bypasses the mock.
      '@bradygaster/squad-cli/shell/shell-metrics': path.resolve(__dirname, 'packages/squad-cli/src/cli/shell/shell-metrics.ts'),
    },
    // Force vitest to resolve @bradygaster/squad-sdk from the workspace root,
    // not from a duplicate copy under packages/squad-cli/node_modules/.
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
