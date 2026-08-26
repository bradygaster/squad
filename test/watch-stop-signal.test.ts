import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { detectStopSignal, STOP_FILE_NAME } from '../packages/squad-cli/src/cli/commands/watch/index.js';

const SQUAD_DIR = path.join('C:', 'repo', '.squad');
const STOP_FILE = path.join(SQUAD_DIR, STOP_FILE_NAME);

/** Build an `exists` probe that returns true only for the given paths. */
function existsFor(...present: string[]): (filePath: string) => boolean {
  const set = new Set(present.map(p => path.resolve(p)));
  return (filePath: string) => set.has(path.resolve(filePath));
}

describe('detectStopSignal (#1711)', () => {
  it('returns null when no stop signal is present', () => {
    const signal = detectStopSignal({
      squadDir: SQUAD_DIR,
      exists: existsFor(),
    });
    expect(signal).toBeNull();
  });

  it('returns null while a configured sentinel file still exists', () => {
    const sentinel = path.join('C:', 'tmp', 'watch.sentinel');
    const signal = detectStopSignal({
      squadDir: SQUAD_DIR,
      sentinelFile: sentinel,
      exists: existsFor(sentinel),
    });
    expect(signal).toBeNull();
  });

  it('stops when a configured sentinel file has been removed', () => {
    const sentinel = path.join('C:', 'tmp', 'watch.sentinel');
    const signal = detectStopSignal({
      squadDir: SQUAD_DIR,
      sentinelFile: sentinel,
      exists: existsFor(),
    });
    expect(signal).not.toBeNull();
    expect(signal?.reason).toContain('sentinel file removed');
    expect(signal?.reason).toContain(path.resolve(sentinel));
  });

  it('stops when the ralph-stop file exists', () => {
    const signal = detectStopSignal({
      squadDir: SQUAD_DIR,
      exists: existsFor(STOP_FILE),
    });
    expect(signal).not.toBeNull();
    expect(signal?.reason).toContain('stop file present');
    expect(signal?.reason).toContain(STOP_FILE);
  });

  it('stops via ralph-stop even when the sentinel file is still present', () => {
    const sentinel = path.join('C:', 'tmp', 'watch.sentinel');
    const signal = detectStopSignal({
      squadDir: SQUAD_DIR,
      sentinelFile: sentinel,
      exists: existsFor(sentinel, STOP_FILE),
    });
    expect(signal?.reason).toContain('stop file present');
  });

  it('prefers the sentinel reason when both triggers fire', () => {
    const sentinel = path.join('C:', 'tmp', 'watch.sentinel');
    const signal = detectStopSignal({
      squadDir: SQUAD_DIR,
      sentinelFile: sentinel,
      exists: existsFor(STOP_FILE),
    });
    expect(signal?.reason).toContain('sentinel file removed');
  });

  it('resolves relative sentinel paths against the process cwd', () => {
    const relative = 'watch.sentinel';
    const signal = detectStopSignal({
      squadDir: SQUAD_DIR,
      sentinelFile: relative,
      exists: existsFor(),
    });
    expect(signal?.reason).toContain(path.resolve(relative));
  });

  it('ignores an unset sentinel file rather than treating it as removed', () => {
    const signal = detectStopSignal({
      squadDir: SQUAD_DIR,
      sentinelFile: undefined,
      exists: existsFor(),
    });
    expect(signal).toBeNull();
  });
});
