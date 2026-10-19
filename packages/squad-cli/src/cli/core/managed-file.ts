import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { extname } from 'node:path';

export const COPILOT_INSTRUCTIONS_START = '<!-- squad:copilot-instructions:start -->';
export const COPILOT_INSTRUCTIONS_END = '<!-- squad:copilot-instructions:end -->';
const LEGACY_COPILOT_INSTRUCTIONS_HEADING = '# Copilot Coding Agent — Squad Instructions';
const LEGACY_COPILOT_INSTRUCTIONS_TAIL = 'The Scribe will merge it into the shared decisions file.';

const MANAGED_TEXT_EXTENSIONS = new Set([
  '.md', '.json', '.yml', '.yaml', '.js', '.mjs', '.cjs', '.ts',
  '.ps1', '.sh', '.txt', '.template',
]);

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
  if (!MANAGED_TEXT_EXTENSIONS.has(extname(source).toLowerCase()) || !existsSync(destination)) {
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

/**
 * Wrap raw Squad copilot-instructions content with markers if not already wrapped.
 */
function ensureCopilotInstructionsMarkers(templateContent: string): string {
  const normalized = templateContent.replace(/\r\n?|\n/g, '\n').trim();
  if (
    normalized.startsWith(COPILOT_INSTRUCTIONS_START) &&
    normalized.endsWith(COPILOT_INSTRUCTIONS_END)
  ) {
    return normalized;
  }
  return `${COPILOT_INSTRUCTIONS_START}\n${normalized}\n${COPILOT_INSTRUCTIONS_END}`;
}

/**
 * Merge the Squad-managed copilot-instructions block into existing file content,
 * preserving 100% of user-authored instructions outside the managed block (#2186).
 */
export function mergeCopilotInstructionsContent(existing: string | undefined, templateContent: string): string {
  const managedBlock = ensureCopilotInstructionsMarkers(templateContent);
  if (existing === undefined || existing.trim().length === 0) {
    return `${managedBlock}\n`;
  }

  const text = existing.replace(/\r\n?|\n/g, '\n');
  const startIdx = text.indexOf(COPILOT_INSTRUCTIONS_START);
  const endIdx = startIdx !== -1 ? text.indexOf(COPILOT_INSTRUCTIONS_END, startIdx) : -1;

  if (startIdx !== -1 && endIdx !== -1) {
    const before = text.slice(0, startIdx);
    const after = text.slice(endIdx + COPILOT_INSTRUCTIONS_END.length);
    return `${before}${managedBlock}${after}`;
  }

  // Legacy un-marked Squad instructions detection: replace only the legacy Squad block
  const headingIdx = text.indexOf(LEGACY_COPILOT_INSTRUCTIONS_HEADING);
  if (headingIdx !== -1) {
    const tailIdx = text.indexOf(LEGACY_COPILOT_INSTRUCTIONS_TAIL, headingIdx);
    if (tailIdx !== -1) {
      let blockEnd = tailIdx + LEGACY_COPILOT_INSTRUCTIONS_TAIL.length;
      if (text[blockEnd] === '\n') blockEnd++;
      const before = text.slice(0, headingIdx);
      const after = text.slice(blockEnd);
      const suffix = after.length === 0 ? '\n' : after.startsWith('\n') ? after : `\n${after}`;
      return `${before}${managedBlock}${suffix}`;
    }
    if (headingIdx === 0) {
      return `${managedBlock}\n`;
    }
  }

  // User-authored file without Squad markers: preserve user content and append Squad block
  const trimmedEnd = text.replace(/\n+$/, '');
  return `${trimmedEnd}\n\n${managedBlock}\n`;
}

/**
 * Remove only the Squad-managed block from `.github/copilot-instructions.md`.
 * Returns `null` when no user content remains (caller may delete the file),
 * or the remaining user content string when user instructions exist.
 */
export function removeCopilotInstructionsBlock(existing: string): string | null {
  const text = existing.replace(/\r\n?|\n/g, '\n');
  const startIdx = text.indexOf(COPILOT_INSTRUCTIONS_START);
  const endIdx = startIdx !== -1 ? text.indexOf(COPILOT_INSTRUCTIONS_END, startIdx) : -1;

  if (startIdx !== -1 && endIdx !== -1) {
    const before = text.slice(0, startIdx).replace(/\n+$/, '');
    const after = text.slice(endIdx + COPILOT_INSTRUCTIONS_END.length).replace(/^\n+/, '');
    const combined = [before, after].filter(s => s.trim().length > 0).join('\n\n');
    return combined.trim().length > 0 ? `${combined.replace(/\n+$/, '')}\n` : null;
  }

  const headingIdx = text.indexOf(LEGACY_COPILOT_INSTRUCTIONS_HEADING);
  if (headingIdx !== -1) {
    const tailIdx = text.indexOf(LEGACY_COPILOT_INSTRUCTIONS_TAIL, headingIdx);
    if (tailIdx !== -1) {
      const before = text.slice(0, headingIdx).replace(/\n+$/, '');
      const after = text.slice(tailIdx + LEGACY_COPILOT_INSTRUCTIONS_TAIL.length).replace(/^\n+/, '');
      const combined = [before, after].filter(s => s.trim().length > 0).join('\n\n');
      return combined.trim().length > 0 ? `${combined.replace(/\n+$/, '')}\n` : null;
    }
    if (headingIdx === 0) {
      return null;
    }
  }

  return existing;
}

/**
 * Upsert the Squad-managed section in `.github/copilot-instructions.md` from the template file.
 * Preserves destination line endings and all user-owned instructions.
 */
export function syncCopilotInstructionsFile(sourceTemplatePath: string, destinationPath: string): boolean {
  const templateContent = readFileSync(sourceTemplatePath, 'utf8');
  const existing = readExisting(destinationPath);
  const nextContent = mergeCopilotInstructionsContent(existing, templateContent);
  if (existing === undefined) {
    writeFileSync(destinationPath, nextContent, 'utf8');
    return true;
  }
  return writeManagedText(destinationPath, nextContent);
}

