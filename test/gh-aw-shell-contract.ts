/**
 * Shell input security contract scanner (#1834).
 *
 * `workflows/squad.md` §"Shell input security contract [MANDATORY]" declares that
 * attacker-controlled GitHub event text (issue/PR bodies and titles, comment
 * bodies) may reach the shell only through named `env:` variables read via quoted
 * parameter expansion. It names four greppable anti-patterns. That contract was
 * declared but unenforced; this module is the detection half of the gate.
 *
 * The gate has two surfaces, because the two halves of the contract live in two
 * different artifacts:
 *
 *  1. UNTRUSTED_TEMPLATE_IN_RUN is a property of the COMPILED workflow: an Actions
 *     `${{ github.event.*.body }}` expression inside a `run:` block is expanded by
 *     Actions *before* the shell starts, so shell quoting cannot save it. This can
 *     only be observed after `gh aw compile`, in `squad.lock.yml`'s `run:` blocks.
 *
 *  2. The printf / eval / bash -c / awk hops are properties of the PARSER CODE —
 *     the `/squad` command parser one-liners in `workflows/squad.md`. gh-aw pulls
 *     that markdown in verbatim at runtime via `{{#runtime-import ... squad.md}}`;
 *     it is never inlined into the lock, so the lock cannot observe it. Those hops
 *     are therefore scanned on the runtime-imported source, which is the exact
 *     bytes the agent runs.
 *
 * The detectors key on *attacker body references* — a `${{ github.event.*.body }}`
 * expression, or a shell expansion of a body-carrying variable — not on the mere
 * presence of `$`. gh-aw's own machinery legitimately runs `bash -c 'set +o …
 * export PATH="$PATH"'` and `source "${RUNNER_TEMP}/…"`; those carry runner-owned
 * values, never attacker text, and must not trip the gate. Keying on body
 * references is both what the contract actually forbids and what keeps the gate
 * from going permanently red.
 */

export type ContractToken =
  | 'UNTRUSTED_TEMPLATE_IN_RUN'
  | 'UNTRUSTED_COMMAND_STRING'
  | 'UNTRUSTED_PRINTF_FORMAT'
  | 'UNTRUSTED_AWK_PROGRAM_OR_VAR';

export interface ContractViolation {
  token: ContractToken;
  file: string;
  /** 1-based line number of the offending line. */
  line: number;
  /** The offending source line, trimmed, for the diagnostic. */
  evidence: string;
}

/** One `run:` block extracted from a compiled workflow, with absolute line numbers. */
export interface RunBlock {
  /** 1-based line where the `run:` key appears. */
  headerLine: number;
  /** Body lines with absolute 1-based line numbers (inline runs yield one entry). */
  lines: Array<{ line: number; text: string }>;
}

// Attacker-controlled GitHub event *text* fields: bodies and titles. Numbers and
// ids (issue.number, comment.id) are not attacker text and are deliberately excluded.
const ATTACKER_EVENT_FIELD =
  'github\\.event\\.(?:issue|comment|pull_request|discussion)\\.(?:body|title)\\b';

/** A `${{ … }}` Actions expression that references attacker event text. */
const TEMPLATE_ATTACKER_EVENT = new RegExp(
  `\\$\\{\\{[^]*?${ATTACKER_EVENT_FIELD}[^]*?\\}\\}`
);

/**
 * A shell expansion of a variable that carries attacker body/title text. The
 * sanctioned channel names it `SQUAD_TRIGGER_BODY` / `SQUAD_DISPATCH_COMMAND`; any
 * `*_BODY` / `*_TITLE` variable, or a lower-case `$body`, is treated as tainted so
 * a renamed carrier cannot slip the gate. Matching requires a `$`/`${` sigil, so
 * the literal word "body" in prose is not flagged.
 */
