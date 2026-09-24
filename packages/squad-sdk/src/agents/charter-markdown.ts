/**
 * Deterministic Markdown scanner for the Squad Charter Profile.
 *
 * This is intentionally a small CommonMark-compatible subset rather than a
 * general Markdown parser. Charter structure is recognized only at column one,
 * outside fenced/indented code, HTML comments, block quotes, and opaque
 * extension sections.
 */

export interface CharterMarkdownHeading {
  readonly name: string;
  readonly line: number;
  readonly column: number;
  readonly width: number;
  readonly start: number;
  readonly isExtension: boolean;
}

export interface CharterMarkdownField {
  readonly name: string;
  readonly value: string;
  readonly line: number;
  readonly column: number;
  readonly width: number;
  readonly section: string;
}

export interface CharterMarkdownSection extends CharterMarkdownHeading {
  readonly body: string;
  readonly raw: string;
  readonly end: number;
}

export interface CharterMarkdownScan {
  readonly markdown: string;
  readonly eol: '\n' | '\r\n' | '\r';
  readonly h1?: CharterMarkdownHeading;
  readonly h1s: readonly CharterMarkdownHeading[];
  readonly sections: readonly CharterMarkdownSection[];
  readonly fields: readonly CharterMarkdownField[];
}

interface SourceLine {
  readonly text: string;
  readonly eol: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
}

interface PendingSection extends CharterMarkdownHeading {
  readonly headingEnd: number;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,}).*$/;
const BLOCK_QUOTE = /^ {0,3}>/;
const INDENTED_CODE = /^(?: {4}|\t)/;
const H1 = /^#(?!#)[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const H2 = /^##(?!#)[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FIELD = /^ {0,3}(?:-[ \t]*)?\*\*([^*\r\n]+):\*\*[ \t]*(.*?)[ \t]*$/;
const EXTENSION_HEADING = /^x-/i;

/**
 * Scan charter Markdown using the profile's deterministic structural subset.
 */
export function scanCharterMarkdown(markdown: string): CharterMarkdownScan {
  const lines = splitSourceLines(markdown);
  const sections: CharterMarkdownSection[] = [];
  const fields: CharterMarkdownField[] = [];
  const h1s: CharterMarkdownHeading[] = [];
  let h1: CharterMarkdownHeading | undefined;
  let currentSection: PendingSection | undefined;
  let extensionTail = false;
  let fence: { marker: '`' | '~'; length: number } | undefined;
  let htmlComment = false;

  const finishSection = (end: number): void => {
    if (!currentSection) return;
    const raw = markdown.slice(currentSection.start, end);
    const body = markdown.slice(currentSection.headingEnd, end)
      .replace(/^(?:\r\n|\r|\n)/, '')
      .replace(/\r\n?|\n/g, '\n')
      .trim();
    sections.push({
      ...currentSection,
      body,
      raw,
      end,
    });
    currentSection = undefined;
  };

  for (const sourceLine of lines) {
    const { text } = sourceLine;

    if (htmlComment) {
      if (text.includes('-->')) htmlComment = false;
      continue;
    }

    const trimmed = text.trimStart();
    if (trimmed.startsWith('<!--')) {
      if (!trimmed.includes('-->')) htmlComment = true;
      continue;
    }

    if (fence) {
      const close = text.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (
        close
        && close[1]![0] === fence.marker
        && close[1]!.length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }

    const fenceOpen = text.match(FENCE_OPEN);
    if (fenceOpen) {
      fence = {
        marker: fenceOpen[1]![0] as '`' | '~',
        length: fenceOpen[1]!.length,
      };
      continue;
    }

    if (BLOCK_QUOTE.test(text) || INDENTED_CODE.test(text)) continue;

    const h2Match = text.match(H2);
    if (h2Match) {
      const name = h2Match[1]!.trim();
      const isExtension = EXTENSION_HEADING.test(name);

      // The first extension heading begins an opaque tail. Within that tail,
      // only another namespaced extension heading can delimit a new section.
      if (!extensionTail || isExtension) {
        finishSection(sourceLine.start);
        currentSection = {
          name,
          line: sourceLine.line,
          column: text.indexOf('##') + 1,
          width: text.length,
          start: sourceLine.start,
          headingEnd: sourceLine.end - sourceLine.eol.length,
          isExtension,
        };
        if (isExtension) extensionTail = true;
      }
      continue;
    }

    if (extensionTail) continue;

    const h1Match = text.match(H1);
    if (h1Match) {
      const heading: CharterMarkdownHeading = {
        name: h1Match[1]!.trim(),
        line: sourceLine.line,
        column: text.indexOf('#') + 1,
        width: text.length,
        start: sourceLine.start,
        isExtension: false,
      };
      h1s.push(heading);
      h1 ??= heading;
      continue;
    }

    if (!currentSection) continue;
    const fieldMatch = text.match(FIELD);
    if (fieldMatch) {
      fields.push({
        name: fieldMatch[1]!.trim(),
        value: fieldMatch[2]!,
        line: sourceLine.line,
        column: text.indexOf('**') + 1,
        width: fieldMatch[1]!.trim().length + 5,
        section: currentSection.name,
      });
    }
  }

  finishSection(markdown.length);

  return {
    markdown,
    eol: detectEol(markdown),
    ...(h1 ? { h1 } : {}),
    h1s,
    sections,
    fields,
  };
}

function splitSourceLines(markdown: string): SourceLine[] {
  if (markdown.length === 0) {
    return [{ text: '', eol: '', line: 1, start: 0, end: 0 }];
  }

  const lines: SourceLine[] = [];
  let start = 0;
  let line = 1;
  while (start < markdown.length) {
    let end = start;
    while (end < markdown.length && markdown[end] !== '\r' && markdown[end] !== '\n') {
      end += 1;
    }

    let eol = '';
    if (markdown[end] === '\r' && markdown[end + 1] === '\n') {
      eol = '\r\n';
    } else if (markdown[end] === '\r' || markdown[end] === '\n') {
      eol = markdown[end]!;
    }

    const next = end + eol.length;
    lines.push({
      text: markdown.slice(start, end),
      eol,
      line,
      start,
      end: next,
    });
    start = next;
    line += 1;
  }
  return lines;
}

function detectEol(markdown: string): '\n' | '\r\n' | '\r' {
  const match = markdown.match(/\r\n|\r|\n/);
  return (match?.[0] as '\n' | '\r\n' | '\r' | undefined) ?? '\n';
}
