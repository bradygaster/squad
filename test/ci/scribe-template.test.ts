/**
 * Contract tests for the bounded Scribe support identity.
 *
 * Canonical source: .squad-templates/scribe-charter.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const content = readFileSync(resolve(ROOT, '.squad-templates/scribe-charter.md'), 'utf-8');

describe('Scribe charter — bounded durable-decision contract', () => {
  it('limits ownership to durable decisions and their inbox', () => {
    expect(content).toContain('`.squad/decisions.md`');
    expect(content).toContain('`.squad/decisions/inbox/`');
    expect(content).toContain('does not create specialist histories, orchestration logs, session logs');
  });

  it('uses runtime state tools for non-local backends', () => {
    expect(content).toContain('Use runtime state tools for non-local backends');
    expect(content).toContain('If required state tools');
    expect(content).toContain('are unavailable, stop without mutating state');
  });

  it('preserves inbox content structure while merging', () => {
    expect(content).toContain('Merge only accepted, current decisions');
    expect(content).toContain('Demote inbox headings');
    expect(content).toContain('preserving relative');
    expect(content).toContain('fenced code blocks');
  });

  it('verifies persistence before deleting inbox sources', () => {
    expect(content).toContain('Re-read `decisions.md`');
    expect(content).toContain('confirm each merged entry is present before deleting');
    expect(content).toContain('Run the state health check');
  });

  it('forbids unrelated work and remains invisible', () => {
    expect(content).toContain("**I don't handle:** Session logging");
    expect(content).toContain('review, implementation,');
    expect(content).toContain('or decision-making.');
    expect(content).toContain('**I am invisible.**');
  });

  it('names no session log or retrospective as an exclusive artifact', () => {
    const paragraph = content.split(/\r?\n/).find(line => line.startsWith('**Exclusive canonical artifacts:**')) ?? '';
    expect(paragraph).toContain('squad_state_create_if_absent');
    expect(paragraph).not.toMatch(/session log|retrospective/i);
  });
});

describe('Scribe contract — every prompt surface agrees with the charter', () => {
  const read = (relPath: string) => readFileSync(resolve(ROOT, relPath), 'utf-8').replace(/\r\n/g, '\n');
  const promptAfter = (text: string, marker: string) => {
    const open = text.indexOf('```', text.indexOf(marker));
    const block = text.slice(open + 3, text.indexOf('```', open + 3));
    return block.slice(block.indexOf('prompt: |'));
  };
  const inline = promptAfter(read('.squad-templates/squad.agent.md'), '**Scribe Spawn Template**');
  const afterAgent = promptAfter(read('.squad-templates/after-agent-reference.md'), '**Spawn Scribe**');

  it('after-agent-reference.md repeats the coordinator inline Scribe prompt exactly', () => {
    expect(afterAgent).toBe(inline);
  });

  it('no Scribe spawn prompt asks for logs, history writes or archival', () => {
    for (const prompt of [inline, afterAgent]) {
      expect(prompt).not.toMatch(/SESSION LOG|ORCHESTRATION LOG|CROSS-AGENT|HISTORY SUMMARIZATION|DECISIONS ARCHIVE/);
    }
  });

  it('no template file assigns Scribe a retired duty', () => {
    // Retired phrases from the pre-#2030 broad Scribe. Checked in every file under
    // .squad-templates/ (mirrors are pinned to it by template-sync.test.ts).
    const retired = [
      '**Scribe always runs**',
      'handled by Scribe',
      'Scribe handles',
      'Spawn Scribe (background) at ceremony start',
      'Spawn Scribe (background) to record',
      'Scribe (cross-agent updates',
      'Memory, decisions, session logs',
      "that's Scribe's job",
      'Log session & merge decisions',
      'Scribe — logging session',
      'and Scribe log',
      'orchestration log via Scribe',
      'cross-agent context sharing',
      'Scribe / Logger',
      'Scribe or designated',
    ];
    const files = (readdirSync(resolve(ROOT, '.squad-templates'), { recursive: true }) as string[])
      .map((f) => `.squad-templates/${f.replace(/\\/g, '/')}`)
      .filter((f) => statSync(resolve(ROOT, f)).isFile());
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      const text = read(file);
      for (const phrase of retired) expect(text, `${file}: ${phrase}`).not.toContain(phrase);
    }
  });

  it('the gh-aw builtin charter matches the template charter', () => {
    expect(read('workflows/shared/builtins/scribe-charter.md')).toBe(read('.squad-templates/scribe-charter.md'));
  });

  it('the watch decision-hygiene prompt defers to the charter and does not archive', () => {
    const source = read('packages/squad-cli/src/cli/commands/watch/capabilities/decision-hygiene.ts');
    expect(source).toContain('Read .squad/agents/scribe/charter.md');
    expect(source).not.toContain('If you archive anything');
  });
});
