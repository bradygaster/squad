import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  StateBackendStorageAdapter,
  type StateBackend,
} from '../packages/squad-sdk/src/state-backend.js';

class RecordingBackend implements StateBackend {
  readonly name = 'recording';
  readonly calls: Array<[string, string]> = [];

  read(key: string): string | undefined {
    this.calls.push(['read', key]);
    return key === 'file.md' ? 'content' : undefined;
  }
  write(key: string, _content: string): void { this.calls.push(['write', key]); }
  createIfAbsent(key: string, _content: string): void { this.calls.push(['createIfAbsent', key]); }
  exists(key: string): boolean { this.calls.push(['exists', key]); return false; }
  list(key: string): string[] { this.calls.push(['list', key]); return ['file.md']; }
  delete(key: string): boolean { this.calls.push(['delete', key]); return true; }
  append(key: string, _content: string): void { this.calls.push(['append', key]); }
}

describe('StateBackendStorageAdapter root operation boundary', () => {
  const squadRoot = path.resolve('.state-root-guard', '.squad');
  const rootAliases = ['', '.', './', '.\\', squadRoot, `${squadRoot}${path.sep}`];

  it.each(rootAliases)('allows root alias %j only for list-shaped operations', async alias => {
    const backend = new RecordingBackend();
    const adapter = new StateBackendStorageAdapter(backend, squadRoot);

    await expect(adapter.list(alias)).resolves.toEqual(['file.md']);
    expect(adapter.listSync(alias)).toEqual(['file.md']);
    await expect(adapter.isDirectory(alias)).resolves.toBe(true);
    expect(adapter.isDirectorySync(alias)).toBe(true);
    expect(backend.calls).toEqual([
      ['list', ''],
      ['list', ''],
      ['list', ''],
      ['list', ''],
    ]);
  });

  it.each(rootAliases)('rejects root alias %j for file and destructive operations before backend access', async alias => {
    const backend = new RecordingBackend();
    const adapter = new StateBackendStorageAdapter(backend, squadRoot);
    const rootError = /Squad state root.*cannot be modified or deleted/i;

    await expect(adapter.createIfAbsent(alias, 'x')).rejects.toThrow(rootError);
    await expect(adapter.read(alias)).rejects.toThrow(rootError);
    await expect(adapter.write(alias, 'x')).rejects.toThrow(rootError);
    await expect(adapter.append(alias, 'x')).rejects.toThrow(rootError);
    await expect(adapter.exists(alias)).rejects.toThrow(rootError);
    await expect(adapter.delete(alias)).rejects.toThrow(rootError);
    await expect(adapter.deleteDir(alias)).rejects.toThrow(rootError);
    await expect(adapter.stat(alias)).rejects.toThrow(rootError);
    await expect(adapter.rename(alias, 'file.md')).rejects.toThrow(rootError);
    await expect(adapter.rename('file.md', alias)).rejects.toThrow(rootError);
    await expect(adapter.copy(alias, 'file.md')).rejects.toThrow(rootError);
    await expect(adapter.copy('file.md', alias)).rejects.toThrow(rootError);

    expect(() => adapter.readSync(alias)).toThrow(rootError);
    expect(() => adapter.writeSync(alias, 'x')).toThrow(rootError);
    expect(() => adapter.appendSync(alias, 'x')).toThrow(rootError);
    expect(() => adapter.existsSync(alias)).toThrow(rootError);
    expect(() => adapter.deleteSync(alias)).toThrow(rootError);
    expect(() => adapter.deleteDirSync(alias)).toThrow(rootError);
    expect(() => adapter.statSync(alias)).toThrow(rootError);
    expect(() => adapter.renameSync(alias, 'file.md')).toThrow(rootError);
    expect(() => adapter.renameSync('file.md', alias)).toThrow(rootError);
    expect(() => adapter.copySync(alias, 'file.md')).toThrow(rootError);
    expect(() => adapter.copySync('file.md', alias)).toThrow(rootError);

    expect(backend.calls).toEqual([]);
  });

  it('normalizes safe relative and absolute descendants but rejects outside-root absolute paths', async () => {
    const backend = new RecordingBackend();
    const adapter = new StateBackendStorageAdapter(backend, squadRoot);

    await adapter.read('./file.md');
    adapter.readSync(path.join(squadRoot, 'file.md'));
    expect(backend.calls).toEqual([
      ['read', 'file.md'],
      ['read', 'file.md'],
    ]);

    const outside = path.resolve(squadRoot, '..', 'outside.md');
    await expect(adapter.list(outside)).rejects.toThrow(/outside squadDir/i);
    expect(() => adapter.readSync(outside)).toThrow(/outside squadDir/i);
  });
});
