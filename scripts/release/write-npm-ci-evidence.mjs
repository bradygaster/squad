#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const [command, rootExit, docsExit, sourceSha] = process.argv.slice(2);
if (!command || !sourceSha) throw new Error('usage: write-npm-ci-evidence.mjs <command> <root-exit> <docs-exit> <source-sha>');
const result = {
  command,
  env: {
    HOME: '<isolated temp>',
    NPM_CONFIG_USERCONFIG: '<empty file>',
    NPM_CONFIG_CACHE: '<fresh temp>',
  },
  lockfileRepair: 'none (committed lockfiles used as-is)',
  commit: sourceSha,
  root: { cwd: '.', exitCode: Number(rootExit) },
  docs: { cwd: 'docs', exitCode: Number(docsExit) },
  node: process.version,
  npm: execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8' }).trim(),
  recordedAt: new Date().toISOString(),
};
writeFileSync(path.join(process.env.EVIDENCE_DIR, 'npm-ci.json'), `${JSON.stringify(result, null, 2)}\n`);
