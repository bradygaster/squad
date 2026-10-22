/**
 * Retired-symbol gate (Squad 2.0).
 *
 * Personal squads, consult mode, Ghost Protocol and the global (`--global`) squad were
 * removed from the product. This test greps every tracked file — source, templates,
 * skills, docs, help text, schemas, fixtures, workflows, scripts, tests — plus the built
 * `dist/` output that ships in the npm tarballs, for the retired names and phrases.
 *
 * The allowlist is deliberately tiny and explicit:
 *  - the single BREAKING changeset line (and the release CHANGELOGs it is folded into);
 *  - release history for versions that *shipped* the feature (whatsnew ≤ v1.1.0,
 *    contributor credits), which is kept as history, not as documentation;
 *  - the two tombstone tests that must name the directories to prove they are never
 *    touched, and this file.
 *
 * Add nothing else here without a decision record.
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/** Case-insensitive patterns. Keep them specific: plain-English "consulted" must not match. */
const RETIRED_PATTERNS: Array<[string, RegExp]> = [
  ['personal squad', /personal[- ]squads?\b/i],
  ['personalDir / resolvePersonalSquadDir / ensurePersonalSquadDir', /\b(personalDir|resolvePersonalSquadDir|ensurePersonalSquadDir|ensureSquadPathTriple)\b/],
  ['SQUAD_NO_PERSONAL / SQUAD_PERSONAL_DIR', /\bSQUAD_(NO_PERSONAL|PERSONAL_DIR)\b/],
  ['legacy personal importer / detector', /\b(legacyPersonalSquad\w*|detectLegacyPersonalSquad|LegacyPersonalSquadInfo)\b|--legacy-personal/],
  ['personal agents API', /\b(resolvePersonalAgents|mergeSessionCast|agents\/personal)\b/],
  ['consult mode', /\bconsult[- ]mode\b|\bsquad consult\b|\b(isConsultMode|setupConsultMode|consultMode)\b|sharing\/consult\b/i],
  ['squad extract / extractLearnings', /\bsquad extract\b|\b(extractLearnings|extractionDisabled|mergeToPersonalSquad)\b/],
  ['Ghost Protocol', /ghost[- ]?protocol/i],
  ['global squad', /\bglobal squad\b|\b(init|upgrade) --global\b|\b(globalSquadDir|isGlobal|hasGlobal|resolveSquadPath|MultiSquadConfig)\b|\bSQUAD_GLOBAL\w*/i],
];

/** Files allowed to mention retired terms, with the reason. */
const ALLOWLIST: Record<string, string> = {
  '.changeset/squad2-c-personal-removal-and-fixes.md': 'the single BREAKING entry',
  'CHANGELOG.md': 'release history',
  'packages/squad-cli/CHANGELOG.md': 'release history',
  'packages/squad-sdk/CHANGELOG.md': 'release history',
  'docs/src/content/docs/guide/contributors.md': 'contributor credit for a 1.x PR',
  'test/profile-squad-tombstone.test.ts': 'tombstone test must name the directories it proves untouched',
  'test/cli-outside-project.test.ts': 'tombstone test must name the directories it proves untouched',
  'test/retired-symbols.test.ts': 'this gate',
};

/** Whatsnew: only the current (2.0) section is documentation; older sections are history. */
const PARTIAL_SCAN: Record<string, (content: string) => string> = {
  'docs/src/content/docs/whatsnew.md': (c) => c.slice(0, c.indexOf('\n## v1.1.0')),
};

const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.pdf', '.tgz', '.zip', '.lock']);
const SKIP_FILES = new Set(['package-lock.json']);

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

function distFiles(): string[] {
  const files: string[] = [];
  for (const pkg of ['packages/squad-sdk/dist', 'packages/squad-cli/dist']) {
    const base = join(ROOT, pkg);
    if (!existsSync(base)) continue;
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(js|d\.ts|json|md)$/.test(name) && !name.endsWith('.map')) files.push(relative(ROOT, p).replace(/\\/g, '/'));
      }
    };
    walk(base);
  }
  return files;
}

function scan(files: string[]): string[] {
  const hits: string[] = [];
  for (const rel of files) {
    if (rel in ALLOWLIST || SKIP_FILES.has(rel.split('/').pop() ?? '')) continue;
    const ext = rel.slice(rel.lastIndexOf('.')).toLowerCase();
    if (SKIP_EXT.has(ext)) continue;
    const abs = join(ROOT, rel);
    if (!existsSync(abs) || statSync(abs).isDirectory()) continue;
    let content = readFileSync(abs, 'utf8');
    if (content.includes('\u0000')) continue; // binary
    if (rel in PARTIAL_SCAN) content = PARTIAL_SCAN[rel]!(content);
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const [label, re] of RETIRED_PATTERNS) {
        if (re.test(line)) hits.push(`${rel}:${i + 1} [${label}] ${line.trim().slice(0, 140)}`);
      }
    });
  }
  return hits;
}

describe('retired-symbol gate: no trace of personal squads, consult mode, Ghost Protocol or the global squad', () => {
  it('tracked files (src, templates, skills, docs, help, schemas, fixtures, workflows, scripts, tests)', () => {
    const hits = scan(trackedFiles());
    expect(hits, `retired terms found; remove them (or add a decision record before extending the allowlist):\n${hits.join('\n')}`).toEqual([]);
  }, 120_000);

  it('built dist/ output that ships in the npm tarballs', () => {
    const files = distFiles();
    if (files.length === 0) return; // not built in this checkout; CI builds before testing
    const hits = scan(files);
    expect(hits, `retired terms found in built output (stale dist? run the build):\n${hits.join('\n')}`).toEqual([]);
  }, 120_000);

  it('the allowlisted files still exist and the BREAKING entry is exactly one line', () => {
    for (const rel of Object.keys(ALLOWLIST)) {
      if (rel.endsWith('CHANGELOG.md')) continue; // created by changesets at release time
      expect(existsSync(join(ROOT, rel)), `${rel} is allowlisted but missing — prune the allowlist`).toBe(true);
    }
    const changeset = readFileSync(join(ROOT, '.changeset/squad2-c-personal-removal-and-fixes.md'), 'utf8');
    const lines = changeset.split(/\r?\n/);
    const breaking = lines.filter((l) => /\*\*BREAKING:\*\*/.test(l));
    expect(breaking, 'exactly one BREAKING line').toHaveLength(1);
    expect(breaking[0]).toContain('Personal squads, consult mode and the global squad (`--global`) were removed; existing `personal-squad/` and global `.squad/` directories under the user profile are no longer read or written and may be deleted manually.');
    const mentioning = lines.filter((l) => RETIRED_PATTERNS.some(([, re]) => re.test(l)));
    expect(mentioning, 'only the BREAKING line may name the retired concepts').toEqual(breaking);
  });
});
