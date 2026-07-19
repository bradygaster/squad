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

function resolveInsideRoot(root: string, target: string, operation: string): string {
  const normalizedRoot = path.resolve(root);
  // Resolve a relative target against the hermetic root, not against
  // process.cwd(). path.resolve(normalizedRoot, target) ignores the first
  // argument when target is already absolute, so this is safe for both
  // absolute and relative targets and keeps containment deterministic
  // regardless of the test runner's working directory. The resolved,
  // root-anchored path is returned so the caller can forward it to the
  // underlying storage instead of the original (possibly relative) target,
  // otherwise a relative target would still hit the real filesystem
  // relative to process.cwd(), defeating the containment check entirely.
  const resolved = path.resolve(normalizedRoot, target);
  const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
  if (resolved !== normalizedRoot && !resolved.startsWith(rootWithSep)) {
    throw new Error(
      `Hermetic write guard: refused ${operation} outside hermetic root (${normalizedRoot}). ` +
        `A test attempted to write to a path that is not contained by this suite's temp directory.`,
    );
  }
  return resolved;
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
      const invoke = (args: unknown[]): unknown => {
        const first = args[0];
        if (typeof first !== 'string') {
          throw new Error(
            `Hermetic write guard: refused ${propertyKey} with non-string first argument.`,
          );
        }
        // Forward the resolved, root-anchored path rather than the raw
        // argument so a relative target actually lands inside the hermetic
        // root on disk, not just passes the containment check.
        const resolvedArgs = [...args];
        resolvedArgs[0] = resolveInsideRoot(root, first, propertyKey);
        if (TWO_PATH_METHODS.has(propertyKey)) {
          const second = args[1];
          if (typeof second !== 'string') {
            throw new Error(
              `Hermetic write guard: refused ${propertyKey} with non-string second argument.`,
            );
          }
          resolvedArgs[1] = resolveInsideRoot(root, second, propertyKey);
        }
        return (original as (...a: unknown[]) => unknown).apply(target, resolvedArgs);
      };
      // The *Sync methods have a synchronous contract, so a containment
      // failure must throw synchronously to match that contract. The
      // non-Sync methods return a Promise, so a containment failure is
      // wrapped in an async function here: without this, resolveInsideRoot's
      // synchronous throw would escape as an unhandled synchronous exception
      // instead of a rejected Promise, which breaks callers using
      // `await expect(storage.write(...)).rejects.toThrow(...)`.
      if (propertyKey.endsWith('Sync')) {
        return (...args: unknown[]): unknown => invoke(args);
      }
      return async (...args: unknown[]): Promise<unknown> => invoke(args);
    },
  }) as StorageProvider;
}
