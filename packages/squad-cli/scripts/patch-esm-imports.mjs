#!/usr/bin/env node

/**
 * ESM Import Patcher — dual-layer fix for Node 22/24+ compatibility
 *
 * Layer 1: Patch vscode-jsonrpc/package.json with `exports` field
 *   vscode-jsonrpc@8.2.1 has no `exports` field. Node 22+ strict ESM
 *   rejects subpath imports like 'vscode-jsonrpc/node' without it.
 *   Injecting the exports map from v9.x fixes ALL subpath imports at once.
 *
 * Layer 2: Patch @github/copilot-sdk session.js (defense-in-depth)
 *   copilot-sdk@0.1.32 imports 'vscode-jsonrpc/node' without .js extension.
 *   This layer ensures the import works even if Layer 1 somehow fails.
 *
 * Issue: bradygaster/squad#449
 * Upstream: https://github.com/github/copilot-sdk/issues/707
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Locations where npm workspaces / global install may place dependencies
const SEARCH_ROOTS = [
  join(__dirname, '..', 'node_modules'),              // squad-cli local
  join(__dirname, '..', '..', '..', 'node_modules'),  // workspace root
  join(__dirname, '..', '..'),                         // global install (sibling)
];

/**
 * Layer 1 — Inject `exports` field into vscode-jsonrpc/package.json.
 * This is the canonical fix: once the package has proper exports, Node's
 * ESM resolver handles every subpath ('vscode-jsonrpc/node', '/browser', etc.)
 * without needing per-file patches.
 */
function patchVscodeJsonrpcExports() {
  const exportsField = {
    '.': { types: './lib/common/api.d.ts', default: './lib/node/main.js' },
    './node': { node: './lib/node/main.js', types: './lib/node/main.d.ts' },
    './node.js': { node: './lib/node/main.js', types: './lib/node/main.d.ts' },
    './browser': { types: './lib/browser/main.d.ts', browser: './lib/browser/main.js' },
  };

  for (const root of SEARCH_ROOTS) {
    const pkgPath = join(root, 'vscode-jsonrpc', 'package.json');
    if (!existsSync(pkgPath)) continue;

    try {
      const raw = readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw);

      if (pkg.exports) {
        console.log('⏭️  vscode-jsonrpc already has exports field — skipping');
        return false;
      }

      pkg.exports = exportsField;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      console.log('✅ Patched vscode-jsonrpc/package.json with exports field (Node 22/24+ ESM fix)');
      return true;
    } catch (err) {
      console.warn('⚠️  Failed to patch vscode-jsonrpc exports:', err.message);
      return false;
    }
  }

  return false;
}

/**
 * Layer 2 — Patch copilot-sdk session.js import (defense-in-depth).
 * Rewrites extensionless 'vscode-jsonrpc/node' to 'vscode-jsonrpc/node.js'.
 */
function patchCopilotSdkSessionJs() {
  for (const root of SEARCH_ROOTS) {
    const sessionJsPath = join(root, '@github', 'copilot-sdk', 'dist', 'session.js');
    if (!existsSync(sessionJsPath)) continue;

    try {
      const content = readFileSync(sessionJsPath, 'utf8');

      const patched = content.replace(
        /from\s+["']vscode-jsonrpc\/node["']/g,
        'from "vscode-jsonrpc/node.js"'
      );

      if (patched !== content) {
        writeFileSync(sessionJsPath, patched, 'utf8');
        console.log('✅ Patched @github/copilot-sdk session.js ESM imports');
        return true;
      }
      return false;
    } catch (err) {
      console.warn('⚠️  Failed to patch copilot-sdk session.js:', err.message);
      return false;
    }
  }

  return false;
}

// Run both layers
patchVscodeJsonrpcExports();
patchCopilotSdkSessionJs();