const BODY_VAR =
  /\$\{?\s*(?:SQUAD_TRIGGER_BODY|SQUAD_DISPATCH_COMMAND|body|[A-Za-z0-9]+_BODY|[A-Za-z0-9]+_TITLE)\b/i;

/** Does this text carry attacker body text, via an Actions expression or a body variable? */
function carriesBody(text: string): boolean {
  return TEMPLATE_ATTACKER_EVENT.test(text) || BODY_VAR.test(text);
}

/**
 * Extract `run:` blocks from GitHub Actions workflow YAML, tracking absolute line
 * numbers so violations can be reported as file:line. Handles both block scalars
 * (`run: |`, `run: >`, with optional chomping indicators) and inline `run: cmd`.
 *
 * This is a deliberately line-oriented reader rather than a YAML parse: the gate
 * must name the offending line, and a parsed scalar loses its line origin.
 */
export function extractRunBlocks(yamlText: string): RunBlock[] {
  const lines = yamlText.replace(/\r\n/g, '\n').split('\n');
  const blocks: RunBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(/^(\s*)run:(\s*)(.*)$/);
    if (!header) continue;

    const indent = header[1].length;
    const value = header[3];

    if (/^[|>][+-]?\s*$/.test(value)) {
      // Block scalar: body is the following lines indented deeper than `run:`.
      const body: Array<{ line: number; text: string }> = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') {
          body.push({ line: j + 1, text: lines[j] });
          continue;
        }
        const bodyIndent = lines[j].match(/^(\s*)/)![1].length;
        if (bodyIndent <= indent) break;
        body.push({ line: j + 1, text: lines[j] });
      }
      // Trim trailing blank lines that belong to the next key, not the block.
      while (body.length && body[body.length - 1].text.trim() === '') body.pop();
      blocks.push({ headerLine: i + 1, lines: body });
    } else if (value !== '') {
      // Inline run: the command is on the same line as the key.
      blocks.push({ headerLine: i + 1, lines: [{ line: i + 1, text: value }] });
    }
  }

  return blocks;
}

/** After a `printf`, return the first non-flag argument token (with its quotes). */
function firstPrintfArg(afterPrintf: string): string {
  let s = afterPrintf.replace(/^\s+/, '');
  // `printf -v NAME …` consumes a variable-name operand; skip it.
  const vFlag = s.match(/^-v\s+\S+\s+/);
  if (vFlag) s = s.slice(vFlag[0].length);
  else s = s.replace(/^(?:-[A-Za-z]+\s+)+/, '');

  if (s[0] === "'") {
    const end = s.indexOf("'", 1);
    return end === -1 ? s : s.slice(0, end + 1);
  }
  if (s[0] === '"') {
    // Read to the next unescaped double quote.
    for (let k = 1; k < s.length; k++) {
      if (s[k] === '\\') { k++; continue; }
      if (s[k] === '"') return s.slice(0, k + 1);
    }
    return s;
  }
  // Bare word: read to the next shell separator.
  const m = s.match(/^[^\s;&|)]+/);
  return m ? m[0] : s;
}

/**
 * UNTRUSTED_PRINTF_FORMAT — the body must never be printf's format (first) slot;
 * the format must be a literal and the body an argument. Flags a `printf` whose
 * first argument carries body text. `printf '%s\n' "$body"` is safe (literal
 * format, body in the argument slot); `printf "$body"` is not.
 */
function detectPrintfFormat(text: string): boolean {
  const re = /\bprintf\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const arg = firstPrintfArg(text.slice(m.index + m[0].length));
    if (carriesBody(arg)) return true;
  }
  return false;
}

/**
 * UNTRUSTED_COMMAND_STRING — never build shell syntax from attacker text. Flags
 * `eval`, `source`/`.`, or `bash -c`/`sh -c` whose argument carries body text.
 * Runner-owned expansions (`$PATH`, `${RUNNER_TEMP}`) are not body and stay green.
 */
function detectCommandString(text: string): boolean {
  const patterns = [
    /\beval\b([^\n]*)/g,
    /\b(?:bash|sh)\s+-c\b([^\n]*)/g,
    /(?:^|[\s;&|(])(?:source|\.)\s+([^\n]*)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (carriesBody(m[1])) return true;
    }
  }
  return false;
}

/**
 * UNTRUSTED_AWK_PROGRAM_OR_VAR — never interpolate attacker text into an awk
 * program, and never pass the raw body through `awk -v` (which applies escape
 * processing). Flags `awk -v name=<body>` and a double-quoted awk program that
 * carries body text. A static single-quoted program (`awk '…$0…'`) is safe: the
 * `$0` there is an awk field reference, not a shell expansion.
 */
