/**
 * E2E Runbook Hygiene
 *
 * E-scenario runbooks in `.squad/e2e/` ship as documented shell commands that a
 * human operator pastes into a terminal. Nothing executes them in CI, so a
 * command that cannot run at all can sit in a runbook indefinitely.
 *
 * That is only a documentation bug until it meets a gate whose pass condition is
 * universally quantified ("every X in the result set must be Y"). Such a
 * condition is **vacuously true over the empty set**, so a command that fails and
 * returns nothing does not merely fail to inform the verdict — it writes the
 * *passing* answer into it.
 *
 * That is exactly what happened in E4 Phase 3b (#1822): `gh` was invoked with a
 * `--arg` flag it does not have, `--jq` swallowed `--arg` as its expression, `gh`
 * exited 1 with empty stdout on every run, and `2>$null` hid the error. The two
 * verdict fields marked `# dispositive` — where `true` is the FAIL evidence —
 * were handed their `false` by an infrastructure failure.
 *
 * PR #1821 fixed that instance. This suite exists so the *class* cannot recur:
 * it executes no commands and needs no fixture, network, or Actions minutes, yet
 * it fails the build the moment a runbook regains either property that made the
 * silent pass possible.
 *
 * Measured at introduction: 16 of 17 stderr-suppression sites already paired with
 * an exit-code check, so this codifies discipline the runbooks already practice
 * rather than imposing a new one.
 *
 * See `.squad/e2e/README.md` § Runbook conventions for the companion rule that
 * cannot be mechanized: a universally-quantified gate must assert its input set
 * is non-empty before evaluating.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const E2E_DIR = join(process.cwd(), '.squad', 'e2e');

/** How many lines after a suppression may carry its exit-code check. */
const EXIT_CHECK_WINDOW = 6;

/**
 * Read a text file with line endings normalized to LF.
 *
 * Markdown in this repo is not pinned to LF in .gitattributes, so Windows
 * checkouts materialize CRLF. Normalize on read rather than making each regex
 * CRLF-aware.
 */
function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

interface CodeLine {
  /** 1-based line number in the source markdown. */
  line: number;
  text: string;
}

/**
 * Return the executable lines of every fenced code block in a markdown file.
 *
 * Prose is excluded because runbooks legitimately *describe* these hazards in
 * comments — E4 documents the `--jq --arg` defect verbatim so the next reader
 * understands why the guard exists. A linter that flagged its own postmortem
 * would punish the documentation that prevents recurrence.
 *
 * Comment lines are excluded for the same reason.
 */
function executableLines(markdown: string): CodeLine[] {
  const out: CodeLine[] = [];
  let inFence = false;

  markdown.split('\n').forEach((raw, idx) => {
    if (raw.trimStart().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (!inFence) return;

    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;

    out.push({ line: idx + 1, text: raw });
  });

  return out;
}

/**
 * Join shell line-continuations into single logical commands.
 *
 * A `gh` invocation is routinely split across physical lines with a trailing
 * PowerShell backtick or POSIX backslash. Flag misuse must be judged against the
 * whole command, not one fragment of it. The reported line number stays that of
 * the first physical line so the failure points at the start of the command.
 */
function logicalCommands(lines: CodeLine[]): CodeLine[] {
  const out: CodeLine[] = [];
  let pending: CodeLine | null = null;

  for (const cur of lines) {
    const continues = /[`\\]\s*$/.test(cur.text);
    const body = cur.text.replace(/[`\\]\s*$/, ' ');

    if (pending) {
      pending = { line: pending.line, text: `${pending.text}${body}` };
    } else {
      pending = { line: cur.line, text: body };
    }

    if (!continues) {
      out.push(pending);
      pending = null;
    }
  }

  if (pending) out.push(pending);
  return out;
}

function runbooks(): string[] {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(E2E_DIR, f));
}

describe('E2E runbook hygiene', () => {
  it('finds runbooks to lint', () => {
    // Guards this suite against the failure mode it exists to prevent: if the
    // glob silently matched nothing, every assertion below would pass over an
    // empty set and prove nothing.
    expect(runbooks().length).toBeGreaterThan(0);
  });

  /**
   * `--arg` is a jq flag, not a gh flag. `gh` rejects it, and because `--jq`
   * consumes the next token as its expression the remainder degrade into stray
   * positionals — producing exit 1 and empty stdout rather than an obvious
   * parse error. Interpolate the value into the jq expression in the host shell
   * instead.
   */
  it('never passes --arg to gh', () => {
    const offenders: string[] = [];

    for (const file of runbooks()) {
      for (const cmd of logicalCommands(executableLines(readText(file)))) {
        if (/\bgh\s/.test(cmd.text) && /\s--arg\b/.test(cmd.text)) {
          offenders.push(`${file}:${cmd.line} — ${cmd.text.trim()}`);
        }
      }
    }

    expect(
      offenders,
      `gh has no --arg flag. It exits 1 with empty stdout, which a ` +
        `universally-quantified gate reads as a pass. Build the jq expression ` +
        `in the shell and pass it as a single --jq argument:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * Suppressing stderr is legitimate — runbooks do it to keep transcripts
   * readable — but only when the command's success is established some other
   * way. Unpaired, it converts a hard failure into an empty result that reads
   * as a pass.
   */
  it('pairs every stderr suppression with an exit-code check', () => {
    const offenders: string[] = [];

    for (const file of runbooks()) {
      const lines = executableLines(readText(file));

      lines.forEach((cur, idx) => {
        if (!/2>\s*(\$null|\/dev\/null)/.test(cur.text)) return;

        const window = lines
          .slice(idx, idx + EXIT_CHECK_WINDOW)
          .map((l) => l.text)
          .join('\n');

        const checksExit = /\$LASTEXITCODE|\$\?|\bexit\s+code\b/i.test(window);
        if (!checksExit) {
          offenders.push(`${file}:${cur.line} — ${cur.text.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `Suppressed stderr without a nearby exit-code check. A failed command ` +
        `then yields an empty result set, and a gate phrased "every X must be ` +
        `Y" passes vacuously on it. Capture $LASTEXITCODE and report ` +
        `INCONCLUSIVE — never a verdict value — when it is non-zero:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
