/**
 * Hermetic helpers for characterization tests.
 *
 * Every characterization suite MUST run inside a fresh temp directory under
 * `os.tmpdir()`. Repository `.squad/**` state is never test input and is
 * never read, hashed, or listed by these tests.
 *
 * `makeWriteGuardedStorage` wraps any `StorageProvider` and asserts that
 * every mutating call resolves to an absolute path that lives inside the
 * hermetic root. Any escape throws a descriptive error that names only the
 * offending operation and the temp root prefix; caller-machine paths outside
 * the temp root are never surfaced in failure messages.
 *
 * This file lives under `_helpers/` so vitest's `test/**\/*.test.ts` include
 * pattern does not treat it as a test file; it is imported by tests only.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { StorageProvider } from '../../../packages/squad-sdk/src/storage/storage-provider.js';

/**
 * Create a hermetic temp directory, run `fn` inside it, and remove it in a
 * `finally` block. The directory lives under `os.tmpdir()` and never under
 * the repo working directory.
 */
export async function withHermeticRoot<T>(
  fn: (root: string) => Promise<T>,
  prefix = 'squad-characterization-',
): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

const MUTATING_METHODS = new Set<string>([
  'write',
  'writeSync',
  'append',
  'appendSync',
  'delete',
  'deleteSync',
  'deleteDir',
  'deleteDirSync',
  'mkdir',
  'mkdirSync',
  'rename',
  'renameSync',
  'copy',
  'copySync',
]);

/** Methods that take two path arguments (source, destination). */
const TWO_PATH_METHODS = new Set<string>(['rename', 'renameSync', 'copy', 'copySync']);

function assertInsideRoot(root: string, target: string, operation: string): void {
  const resolved = path.resolve(target);
  const normalizedRoot = path.resolve(root);
  const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
  if (resolved !== normalizedRoot && !resolved.startsWith(rootWithSep)) {
    throw new Error(
      `Hermetic write guard: refused ${operation} outside hermetic root (${normalizedRoot}). ` +
        `A test attempted to write to a path that is not contained by this suite's temp directory.`,
    );
  }
}

/**
 * Wrap a `StorageProvider` so every mutating method asserts the target path
 * is contained by `root`. Non-mutating methods are forwarded unchanged.
 */
export function makeWriteGuardedStorage(base: StorageProvider, root: string): StorageProvider {
  return new Proxy(base, {
    get(target, propertyKey, receiver) {
      const original = Reflect.get(target, propertyKey, receiver);
      if (typeof original !== 'function' || typeof propertyKey !== 'string') {
        return original;
      }
      if (!MUTATING_METHODS.has(propertyKey)) {
        return original.bind(target);
      }
      return (...args: unknown[]): unknown => {
        const first = args[0];
        if (typeof first !== 'string') {
          throw new Error(
            `Hermetic write guard: refused ${propertyKey} with non-string first argument.`,
          );
        }
        assertInsideRoot(root, first, propertyKey);
        if (TWO_PATH_METHODS.has(propertyKey)) {
          const second = args[1];
          if (typeof second !== 'string') {
            throw new Error(
              `Hermetic write guard: refused ${propertyKey} with non-string second argument.`,
            );
          }
          assertInsideRoot(root, second, propertyKey);
        }
        return (original as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as StorageProvider;
}
