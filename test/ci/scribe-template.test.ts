/**
 * Contract tests for the bounded Scribe support identity.
 *
 * Canonical source: .squad-templates/scribe-charter.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
});
