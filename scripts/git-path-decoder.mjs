// scripts/git-path-decoder.mjs — zero dependencies

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const ESCAPED_BYTES = new Map([
  ['a', 0x07],
  ['b', 0x08],
  ['t', 0x09],
  ['n', 0x0a],
  ['v', 0x0b],
  ['f', 0x0c],
  ['r', 0x0d],
  ['"', 0x22],
  ['\\', 0x5c],
]);

function appendUtf8(bytes, value) {
  bytes.push(...encoder.encode(value));
}

/**
 * Decode one path emitted by Git's line-delimited `--name-only` output.
 * Plain paths are returned unchanged. C-quoted paths are decoded byte-first
 * so Git's octal UTF-8 escapes cannot be confused with JavaScript escapes.
 * @param {string} value
 * @returns {string}
 */
export function decodeGitPath(value) {
  if (!value.startsWith('"')) return value;
  if (value.length < 2 || !value.endsWith('"')) {
    throw new Error('unterminated Git C-quoted path');
  }

  const bytes = [];
  const inner = value.slice(1, -1);
  for (let index = 0; index < inner.length; index++) {
    const char = inner[index];
    if (char === '"') throw new Error('unescaped quote in Git C-quoted path');
    if (char !== '\\') {
      const codePoint = inner.codePointAt(index);
      const literal = String.fromCodePoint(codePoint);
      appendUtf8(bytes, literal);
      if (literal.length === 2) index++;
      continue;
    }

    const escaped = inner[++index];
    if (escaped === undefined) throw new Error('trailing escape in Git C-quoted path');

    const standardByte = ESCAPED_BYTES.get(escaped);
    if (standardByte !== undefined) {
      bytes.push(standardByte);
      continue;
    }

    if (/[0-7]/.test(escaped)) {
      const octal = `${escaped}${inner[index + 1] ?? ''}${inner[index + 2] ?? ''}`;
      if (!/^[0-7]{3}$/.test(octal)) {
        throw new Error('incomplete octal escape in Git C-quoted path');
      }
      bytes.push(Number.parseInt(octal, 8));
      index += 2;
      continue;
    }

    throw new Error(`unknown escape in Git C-quoted path: \\${escaped}`);
  }

  if (bytes.includes(0)) throw new Error('NUL is not allowed in a Git path');
  return decoder.decode(Uint8Array.from(bytes));
}

/**
 * Validate a decoded leakage path without normalizing or rewriting it.
 * @param {string} value
 * @returns {string}
 */
export function validateSquadPath(value) {
  if (value.length === 0) throw new Error('empty Git path');
  if (value.includes('\0')) throw new Error('NUL is not allowed in a Git path');
  if (value.includes('\n')) throw new Error('newline-containing Git paths are unsupported');
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new Error('absolute Git paths are not allowed');
  }
  if (!value.startsWith('.squad/')) throw new Error('Git path is outside .squad/');
  return value;
}

/**
 * Parse Git's line-delimited `--name-only` output.
 * @param {Uint8Array} output
 * @returns {string[]}
 */
export function decodeGitNameOnly(output) {
  const text = decoder.decode(output);
  if (text.length === 0) return [];
  if (!text.endsWith('\n')) throw new Error('unterminated Git --name-only output');

  const records = text.slice(0, -1).split('\n');
  return records.map((record) => validateSquadPath(decodeGitPath(record)));
}
