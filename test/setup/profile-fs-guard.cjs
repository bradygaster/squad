'use strict';
/**
 * Fail-closed profile guard (CommonJS so it also loads via `NODE_OPTIONS=--require` in every
 * child process a test spawns).
 *
 * Any `fs` / `fs/promises` access — sync, callback or promise — whose path lies under one of
 * the developer's REAL profile roots throws instead of touching the disk:
 *   <real home>/.squad, <real APPDATA>/squad, <real LOCALAPPDATA>/squad,
 *   <real XDG_CONFIG_HOME or ~/.config>/squad, ~/Library/Application Support/squad
 *
 * The roots are computed once by the vitest setup file from the ORIGINAL environment and
 * handed to children through SQUAD_TEST_FORBIDDEN_ROOTS, so a test that fakes HOME/APPDATA
 * for its subprocess still protects the real profile. Reads are refused too: Squad 2.0 must
 * never even look there (see test/profile-squad-tombstone.test.ts).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MARKER = 'SQUAD_TEST_PROFILE_GUARD';

function norm(p) {
  const r = path.resolve(String(p));
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

function computeRoots(env) {
  let home = null;
  try { home = os.homedir(); } catch { home = env.HOME || env.USERPROFILE || null; }
  const roots = [];
  if (home) {
    roots.push(path.join(home, '.squad'));
    roots.push(path.join(home, '.config', 'squad'));
    roots.push(path.join(home, 'Library', 'Application Support', 'squad'));
    roots.push(path.join(home, 'AppData', 'Roaming', 'squad'));
    roots.push(path.join(home, 'AppData', 'Local', 'squad'));
  }
  for (const v of ['APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME']) if (env[v]) roots.push(path.join(env[v], 'squad'));
  return [...new Set(roots.map(norm))];
}

let roots;
if (process.env.SQUAD_TEST_FORBIDDEN_ROOTS) {
  try { roots = JSON.parse(process.env.SQUAD_TEST_FORBIDDEN_ROOTS).map(norm); } catch { roots = computeRoots(process.env); }
} else {
  roots = computeRoots(process.env);
  process.env.SQUAD_TEST_FORBIDDEN_ROOTS = JSON.stringify(roots);
}

function forbidden(p) {
  if (typeof p !== 'string' && !Buffer.isBuffer(p) && !(p instanceof URL)) return false;
  const s = p instanceof URL ? (p.protocol === 'file:' ? decodeURIComponent(p.pathname.replace(/^\/([A-Za-z]:)/, '$1')) : null) : String(p);
  if (s === null) return false;
  const n = norm(s);
  return roots.some((r) => n === r || n.startsWith(r + path.sep));
}

function refuse(op, p) {
  const err = new Error(`${MARKER}: refusing fs.${op} on the real user profile path ${String(p)} — tests must never read or write the developer's profile (redirect SQUAD_HOME/APPDATA/LOCALAPPDATA/XDG_CONFIG_HOME, see test/setup/profile-guard.ts)`);
  err.code = 'EPROFILEGUARD';
  return err;
}

const ONE_PATH = ['access', 'appendFile', 'chmod', 'chown', 'cp', 'exists', 'lstat', 'mkdir', 'mkdtemp', 'open', 'opendir', 'readdir', 'readFile', 'readlink', 'realpath', 'rm', 'rmdir', 'stat', 'statfs', 'truncate', 'unlink', 'utimes', 'writeFile', 'watch', 'watchFile', 'unwatchFile', 'createReadStream', 'createWriteStream', 'symlink'];
const TWO_PATH = ['copyFile', 'cp', 'link', 'rename', 'symlink'];

function wrapSync(target, name, argPositions) {
  const orig = target[name];
  if (typeof orig !== 'function') return;
  const wrapped = function (...args) {
    for (const i of argPositions) if (forbidden(args[i])) throw refuse(name, args[i]);
    return orig.apply(this, args);
  };
  if (orig.native) wrapped.native = function (...args) { for (const i of argPositions) if (forbidden(args[i])) throw refuse(name + '.native', args[i]); return orig.native.apply(this, args); };
  Object.defineProperty(wrapped, 'name', { value: orig.name });
  target[name] = wrapped;
}

function wrapCallback(target, name, argPositions) {
  const orig = target[name];
  if (typeof orig !== 'function') return;
  const wrapped = function (...args) {
    for (const i of argPositions) {
      if (forbidden(args[i])) {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') { process.nextTick(() => cb(refuse(name, args[i]))); return; }
        throw refuse(name, args[i]);
      }
    }
    return orig.apply(this, args);
  };
  if (orig.native) wrapped.native = orig.native;
  Object.defineProperty(wrapped, 'name', { value: orig.name });
  target[name] = wrapped;
}

function wrapPromise(target, name, argPositions) {
  const orig = target[name];
  if (typeof orig !== 'function') return;
  target[name] = async function (...args) {
    for (const i of argPositions) if (forbidden(args[i])) throw refuse(`promises.${name}`, args[i]);
    return orig.apply(this, args);
  };
}

if (!fs[MARKER]) {
  for (const n of ONE_PATH) {
    const positions = TWO_PATH.includes(n) ? [0, 1] : [0];
    wrapSync(fs, n + 'Sync', positions);
    wrapCallback(fs, n, positions);
    if (fs.promises && typeof fs.promises[n] === 'function') wrapPromise(fs.promises, n, positions);
  }
  for (const n of TWO_PATH) {
    wrapSync(fs, n + 'Sync', [0, 1]);
    wrapCallback(fs, n, [0, 1]);
    if (fs.promises && typeof fs.promises[n] === 'function') wrapPromise(fs.promises, n, [0, 1]);
  }
  Object.defineProperty(fs, MARKER, { value: roots, enumerable: false });
}

module.exports = { MARKER, roots, forbidden };
