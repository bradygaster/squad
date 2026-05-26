/**
 * CI tests for current datetime propagation in Squad templates.
 *
 * Canonical source: .squad-templates/
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function readTemplate(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
}

describe('current datetime template contract', () => {
  const squadTemplate = readTemplate('.squad-templates/squad.agent.md');
  const spawnReference = readTemplate('.squad-templates/spawn-reference.md');
  const afterAgentReference = readTemplate('.squad-templates/after-agent-reference.md');
  const scribeCharter = readTemplate('.squad-templates/scribe-charter.md');

  // Coordinator + reference files that carry spawn templates and after-agent instructions.
  // PR #1035 moved spawn-template details out of squad.agent.md into on-demand reference files.
  const allCoordinatorTemplates = [squadTemplate, spawnReference, afterAgentReference].join('\n');

  it('requires resolving and validating the runtime current datetime once per session', () => {
    const sessionStart = squadTemplate.slice(
      squadTemplate.indexOf('**On every session start:**'),
      squadTemplate.indexOf('**Resolve state backend:**'),
    );

    expect(sessionStart).toContain('<current_datetime>');
    expect(sessionStart).toContain('Resolve `CURRENT_DATETIME` once');
    expect(sessionStart).toContain('Sanity-check');
    expect(sessionStart).toContain('plausible year and timezone');
    expect(sessionStart).toContain('local date command');
    expect(sessionStart).toContain('Never pass placeholder text for `CURRENT_DATETIME`');
  });

  it('does not pass unresolved current_datetime placeholders to spawned agents', () => {
    expect(squadTemplate).not.toContain('CURRENT_DATETIME: {current_datetime}');
    expect(squadTemplate).not.toContain('"{current_datetime}"');
    expect(squadTemplate).not.toContain('CURRENT_DATETIME: {CURRENT_DATETIME}');
  });

  it('keeps every coordinator spawn template wired with CURRENT_DATETIME', () => {
    // PR #1035 moved spawn-template details to spawn-reference.md and after-agent-reference.md.
    // Count across all coordinator-owned template files.
    const currentDatetimeLines = allCoordinatorTemplates
      .split('\n')
      .filter(line => line.includes('CURRENT_DATETIME:'));

    expect(currentDatetimeLines.length).toBeGreaterThanOrEqual(4);
    for (const line of currentDatetimeLines) {
      expect(line).toContain('<resolved CURRENT_DATETIME literal>');
    }
  });

  it('tells agents to substitute the literal datetime in command examples', () => {
    // These strings live in spawn-reference.md after PR #1035 moved spawn templates there.
    expect(spawnReference).toContain('<literal CURRENT_DATETIME value from your prompt>');
    expect(spawnReference).toContain('Substitute the actual CURRENT_DATETIME value');
  });

  it('keeps Scribe from writing placeholder datetime headings', () => {
    expect(scribeCharter).not.toContain('### {CURRENT_DATETIME}:');
    expect(scribeCharter).not.toContain('({timestamp})');
    expect(scribeCharter).toContain('### <CURRENT_DATETIME value>:');
    expect(scribeCharter).toContain('Substitute the actual timestamp');
    expect(scribeCharter).toContain('Replace the parenthetical timestamp with the literal CURRENT_DATETIME value');
    expect(scribeCharter).toContain('do not write placeholder text');
  });
});
