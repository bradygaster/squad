/**
 * Characterization tests for LocalMemoryStore.
 *
 * Covers:
 *   Gap M1 - index-lock no-loss invariant on N concurrent writes.
 *   Gap M2 - tombstone-before-source-delete ordering invariant on delete().
 *
 * Full write/search/promote/audit lifecycle coverage lives in
 * `test/memory-governance.test.ts` and is intentionally not duplicated here.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { FSStorageProvider } from '../../packages/squad-sdk/src/storage/fs-storage-provider.js';
import { LocalMemoryStore } from '../../packages/squad-sdk/src/memory/index.js';

import { makeWriteGuardedStorage, withHermeticRoot } from './_helpers/hermetic-root.js';

async function readJsonl(file: string): Promise<unknown[]> {
  const raw = await fs.readFile(file, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, idx) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(
          `audit.jsonl line ${idx + 1} is not valid JSON: ${(err as Error).message}. Raw line length=${line.length}.`,
        );
      }
    });
}

describe('LocalMemoryStore characterization', () => {
  it.each([5, 20])('serializes %d concurrent writes without loss (M1)', async (n) => {
    await withHermeticRoot(async (root) => {
      const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
      const store = new LocalMemoryStore(storage, root);

      const results = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          store.write({
            content: `synthetic characterization payload ${i}`,
            title: `entry ${i}`,
            author: 'characterization-suite',
          }),
        ),
      );

      const stored = results.filter((r) => r.stored);
      expect(stored).toHaveLength(n);
      const idSet = new Set(stored.map((r) => r.id!));
      expect(idSet.size).toBe(n);

      const indexPath = path.join(root, '.squad', 'memory', 'index.json');
      const rawIndex = await fs.readFile(indexPath, 'utf8');
      const parsedIndex = JSON.parse(rawIndex) as Array<{ id: string; status: string }>;
      expect(parsedIndex).toHaveLength(n);
      const indexIds = new Set(parsedIndex.map((e) => e.id));
      expect(indexIds).toEqual(idSet);

      // audit.jsonl invariant: every line parses; write actions for our ids
      // are all present; no partial or truncated lines.
      const auditPath = path.join(root, '.squad', 'memory', 'audit.jsonl');
      const auditRecords = (await readJsonl(auditPath)) as Array<{
        action: string;
        id?: string;
      }>;
      const writeIds = new Set(
        auditRecords.filter((r) => r.action === 'write').map((r) => r.id),
      );
      for (const id of idSet) {
        expect(writeIds.has(id), `audit missing write action for id ${id}`).toBe(true);
      }
    });
  });

  it('writes tombstone to disk before removing the source file (M2)', async () => {
    await withHermeticRoot(async (root) => {
      const baseStorage = makeWriteGuardedStorage(new FSStorageProvider(), root);
      const store = new LocalMemoryStore(baseStorage, root);

      const writeResult = await store.write({
        content: 'synthetic entry to be deleted',
        title: 'delete-me',
        author: 'characterization-suite',
      });
      expect(writeResult.stored).toBe(true);
      const id = writeResult.id!;
      const tombstonePath = path.join(root, '.squad', 'memory', 'tombstones', `${id}.json`);
      const sourceAbsolute = path.join(root, writeResult.path!);

      // Sanity: tombstone does not exist yet; source does.
      await expect(fs.access(tombstonePath)).rejects.toThrow();
      await expect(fs.access(sourceAbsolute)).resolves.toBeUndefined();

      // Wrap storage.delete so we can observe on-disk state at the moment the
      // source is unlinked. LocalMemoryStore is reflected onto our wrapper via
      // its private `storage` field so we do not need a second instance.
      const observations: Array<{ target: string; tombstoneExistsAtCall: boolean }> = [];
      const wrapped: typeof baseStorage = new Proxy(baseStorage, {
        get(target, propertyKey, receiver) {
          if (propertyKey === 'delete') {
            const original = Reflect.get(target, propertyKey, receiver) as (
              p: string,
            ) => Promise<void>;
            return async (targetPath: string) => {
              let exists = false;
              try {
                await fs.access(tombstonePath);
                exists = true;
              } catch {
                exists = false;
              }
              observations.push({ target: targetPath, tombstoneExistsAtCall: exists });
              return original.call(target, targetPath);
            };
          }
          return Reflect.get(target, propertyKey, receiver);
        },
      });
      // Swap the store's storage reference to the observer.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (store as any).storage = wrapped;

      const deleted = await store.delete(id, 'characterization-suite');
      expect(deleted).toBe(true);

      // At least one delete call was made against the source; every such call
      // saw the tombstone already on disk.
      const sourceDeletes = observations.filter((o) => o.target === sourceAbsolute);
      expect(sourceDeletes.length).toBeGreaterThanOrEqual(1);
      for (const obs of sourceDeletes) {
        expect(obs.tombstoneExistsAtCall).toBe(true);
      }

      // Post-conditions: source removed, tombstone persisted, audit updated.
      await expect(fs.access(sourceAbsolute)).rejects.toThrow();
      await expect(fs.access(tombstonePath)).resolves.toBeUndefined();
      const auditPath = path.join(root, '.squad', 'memory', 'audit.jsonl');
      const auditRecords = (await readJsonl(auditPath)) as Array<{
        action: string;
        id?: string;
      }>;
      const deleteRecord = auditRecords.find((r) => r.action === 'delete' && r.id === id);
      expect(deleteRecord).toBeDefined();
    });
  });
});
