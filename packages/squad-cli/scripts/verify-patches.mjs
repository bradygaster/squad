#!/usr/bin/env node

/**
 * Postinstall Patch Verification
 *
 * Runs after patch-esm-imports.mjs to verify patches applied correctly.
 * Fails loudly at install time (not at runtime) if something is wrong.
 *
 * Checks:
 * 1. vscode-jsonrpc/package.json has exports["./node"] (Layer 1 patch)
 * 2. copilot-sdk session.js has no bare 'vscode-jsonrpc/node' imports (Layer 2 patch)
 *
 * See also: packages/squad-cli/src/cli/commands/doctor.ts (runtime equivalent)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SEARCH_ROOTS = [
  join(__dirname, '..', 'node_modules'),
  join(__dirname, '..', '..', '..', 'node_modules'),
  join(__dirname, '..', '..'),
];

let errors = 0;

// ── Layer 1: vscode-jsonrpc exports ──────────────────────────────────
function verifyJsonrpcExports() {
  for (const root of SEARCH_ROOTS) {
    const pkgPath = join(root, 'vscode-jsonrpc', 'package.json');
    if (!existsSync(pkgPath)) continue;

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

      if (!pkg.exports || !pkg.exports['./node']) {
        console.error(
          '❌ PATCH VERIFICATION FAILED: vscode-jsonrpc/package.json is missing exports["./node"].\n' +
            '   The ESM patch did not apply. Run: node packages/squad-cli/scripts/patch-esm-imports.mjs\n' +
            `   Checked: ${pkgPath}`,
        );
        errors++;
        return;
      }

      console.log('✅ vscode-jsonrpc exports["./node"] verified');
      return;
    } catch (err) {
      console.error(`❌ Failed to read ${pkgPath}: ${err.message}`);
      errors++;
      return;
    }
  }

  // Package not found — may be a minimal install or CI step that doesn't need it
  console.log('⏭️  vscode-jsonrpc not found — skipping exports verification');
}

// ── Layer 2: copilot-sdk session.js imports ──────────────────────────
function verifySdkSessionImports() {
  for (const root of SEARCH_ROOTS) {
    const sessionPath = join(root, '@github', 'copilot-sdk', 'dist', 'session.js');
    if (!existsSync(sessionPath)) continue;

    try {
      const content = readFileSync(sessionPath, 'utf8');
      const bareImports = content.match(/from\s+["']vscode-jsonrpc\/node["']/g);

      if (bareImports && bareImports.length > 0) {
        console.error(
          '❌ PATCH VERIFICATION FAILED: @github/copilot-sdk/dist/session.js still has bare\n' +
            "   'vscode-jsonrpc/node' imports (missing .js extension).\n" +
            '   The ESM patch did not apply. Run: node packages/squad-cli/scripts/patch-esm-imports.mjs\n' +
            `   Checked: ${sessionPath}`,
        );
        errors++;
        return;
      }

      console.log('✅ copilot-sdk session.js imports verified');
      return;
    } catch (err) {
      console.error(`❌ Failed to read ${sessionPath}: ${err.message}`);
      errors++;
      return;
    }
  }

  // File not found — SDK may have restructured internals, which is fine
  // The smoke test (test/sdk-compatibility-smoke.test.ts) catches real breakage
  console.log('⏭️  copilot-sdk/dist/session.js not found — skipping import verification');
}

// ── Run ──────────────────────────────────────────────────────────────
verifyJsonrpcExports();
verifySdkSessionImports();

if (errors > 0) {
  console.error(`\n💥 ${errors} patch verification(s) failed — install cannot continue.`);
  console.error('   Fix: run "node packages/squad-cli/scripts/patch-esm-imports.mjs" then retry.\n');
  process.exit(1);
}