function detectAwk(text: string): boolean {
  if (!/\bawk\b/.test(text)) return false;

  // awk -v name=<value>
  const vRe = /-v\s+[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'[^']*'|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = vRe.exec(text)) !== null) {
    if (carriesBody(m[1])) return true;
  }

  // Double-quoted awk program that interpolates body text. Single-quoted programs
  // cannot be interpolated by the shell and are the sanctioned form.
  const progRe = /\bawk\b(?:\s+-[A-Za-z]\S*|\s+-v\s+\S+)*\s+("[^"]*")/g;
  while ((m = progRe.exec(text)) !== null) {
    if (carriesBody(m[1])) return true;
  }

  return false;
}

/**
 * Scan a single line of shell for the three code-shape anti-patterns (printf,
 * command-string, awk). UNTRUSTED_TEMPLATE_IN_RUN is intentionally NOT included
 * here: it is only meaningful inside a compiled `run:` block and is applied by
 * {@link scanRunBlocks}.
 */
function detectShellShapeTokens(text: string): ContractToken[] {
  const tokens: ContractToken[] = [];
  if (detectPrintfFormat(text)) tokens.push('UNTRUSTED_PRINTF_FORMAT');
  if (detectCommandString(text)) tokens.push('UNTRUSTED_COMMAND_STRING');
  if (detectAwk(text)) tokens.push('UNTRUSTED_AWK_PROGRAM_OR_VAR');
  return tokens;
}

/**
 * Scan compiled `run:` blocks for every contract anti-pattern, including
 * UNTRUSTED_TEMPLATE_IN_RUN (an `${{ github.event.*.body }}` expression that
 * survived into a `run:` block). Returns one violation per (line, token).
 */
export function scanRunBlocks(blocks: RunBlock[], file: string): ContractViolation[] {
  const violations: ContractViolation[] = [];
  for (const block of blocks) {
    for (const { line, text } of block.lines) {
      if (TEMPLATE_ATTACKER_EVENT.test(text)) {
        violations.push({ token: 'UNTRUSTED_TEMPLATE_IN_RUN', file, line, evidence: text.trim() });
      }
      for (const token of detectShellShapeTokens(text)) {
        violations.push({ token, file, line, evidence: text.trim() });
      }
    }
  }
  return violations;
}

/**
 * Scan runtime-imported parser shell (the `/squad` parser one-liners in
 * `workflows/squad.md`) for the code-shape anti-patterns. These snippets are the
 * exact bytes gh-aw imports at runtime; they never reach the lock, so this is the
 * only surface on which the printf/eval/awk hops can be observed.
 */
export function scanShellLines(
  lines: Array<{ line: number; text: string }>,
  file: string
): ContractViolation[] {
  const violations: ContractViolation[] = [];
  for (const { line, text } of lines) {
    for (const token of detectShellShapeTokens(text)) {
      violations.push({ token, file, line, evidence: text.trim() });
    }
  }
  return violations;
}

/**
 * Extract the body lines of every fenced ```bash / ```sh block that references a
 * body-carrying variable, with absolute line numbers. This isolates the parser
 * code that actually handles attacker text from surrounding prose and correct-form
 * documentation examples.
 */
export function extractBodyHandlingShell(
  markdown: string
): Array<{ line: number; text: string }> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: Array<{ line: number; text: string }> = [];
  let inFence = false;
  let fenceLines: Array<{ line: number; text: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^[ \t]*```(bash|sh)[ \t]*$/);
    if (!inFence && open) {
      inFence = true;
      fenceLines = [];
      continue;
    }
    if (inFence && /^[ \t]*```[ \t]*$/.test(lines[i])) {
      inFence = false;
      if (fenceLines.some(fl => BODY_VAR.test(fl.text) || TEMPLATE_ATTACKER_EVENT.test(fl.text))) {
        out.push(...fenceLines);
      }
      continue;
    }
    if (inFence) fenceLines.push({ line: i + 1, text: lines[i] });
  }

  return out;
}

/** Render violations into a single, actionable diagnostic naming token, file, and line. */
export function formatViolations(violations: ContractViolation[]): string {
  return violations
    .map(v => `  ${v.token}  ${v.file}:${v.line}\n      ${v.evidence}`)
    .join('\n');
}
