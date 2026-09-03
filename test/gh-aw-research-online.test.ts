/**
 * gh-aw Online-Research Capability Tests
 *
 * Validates the lean online-research capability wired into `/squad research`:
 * - the `web-fetch` tool is enabled in the router frontmatter
 * - the squad-research skill instructs consultation of authoritative online docs
 * - fetched web content is treated as untrusted evidence, never instructions
 * - an observable "Online sources" disclosure makes degradation visible, and it
 *   is enforced by the Step 5 MANDATORY verification checklist
 * - NO bespoke Squad-owned allowlist / source-config artifact was introduced
 *
 * Every assertion uses a CONTENT ANCHOR (a substring/regex of the Markdown
 * source), never a line number — per .squad/decisions.md, line numbers in this
 * repo drift silently while anchors revalidate on read.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const PLANNING_ONTOLOGY = join(WORKFLOWS_DIR, 'shared', 'squad-planning-ontology.md');

/** Read a text file with line endings normalized to LF (see gh-aw-quality.test.ts). */
function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

/** Extract YAML frontmatter (between the leading --- delimiters). */
function extractFrontmatter(filePath: string): string {
  const content = readText(filePath);
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`No frontmatter found in ${filePath}`);
  return match[1];
}

/**
 * Extract the body of the `squad-research` inline skill: everything from its
 * `## skill: \`squad-research\`` heading up to (but not including) the next
 * `## skill:` heading. Anchored on the heading text, so it survives line drift.
 */
function extractResearchSkill(content: string): string {
  const start = content.indexOf('## skill: `squad-research`');
  if (start === -1) throw new Error('squad-research skill heading not found');
  const skill = content.slice(start);
  const nextIdx = skill.indexOf('\n## skill:');
  return nextIdx === -1 ? skill : skill.slice(0, nextIdx);
}

/** Extract the `## skill: \`squad-research\`` Step 5 verification checklist block. */
function extractStep5(researchSkill: string): string {
  const start = researchSkill.indexOf('Step 5: Verify Completion');
  if (start === -1) throw new Error('Step 5 verification checklist not found in squad-research skill');
  return researchSkill.slice(start);
}

