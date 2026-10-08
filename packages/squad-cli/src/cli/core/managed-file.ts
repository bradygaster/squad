import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

function readExisting(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Keep destination newlines, and avoid rewriting a newline-only difference. */
export function writeManagedText(filePath: string, content: string): boolean {
  const existing = readExisting(filePath);
  const normalize = (text: string) => text.replace(/\r\n?|\n/g, '\n');
  if (existing !== undefined && normalize(existing) === normalize(content)) return false;
  const eol = existing?.match(/\r\n|\n|\r/)?.[0];
  const next = eol ? normalize(content).replace(/\n/g, eol) : content;
  writeFileSync(filePath, next, 'utf8');
  return true;
}

export function copyManagedFile(source: string, destination: string): void {
  if (!existsSync(destination)) {
    copyFileSync(source, destination);
    return;
  }
  const bytes = readFileSync(source);
  const text = bytes.toString('utf8');
  if (bytes.includes(0) || !bytes.equals(Buffer.from(text, 'utf8'))) {
    copyFileSync(source, destination);
    return;
  }
  writeManagedText(destination, text);
}
