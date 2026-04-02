#!/usr/bin/env node
/**
 * remove-ps1-shim.mjs — Remove the unsigned squad.ps1 shim on Windows.
 *
 * npm global install creates both squad.cmd and squad.ps1 in the npm prefix.
 * PowerShell prefers .ps1 over .cmd, but blocks unsigned scripts with the
 * default execution policy (Restricted / AllSigned). Removing the .ps1 shim
 * lets PowerShell fall back to squad.cmd, which works fine.
 *
 * Usage:
 *   node node_modules/@bradygaster/squad-cli/scripts/remove-ps1-shim.mjs
 *
 * Or just run in PowerShell:
 *   Remove-Item "$env:APPDATA\npm\squad.ps1"
 *
 * See: https://github.com/bradygaster/squad/issues/758
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

if (process.platform !== 'win32') {
  console.log('ℹ️  Not on Windows — nothing to do.');
  process.exit(0);
}

const npmPrefix = process.env['npm_config_prefix'] ||
  join(process.env['APPDATA'] ?? '', 'npm');
const ps1Path = join(npmPrefix, 'squad.ps1');

if (!existsSync(ps1Path)) {
  console.log(`✅ ${ps1Path} does not exist — no action needed.`);
  process.exit(0);
}

try {
  unlinkSync(ps1Path);
  console.log(`✅ Removed ${ps1Path}`);
  console.log('   PowerShell will now use squad.cmd instead.');
} catch (err) {
  console.error(`❌ Could not remove ${ps1Path}: ${err.message}`);
  console.error('   Try running as Administrator, or manually delete the file.');
  process.exit(1);
}
