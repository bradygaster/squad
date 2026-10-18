import path from 'node:path';
import { defineConfig } from 'vitest/config';

const sdkSrc = path.resolve(__dirname, 'packages/squad-sdk/src');

export default defineConfig({
  resolve: {
    // Resolve the Squad 2.0 SDK entrypoints from source so tests run without a built dist.
    alias: [
      { find: /^@bradygaster\/squad-sdk\/client$/, replacement: path.join(sdkSrc, 'client/index.ts') },
      { find: /^@bradygaster\/squad-sdk\/clients$/, replacement: path.join(sdkSrc, 'clients/index.ts') },
      { find: /^@bradygaster\/squad-sdk\/casting$/, replacement: path.join(sdkSrc, 'casting/index.ts') },
      { find: /^@bradygaster\/squad-sdk\/backend$/, replacement: path.join(sdkSrc, 'backend/index.ts') },
      { find: /^@bradygaster\/squad-sdk$/, replacement: path.join(sdkSrc, 'index.ts') },
    ],
    // Force vitest to resolve @bradygaster/squad-sdk from the workspace root,
    // not from a duplicate copy under packages/squad-cli/node_modules/.
    // Without this, vi.mock('@bradygaster/squad-sdk') targets the root copy
    // but the code under test imports from the duplicate — bypassing the mock.
    dedupe: ['@bradygaster/squad-sdk'],
  },
  test: {
    include: ['test/**/*.test.ts', 'packages/squad-sdk/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**'],
    },
  },
});
