/**
 * ESM import patcher — repo-local node_modules coverage (#1190)
 *
 * The postinstall patcher used to stop at the first search root that
 * contained vscode-jsonrpc / copilot-sdk. On a global install that root is
 * the global package's own node_modules (already patched), so the consumer
 * repo's node_modules was never reached and `squad doctor` kept failing.
 * These tests pin the all-roots behavior and the `squad upgrade` wiring.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { ensureEsmImportsPatched } from '@bradygaster/squad-cli/core/upgrade';

const SCRIPT_URL = pathToFileURL(
  join(process.cwd(), 'packages', 'squad-cli', 'scripts', 'patch-esm-imports.mjs'),
).href;

interface PatcherModule {
  patchVscodeJsonrpcExports: (searchRoots?: string[]) => boolean;
  patchCopilotSdkSessionJs: (searchRoots?: string[]) => boolean;
}

const UNPATCHED_JSONRPC_PKG = JSON.stringify(
  { name: 'vscode-jsonrpc', version: '8.2.1', main: './lib/node/main.js' },
  null,
  2,
);

const PATCHED_JSONRPC_PKG = JSON.stringify(
  {
    name: 'vscode-jsonrpc',
    version: '8.2.1',
    main: './lib/node/main.js',
    exports: {
      '.': { types: './lib/common/api.d.ts', default: './lib/node/main.js' },
      './node': { node: './lib/node/main.js', types: './lib/node/main.d.ts' },
      './node.js': { node: './lib/node/main.js', types: './lib/node/main.d.ts' },
      './browser': { types: './lib/browser/main.d.ts', browser: './lib/browser/main.js' },
    },
  },
  null,
  2,
);

const BROKEN_SESSION_JS = `import { createMessageConnection } from 'vscode-jsonrpc/node';\nexport { createMessageConnection };\n`;

const TEST_ROOT = join(tmpdir(), `.test-patch-esm-${randomBytes(4).toString('hex')}`);

async function writeJsonrpcPkg(root: string, content: string): Promise<string> {
  const pkgDir = join(root, 'vscode-jsonrpc');
  await mkdir(pkgDir, { recursive: true });
  const pkgPath = join(pkgDir, 'package.json');
  await writeFile(pkgPath, content + '\n');
  return pkgPath;
}

async function writeSessionJs(root: string, content: string): Promise<string> {
  const distDir = join(root, '@github', 'copilot-sdk', 'dist');
  await mkdir(distDir, { recursive: true });
  const sessionPath = join(distDir, 'session.js');
  await writeFile(sessionPath, content);
  return sessionPath;
}

describe('patch-esm-imports — all-roots patching (#1190)', () => {
  let patcher: PatcherModule;

  beforeEach(async () => {
    patcher = await import(SCRIPT_URL) as PatcherModule;
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('patches a later root even when an earlier root is already patched', async () => {
    // Global-install layout: first search root already patched by postinstall,
    // repo-local root (later in the list) still unpatched.
    const globalRoot = join(TEST_ROOT, 'global', 'node_modules');
    const repoRoot = join(TEST_ROOT, 'repo', 'node_modules');
    await writeJsonrpcPkg(globalRoot, PATCHED_JSONRPC_PKG);
    const repoPkgPath = await writeJsonrpcPkg(repoRoot, UNPATCHED_JSONRPC_PKG);

    const patched = patcher.patchVscodeJsonrpcExports([globalRoot, repoRoot]);

    expect(patched).toBe(true);
    const repoPkg = JSON.parse(await readFile(repoPkgPath, 'utf-8')) as { exports?: Record<string, unknown> };
    expect(repoPkg.exports?.['./node.js']).toBeDefined();
  });

  it('patches session.js in a later root even when an earlier root is already patched', async () => {
    const globalRoot = join(TEST_ROOT, 'global', 'node_modules');
    const repoRoot = join(TEST_ROOT, 'repo', 'node_modules');
    await writeSessionJs(globalRoot, 'import { x } from "vscode-jsonrpc/node.js";\n');
    const repoSessionPath = await writeSessionJs(repoRoot, BROKEN_SESSION_JS);

    const patched = patcher.patchCopilotSdkSessionJs([globalRoot, repoRoot]);

    expect(patched).toBe(true);
    const session = await readFile(repoSessionPath, 'utf-8');
    expect(session).toContain('vscode-jsonrpc/node.js');
    expect(session).not.toMatch(/from\s+["']vscode-jsonrpc\/node["']/);
  });

  it('returns false when every root is already patched (idempotent)', async () => {
    const root = join(TEST_ROOT, 'node_modules');
    await writeJsonrpcPkg(root, PATCHED_JSONRPC_PKG);
    await writeSessionJs(root, 'import { x } from "vscode-jsonrpc/node.js";\n');

    expect(patcher.patchVscodeJsonrpcExports([root])).toBe(false);
    expect(patcher.patchCopilotSdkSessionJs([root])).toBe(false);
  });
});

describe('ensureEsmImportsPatched — squad upgrade wiring (#1190)', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('patches vscode-jsonrpc and session.js under the project node_modules', async () => {
    const nodeModules = join(TEST_ROOT, 'node_modules');
    const pkgPath = await writeJsonrpcPkg(nodeModules, UNPATCHED_JSONRPC_PKG);
    const sessionPath = await writeSessionJs(nodeModules, BROKEN_SESSION_JS);

    const patched = await ensureEsmImportsPatched(TEST_ROOT);

    expect(patched).toBe(true);
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as { exports?: Record<string, unknown> };
    expect(pkg.exports?.['./node.js']).toBeDefined();
    expect(await readFile(sessionPath, 'utf-8')).toContain('vscode-jsonrpc/node.js');
  });

  it('returns false on a second run (nothing left to patch)', async () => {
    const nodeModules = join(TEST_ROOT, 'node_modules');
    await writeJsonrpcPkg(nodeModules, UNPATCHED_JSONRPC_PKG);
    await writeSessionJs(nodeModules, BROKEN_SESSION_JS);

    expect(await ensureEsmImportsPatched(TEST_ROOT)).toBe(true);
    expect(await ensureEsmImportsPatched(TEST_ROOT)).toBe(false);
  });

  it('returns false when the project has no node_modules', async () => {
    expect(await ensureEsmImportsPatched(TEST_ROOT)).toBe(false);
  });
});
