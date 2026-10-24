'use strict';
/**
 * fs access logger for the upgrade matrix (loaded into spawned Squad 2.0 CLI processes via
 * `NODE_OPTIONS=--require`). Records every `node:fs` call — sync, callback and promise APIs —
 * whose path argument resolves under `SQUAD_MATRIX_FS_WATCH_ROOT`, appending one line per hit to
 * `SQUAD_MATRIX_FS_WATCH_LOG`. The matrix asserts that log is empty for the retired user-profile
 * tree: the sha256 fingerprint already proves no writes; this proves no reads or existence probes.
 *
 * Plain CommonJS, Node built-ins only: it must load before anything else in the target process.
 */
const fs = require('fs');
const path = require('path');
const { syncBuiltinESMExports } = require('module');

const root = process.env.SQUAD_MATRIX_FS_WATCH_ROOT;
const log = process.env.SQUAD_MATRIX_FS_WATCH_LOG;
if (root && log) {
  const prefix = path.resolve(root).toLowerCase() + path.sep;
  const inside = (p) => {
    if (typeof p !== 'string' && !Buffer.isBuffer(p) && !(p instanceof URL)) return false;
    try {
      const s = p instanceof URL ? require('url').fileURLToPath(p) : p.toString();
      const abs = path.resolve(s).toLowerCase();
      return abs === prefix.slice(0, -1) || abs.startsWith(prefix);
    } catch { return false; }
  };
  const record = (api, args) => {
    const hit = args.find(inside);
    if (hit === undefined) return;
    try { fs.appendFileSync(log, `${process.pid} ${api}(${String(hit)})\n`); } catch { /* never break the CLI */ }
  };
  const wrap = (obj, name, label) => {
    const original = obj[name];
    if (typeof original !== 'function') return;
    const wrapped = function (...args) { record(`${label}.${name}`, args.slice(0, 2)); return original.apply(this, args); };
    Object.defineProperty(wrapped, 'name', { value: original.name });
    obj[name] = wrapped;
  };
  const names = [
    'access', 'appendFile', 'chmod', 'chown', 'copyFile', 'cp', 'exists', 'lstat', 'mkdir', 'mkdtemp', 'open', 'opendir',
    'readdir', 'readFile', 'readlink', 'realpath', 'rename', 'rm', 'rmdir', 'stat', 'statfs', 'symlink', 'truncate',
    'unlink', 'utimes', 'writeFile', 'createReadStream', 'createWriteStream', 'watch', 'watchFile',
  ];
  for (const n of names) {
    wrap(fs, n, 'fs');
    wrap(fs, `${n}Sync`, 'fs');
    wrap(fs.promises, n, 'fs.promises');
  }
  if (fs.realpath && fs.realpath.native) wrap(fs.realpath, 'native', 'fs.realpath');
  if (fs.realpathSync && fs.realpathSync.native) wrap(fs.realpathSync, 'native', 'fs.realpathSync');
  syncBuiltinESMExports();
}