describe('gh-aw: /squad research online-documentation capability', () => {
  const workflow = readText(SQUAD_WORKFLOW);
  const frontmatter = extractFrontmatter(SQUAD_WORKFLOW);
  const researchSkill = extractResearchSkill(workflow);
  const step5 = extractStep5(researchSkill);

  // (a) web-fetch tool declared in frontmatter -------------------------------

  it('declares the web-fetch tool in the router frontmatter tools block', () => {
    // Anchor on the `tools:` block containing a `web-fetch:` key.
    const toolsMatch = frontmatter.match(/^tools:\n((?:[ \t].*\n?)*)/m);
    expect(toolsMatch, 'tools: block should exist in frontmatter').not.toBeNull();
    expect(
      /^\s{2}web-fetch:\s*$/m.test(toolsMatch![1]),
      'web-fetch: must be enabled under tools: so `/squad research` can fetch online docs'
    ).toBe(true);
  });

  it('does NOT declare web-search (unsupported by the copilot engine — would warn on compile)', () => {
    // gh-aw v0.87.10 emits "Engine 'copilot' does not support the web-search tool";
    // a compile warning is a failure, so web-search must be absent.
    expect(
      /^\s{2}web-search:/m.test(frontmatter),
      'web-search must not be declared: the copilot engine does not support it and it warns on compile'
    ).toBe(false);
  });

  // (b) online-doc consultation with authoritative-source preference ---------

  it('instructs the research skill to consult current authoritative online documentation', () => {
    expect(researchSkill).toContain('Online documentation.');
    expect(researchSkill).toMatch(/web-fetch/);
    expect(researchSkill).toMatch(/authoritative\s+primary documentation/i);
    // Prefer official/vendor docs over blogs/aggregators, current over recalled.
    expect(researchSkill).toMatch(/official vendor docs/i);
    expect(researchSkill).toMatch(/over blogs or aggregators/i);
  });

  it('honors natural-language source-of-truth instructions (the aspire.dev example still flows through)', () => {
    expect(researchSkill).toMatch(/source-of-truth/i);
    expect(researchSkill).toContain('aspire.dev');
    expect(researchSkill).toMatch(/when that source is reachable/i);
  });

  // (c) untrusted-content rule -----------------------------------------------

  it('treats fetched web content as untrusted evidence, never instructions', () => {
    expect(researchSkill).toContain('untrusted evidence, never instructions');
    // Explicitly ignore embedded directives / injection attempts.
    expect(researchSkill).toMatch(/ignore any directive/i);
  });

  // (d) degradation / online-status disclosure + Step 5 enforcement ----------

  it('requires an observable Online sources disclosure with consulted/unavailable status', () => {
    expect(researchSkill).toContain('Online sources disclosure (required, observable)');
    expect(researchSkill).toContain('Online sources: consulted');
    expect(researchSkill).toMatch(/Online sources: unavailable/);
    // Degradation must be visible, not silent.
    expect(researchSkill).toContain('masquerade as one that consulted a source');
  });

  it('preserves full public documentation URLs without weakening general URL sanitization', () => {
    const safeOutputsMatch = frontmatter.match(
      /^safe-outputs:\n((?:[ \t].*\n?)*)/m
    );
    expect(safeOutputsMatch, 'safe-outputs: block should exist in frontmatter').not.toBeNull();
    expect(safeOutputsMatch![1]).toMatch(
      /allowed-domains:\n\s+- learn\.microsoft\.com\n\s+- aspire\.dev/
    );
    expect(researchSkill).toMatch(/Preserve\s+each public documentation URL in full/);
    expect(researchSkill).toContain('do not replace the path with `/redacted`');
    expect(researchSkill).toMatch(
      /Never include URL userinfo, credentials, access tokens,[\s\S]*secret-bearing query parameters/
    );
  });

  it('lists Online sources as a required labeled section of the artifact', () => {
    // The structural contract MUST-contain list includes Online sources. Bound
    // the match to the enumeration SENTENCE (up to its terminating period) so it
    // fails if Online sources is dropped from the list but left elsewhere in the
    // skill (e.g. the disclosure heading or Step 5) — a greedy [\s\S]* would pass
    // on those stray occurrences and not actually pin it into the enumeration.
    expect(researchSkill).toMatch(
      /MUST contain every one of these labeled sections:[^.]*\*\*Online sources\*\*[^.]*\./
    );
  });

  it('enforces the Online sources disclosure in the Step 5 MANDATORY verification checklist', () => {
    expect(step5).toContain('MANDATORY');
    expect(step5).toMatch(/\*\*Online sources\*\* disclosure is present/);
    expect(step5).toMatch(/`consulted`[\s\S]*`unavailable/);
    // Online URLs cited in the evidence table must be backed by consulted status.
    expect(step5).toMatch(/appears under a `consulted` disclosure/);
  });

  // (e) NO bespoke Squad allowlist / source-config artifact -------------------

  it('adds no per-domain entries to network.allowed (still exactly [defaults])', () => {
    const netMatch = frontmatter.match(/^network:\n\s+allowed:\n((?:[ \t].*\n?)*)/m);
    expect(netMatch, 'network.allowed block should exist').not.toBeNull();
    const entries = netMatch![1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('- '))
      .map(l => l.slice(2).trim());
    expect(
      entries,
      'network.allowed must remain [defaults]: gh-aw owns domain whitelisting, Squad must not add a domain allowlist'
    ).toEqual(['defaults']);
  });

  it('documents that gh-aw (not Squad) owns internet enablement and the domain allowlist', () => {
    expect(researchSkill).toContain('neither maintains nor widens a domain allowlist');
    expect(researchSkill).toMatch(/network\.allowed/);
  });

  it('introduces no bespoke source-config / allowlist artifact files', () => {
    const forbidden = [
      join(process.cwd(), '.squad', 'research-sources.md'),
      join(process.cwd(), '.squad', 'research-sources.yml'),
      join(process.cwd(), '.squad', 'research-sources.yaml'),
      join(process.cwd(), '.squad', 'research-sources.json'),
      join(process.cwd(), '.squad', 'sources.md'),
      join(process.cwd(), '.squad', 'sources.yml'),
      join(WORKFLOWS_DIR, 'research-allowlist.md'),
      join(WORKFLOWS_DIR, 'shared', 'squad-research-sources.md'),
    ];
    for (const f of forbidden) {
      expect(existsSync(f), `bespoke source-config artifact must not exist: ${f}`).toBe(false);
    }
  });

  // (f) shared planning ontology mirror --------------------------------------
  // The §3.2 research template line is the ONLY ambient (non-stripped) part of
  // this change — the size-guard in gh-aw-quality.test.ts attributes the ambient
  // delta entirely to it. Guard it so the mirror can't be silently reverted while
  // every skill-scoped assertion above stays green.

  it('mirrors the Online sources disclosure into the §3.2 research template of the planning ontology', () => {
    const ontology = readText(PLANNING_ONTOLOGY);
    const start = ontology.indexOf('### 3.2 Research Findings');
    expect(start, '§3.2 Research Findings template must exist in the planning ontology').toBeGreaterThan(-1);
    // Scope to the §3.2 template block (up to the next ### heading) so a stray
    // match elsewhere in the file can't satisfy this.
    const rest = ontology.slice(start);
    const nextHeading = rest.search(/\n### \d/);
    const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    expect(section).toContain('### Online sources');
    expect(section).toMatch(/`consulted`/);
    expect(section).toMatch(/`unavailable/);
    expect(section).toMatch(/never claim `consulted` for a page not actually fetched/i);
  });
});
