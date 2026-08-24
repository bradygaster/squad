/**
 * Squad CLI activation pin consistency (#1825)
 *
 * `workflows/shared/squad.md` states the pinned CLI version twice: once as prose in
 * the header comment that documents `vars.SQUAD_CLI_VERSION`, and once as the literal
 * fallback that activation actually resolves. Two copies of a version number drift
 * against each other, and the prose copy is the one a human reads when deciding
 * whether activation is current — so a stale comment misinforms precisely the person
 * trying to verify the pin.
 *
 * This suite is the offline half of the guard. The online half
 * (`.github/workflows/squad-cli-pin-drift.yml`) compares the pin against npm's
 * published `dist-tags.latest` on a schedule; it cannot run here because it needs the
 * network, and a network call in the unit suite fails closed on an offline machine.
 *
 * Split that way, each half checks something the other structurally cannot:
 *   - here: the file agrees with itself, on every PR, deterministically
 *   - there: the file agrees with reality, daily
 *
 * Neither reads `packages/squad-cli/package.json`. That holds the next *unreleased*
 * version — 0.13.0 while this was written, which resolves to E404 on npm — so deriving
 * the pin from it reproduces the exact breakage PR #1818 fixed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const PIN_FILE = join(process.cwd(), 'workflows', 'shared', 'squad.md');
const DOCS_FILE = join(
  process.cwd(),
  'docs',
  'src',
  'content',
  'docs',
  'guide',
  'gh-aw.md',
);
const BUMP_SCRIPT = join(process.cwd(), 'scripts', 'bump-activation-pin.mjs');
const PUBLISH_WORKFLOW = join(
  process.cwd(),
  '.github',
  'workflows',
  'squad-npm-publish.yml',
);
const DRIFT_WORKFLOW = join(
  process.cwd(),
  '.github',
  'workflows',
  'squad-cli-pin-drift.yml',
);

function readPinFile(): string {
  return readFileSync(PIN_FILE, 'utf8');
}

/** The literal activation resolves: `vars.SQUAD_CLI_VERSION || '<version>'`. */
function effectivePin(source: string): string | undefined {
  return source.match(/SQUAD_CLI_VERSION:\s*\$\{\{\s*vars\.SQUAD_CLI_VERSION\s*\|\|\s*'([^']+)'/)?.[1];
}

/** The version quoted in the header comment that documents the default. */
function documentedPin(source: string): string | undefined {
  return source.match(/^#\s*Default is ([0-9][^\s.]*(?:\.[^\s.]+)*)\.\s*$/m)?.[1];
}

describe('Squad CLI activation pin (#1825)', () => {
  it('states a resolvable pin', () => {
    const pin = effectivePin(readPinFile());

    // If this stops matching, the drift workflow's extraction has almost certainly
    // stopped matching too — and it would report "no drift" against a pin it never
    // found. Failing here makes that visible on the PR that reshapes the line.
    expect(pin, 'could not locate the SQUAD_CLI_VERSION fallback literal').toBeDefined();
    expect(pin).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('documents the same version it resolves', () => {
    const source = readPinFile();

    expect(documentedPin(source), 'header comment does not document a default version').toBeDefined();
    expect(documentedPin(source)).toBe(effectivePin(source));
  });

  it('does not carry a second, unreachable default', () => {
    const source = readPinFile();
    const pin = effectivePin(source);

    // `SQUAD_CLI_VERSION` is set from `vars.X || '<pin>'`, which always yields a
    // non-empty string, so a shell `${SQUAD_CLI_VERSION:-<pin>}` fallback can never
    // fire. It is unreachable code whose only real effect is to be a third place the
    // version can go stale — and being unreachable, it goes stale invisibly.
    expect(source).not.toMatch(/\$\{SQUAD_CLI_VERSION:-/);

    // Belt and braces: no *other* copy of the version string in an npx invocation.
    const npxLines = source.split(/\r?\n/).filter((l) => l.includes('squad-cli@'));
    for (const line of npxLines) {
      expect(line, `npx line hardcodes a version instead of using the env var: ${line.trim()}`)
        .not.toContain(`squad-cli@${pin}`);
    }
  });

  it('keeps the drift guard pointed at npm rather than the repo', () => {
    const workflow = readFileSync(DRIFT_WORKFLOW, 'utf8');

    // Comments are stripped first. The header comment names the trap deliberately, to
    // explain why the guard avoids it — documenting a hazard should not trip the check
    // that enforces it. What must not appear is the path in *executable* lines.
    const executable = workflow
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith('#'))
      .join('\n');

    // The trap this issue was filed to avoid: the CLI package manifest holds the next
    // unreleased version, so a guard reading it would compare the repo to itself and
    // then "fix" the pin to something npm cannot install.
    expect(executable).not.toMatch(/packages\/squad-cli\/package\.json/);
    expect(executable).toMatch(/dist-tags\.latest/);
  });

  it('passes values into shell through env, not expression interpolation', () => {
    const workflow = readFileSync(DRIFT_WORKFLOW, 'utf8');

    // Per the shell-input contract in workflows/squad.md: `${{ }}` is substituted into
    // the script text *before* the shell parses it, so quoting cannot contain a hostile
    // value — the value has already become code. Only `env:` mapping is safe.
    //
    // This guard also catches a subtler mistake made while writing this workflow: a
    // literal `${{ ... }}` intended as documentation inside an issue body was silently
    // evaluated by Actions instead of printed.
    const lines = workflow.split(/\r?\n/);
    const offenders: string[] = [];
    let inRun = false;
    let runIndent = 0;

    for (const line of lines) {
      const indent = line.length - line.trimStart().length;
      if (inRun && line.trim() !== '' && indent <= runIndent) inRun = false;
      if (inRun && line.includes('${{')) offenders.push(line.trim());
      if (/^\s*run:\s*\|/.test(line)) {
        inRun = true;
        runIndent = indent;
      }
    }

    expect(offenders, `expression interpolation inside run: blocks:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('keeps its SC2016 suppression honest', () => {
    const workflow = readFileSync(DRIFT_WORKFLOW, 'utf8');

    // The issue-body builder disables SC2016 because shellcheck reads the markdown
    // BACKTICKS in its printf format strings as command substitution and, correctly,
    // reports that they will not expand inside single quotes. That is the intended
    // behaviour — they are literal code spans in the rendered issue.
    //
    // But SC2016 also catches a real defect class: writing '$VAR' in single quotes
    // while expecting expansion, which silently emits the literal text "$VAR". The
    // suppression would hide that too. This test restores exactly that coverage, so
    // the disable removes the false positives without removing the check.
    //
    // Values must reach printf as ARGUMENTS ("$PINNED"), never inside the format string.
    const singleQuoted = [...workflow.matchAll(/'([^'\n]*)'/g)].map(m => m[1]);
    const offenders = singleQuoted.filter(s => /\$[A-Za-z_{]/.test(s));

    expect(
      offenders,
      'single-quoted literals containing a $expansion — these will emit the literal text, ' +
        `not the value, and SC2016 is suppressed here so shellcheck will not say so:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('documents the same version in the published guide', () => {
    const pin = effectivePin(readPinFile());
    const docs = readFileSync(DOCS_FILE, 'utf8');

    // A third copy of the version, in the page that tells people what activation
    // installs. It is outside the workflow file, so neither the drift guard's npm
    // comparison nor the two checks above ever looked at it — it could sit stale
    // indefinitely while every other guard reported green.
    const documented = docs.match(
      /\|\s*`SQUAD_CLI_VERSION`[^|\n]*\|[^|\n]*\|\s*`([^`\n]+)`\s*\|/,
    )?.[1];

    expect(documented, 'gh-aw guide no longer states a SQUAD_CLI_VERSION default').toBeDefined();
    expect(documented).toBe(pin);
  });

  it('can still find every place it has to rewrite', () => {
    const pin = effectivePin(readPinFile());

    // Runs the real bumper against the version already pinned. That is an identity
    // rewrite, so it touches nothing — but it exercises all three patterns for real,
    // which is the only way to prove they still match. A pattern that quietly stops
    // matching turns the release-time bump into a no-op, and the whole failure mode
    // #1825 describes is a guard that decays without saying anything.
    const env = { ...process.env, TARGET_VERSION: pin as string };
    delete env.GITHUB_OUTPUT;
    delete env.PR_BODY_FILE;

    const output = execFileSync(process.execPath, [BUMP_SCRIPT], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env,
    });

    expect(output).toContain('already');
  });

  it('wires the bump into the run that publishes', () => {
    const workflow = readFileSync(PUBLISH_WORKFLOW, 'utf8');

    // Prevention has to be attached to publishing itself. If the bump job is dropped,
    // or stops depending on the publish that makes the version installable, the pin
    // goes back to decaying silently and only the daily backstop notices — a day late,
    // as a red build.
    expect(workflow).toMatch(/bump-activation-pin:/);
    expect(workflow).toMatch(/needs:\s*publish-cli/);
    expect(workflow).toContain('scripts/bump-activation-pin.mjs');

    // The bump must land where the pin lives. Releases are cut from `main`; a bump
    // committed there would edit a file the default branch never sees.
    expect(workflow).toMatch(/--base dev/);
  });

  it('never derives the pin from the unreleased in-repo manifest', () => {
    const script = readFileSync(BUMP_SCRIPT, 'utf8');

    const executable = script
      .split(/\r?\n/)
      .filter((l) => {
        const t = l.trimStart();
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
      })
      .join('\n');

    // Same trap as the drift guard: `packages/squad-cli/package.json` holds the next
    // unreleased version, so a bumper reading it would pin activation to something npm
    // cannot install — reproducing PR #1818's breakage automatically, every release.
    expect(executable).not.toMatch(/packages\/squad-cli\/package\.json/);
  });
});
