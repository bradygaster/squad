import { ContainerClient } from '@azure/storage-blob';
import type { StorageProvider, StorageStats } from '@bradygaster/squad-sdk';

/**
 * Azure Blob Storage implementation of StorageProvider.
 *
 * Maps StorageProvider paths 1:1 to blob names inside a single container.
 * Directories are virtual — they exist only as common prefixes in blob names.
 *
 * Sync methods throw because cloud I/O is inherently asynchronous.
 * They will be removed in Wave 2 of the StorageProvider interface.
 */
export class AzureBlobStorageProvider implements StorageProvider {
  private readonly container: ContainerClient;

  constructor(containerClient: ContainerClient) {
    this.container = containerClient;
  }

  // ── Path helpers ──────────────────────────────────────────────────────

  /** Normalize a path: strip leading `/`, convert `\` → `/`. */
  private normalizePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  /** Ensure a prefix ends with `/` (except root which is empty). */
  private toPrefix(dirPath: string): string {
    const norm = this.normalizePath(dirPath);
    if (norm === '' || norm === '.' || norm === '/') return '';
    return norm.endsWith('/') ? norm : `${norm}/`;
  }

  // ── Async methods (12) ────────────────────────────────────────────────

  async read(filePath: string): Promise<string | undefined> {
    const blobName = this.normalizePath(filePath);
    const blob = this.container.getBlockBlobClient(blobName);

    try {
      const response = await blob.download(0);
      const body = response.readableStreamBody;
      if (!body) return undefined;

      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf-8');
    } catch (err: any) {
      if (err.statusCode === 404) return undefined;
      throw err;
    }
  }

  async write(filePath: string, data: string): Promise<void> {
    const blobName = this.normalizePath(filePath);
    const blob = this.container.getBlockBlobClient(blobName);
    const buffer = Buffer.from(data, 'utf-8');
    await blob.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: 'text/plain; charset=utf-8' },
    });
  }

  async append(filePath: string, data: string): Promise<void> {
    const existing = (await this.read(filePath)) ?? '';
    await this.write(filePath, existing + data);
  }

  async exists(filePath: string): Promise<boolean> {
    const blobName = this.normalizePath(filePath);
    const blob = this.container.getBlobClient(blobName);

    if (await blob.exists()) return true;
    // Could be a virtual directory
    return this.isDirectory(filePath);
  }

  async list(dirPath: string): Promise<string[]> {
    const prefix = this.toPrefix(dirPath);
    const names: string[] = [];

    for await (const item of this.container.listBlobsByHierarchy('/', {
      prefix,
    })) {
      if (item.kind === 'prefix') {
        // Virtual directory — strip the prefix and trailing `/`
        const name = item.name.slice(prefix.length).replace(/\/$/, '');
        if (name) names.push(name);
      } else {
        // Blob — strip the prefix
        const name = item.name.slice(prefix.length);
        if (name) names.push(name);
      }
    }

    return names;
  }

  async delete(filePath: string): Promise<void> {
    const blobName = this.normalizePath(filePath);
    const blob = this.container.getBlobClient(blobName);
    await blob.deleteIfExists();
  }

  async deleteDir(dirPath: string): Promise<void> {
    const prefix = this.toPrefix(dirPath);

    // List all blobs with the prefix (flat, not hierarchical) and delete each
    for await (const blob of this.container.listBlobsFlat({ prefix })) {
      await this.container.getBlobClient(blob.name).deleteIfExists();
    }
  }

  async isDirectory(targetPath: string): Promise<boolean> {
    const prefix = this.toPrefix(targetPath);
    if (prefix === '') return true; // root is always a directory

    for await (const _blob of this.container.listBlobsFlat({ prefix })) {
      return true; // at least one blob with this prefix exists
    }
    return false;
  }

  async mkdir(
    _dirPath: string,
    _options?: { recursive?: boolean },
  ): Promise<void> {
    // No-op: directories are virtual in blob storage
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const srcName = this.normalizePath(oldPath);
    const destName = this.normalizePath(newPath);

    const srcBlob = this.container.getBlobClient(srcName);
    const destBlob = this.container.getBlobClient(destName);

    if (!(await srcBlob.exists())) {
      throw new Error(`rename failed: source blob "${srcName}" does not exist`);
    }

    const poller = await destBlob.beginCopyFromURL(srcBlob.url);
    await poller.pollUntilDone();
    await srcBlob.delete();
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const srcName = this.normalizePath(srcPath);
    const destName = this.normalizePath(destPath);

    const srcBlob = this.container.getBlobClient(srcName);
    const destBlob = this.container.getBlobClient(destName);

    if (!(await srcBlob.exists())) {
      throw new Error(`copy failed: source blob "${srcName}" does not exist`);
    }

    const poller = await destBlob.beginCopyFromURL(srcBlob.url);
    await poller.pollUntilDone();
  }

  async stat(targetPath: string): Promise<StorageStats | undefined> {
    const blobName = this.normalizePath(targetPath);
    const blob = this.container.getBlobClient(blobName);

    try {
      const props = await blob.getProperties();
      return {
        size: props.contentLength ?? 0,
        mtimeMs: props.lastModified?.getTime() ?? Date.now(),
        isDirectory: false,
      };
    } catch (err: any) {
      if (err.statusCode === 404) return undefined;
      throw err;
    }
  }

  // ── Sync methods (12) — all throw ─────────────────────────────────────
  // Cloud I/O is inherently async. These are deprecated and will be removed
  // in Wave 2 of the StorageProvider interface.

  private syncUnsupported(): never {
    throw new Error(
      'Sync operations are not supported by AzureBlobStorageProvider. ' +
        'Use async methods instead. Sync methods are deprecated and will ' +
        'be removed in Wave 2.',
    );
  }

  readSync(_filePath: string): string | undefined {
    this.syncUnsupported();
  }

  writeSync(_filePath: string, _data: string): void {
    this.syncUnsupported();
  }

  existsSync(_filePath: string): boolean {
    this.syncUnsupported();
  }

  listSync(_dirPath: string): string[] {
    this.syncUnsupported();
  }

  isDirectorySync(_targetPath: string): boolean {
    this.syncUnsupported();
  }

  mkdirSync(_dirPath: string, _options?: { recursive?: boolean }): void {
    this.syncUnsupported();
  }

  statSync(_targetPath: string): StorageStats | undefined {
    this.syncUnsupported();
  }

  appendSync(_filePath: string, _data: string): void {
    this.syncUnsupported();
  }

  deleteSync(_filePath: string): void {
    this.syncUnsupported();
  }

  renameSync(_oldPath: string, _newPath: string): void {
    this.syncUnsupported();
  }

  copySync(_srcPath: string, _destPath: string): void {
    this.syncUnsupported();
  }

  deleteDirSync(_dirPath: string): void {
    this.syncUnsupported();
  }
}
