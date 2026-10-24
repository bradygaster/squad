/**
 * Explicit optional built-in roster contract (#2298).
 *
 * Upgrade and host projection rollback never own team.md. Only `squad roster` may add optional
 * built-ins, and it records exact provenance so it can remove only rows it added.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { runUpgrade } from '@bradygaster/squad-cli/core/upgrade';
import { CLIENT_IDS, type ClientContext } from '../../packages/squad-sdk/src/client/index.js';
import { uninstallClients } from '../../packages/squad-sdk/src/client/adapters/index.js';
import { runRosterCommand } from '../../packages/squad-cli/src/cli/commands/roster.js';

const TEAM = `# Team

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Picard | Lead | \`.squad/agents/picard/charter.md\` | ✅ Active |
| Scribe | Session Logger | \`.squad/agents/scribe/charter.md\` | 📋 Silent |
| Ralph | Work Monitor | \`.squad/agents/ralph/charter.md\` | 🔄 Monitor |

## Human Members

| Name | Role | Interaction Channel | Notes |
|------|------|---------------------|-------|
| Tamir | Owner | CLI | — |
`;

describe('team.md optional built-in roster contract (#2298)', () => {
  let root: string;
  let home: string;
  let teamPath: string;
  const logs: string[] = [];

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'squad-roster-'));
    home = mkdtempSync(path.join(tmpdir(), 'squad-roster-home-'));
    process.env.SQUAD_HOME_DIR_OVERRIDE = home;
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    await runInit(root);
    teamPath = path.join(root, '.squad', 'team.md');
    writeFileSync(teamPath, TEAM);
    logs.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SQUAD_HOME_DIR_OVERRIDE;
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('upgrade and dry-run leave absent optional agents absent in a %s roster', async (_label, eol) => {
    const before = Buffer.from(TEAM.replace(/\n/g, eol));
    writeFileSync(teamPath, before);

    await runUpgrade(root, { dryRun: true });
    expect(readFileSync(teamPath)).toEqual(before);
    await runUpgrade(root);

    expect(readFileSync(teamPath)).toEqual(before);
    expect(readFileSync(teamPath, 'utf8')).not.toMatch(/^\| (Rai|Fact Checker) \|/m);
  }, 30_000);

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('upgrade and projection uninstall preserve exact %s team.md bytes', async (_label, eol) => {
    const before = Buffer.from(TEAM.replace(/\n/g, eol));
    writeFileSync(teamPath, before);
    await runUpgrade(root);

    const context: ClientContext = {
      root,
      mcp: { command: 'squad', args: ['state-mcp'] },
    };
    const results = uninstallClients([...CLIENT_IDS], context);
    expect(results.some((result) => result.action === 'error')).toBe(false);
    expect(readFileSync(teamPath)).toEqual(before);
  }, 30_000);

  it('explicit enable adds only requested rows and preserves equivalent or case-only rows', async () => {
    const custom = TEAM
      .replace('| Ralph | Work Monitor |', '| rAi | Custom Reviewer |')
      .replace('`.squad/agents/ralph/charter.md`', '`.SQUAD/AGENTS/RAI/CHARTER.MD`')
      + '\n<!-- custom footer -->\n';
    writeFileSync(teamPath, custom);

    expect(await runRosterCommand(root, ['add', 'all'])).toBe(0);

    const after = readFileSync(teamPath, 'utf8');
    expect(after).toContain('<!-- custom footer -->');
    expect(after.match(/^\| rAi \|/gm)).toHaveLength(1);
    expect(after.match(/^\| Rai \|/gm)).toBeNull();
    expect(after.match(/^\| Fact Checker \|/gm)).toHaveLength(1);
  });

  it('repeated enable is idempotent and dry-run previews the exact diff without writing', async () => {
    const before = readFileSync(teamPath);
    expect(await runRosterCommand(root, ['add', 'rai', '--dry-run'])).toBe(0);
    expect(readFileSync(teamPath)).toEqual(before);
    expect(logs.join('\n')).toContain('+++ .squad/team.md');
    expect(logs.join('\n')).toContain('+| Rai | RAI Reviewer |');

    expect(await runRosterCommand(root, ['add', 'rai'])).toBe(0);
    const once = readFileSync(teamPath);
    expect(await runRosterCommand(root, ['add', 'RAI'])).toBe(0);
    expect(readFileSync(teamPath)).toEqual(once);
    expect(readFileSync(teamPath, 'utf8').match(/^\| Rai \|/gm)).toHaveLength(1);
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('disable and uninstall remove only owned rows and restore exact prior %s bytes', async (_label, eol) => {
    const original = Buffer.from(TEAM.replace(/\n/g, eol));
    writeFileSync(teamPath, original);
    expect(await runRosterCommand(root, ['add', 'all'])).toBe(0);

    expect(await runRosterCommand(root, ['disable', 'rai'])).toBe(0);
    const partial = readFileSync(teamPath, 'utf8');
    expect(partial).not.toMatch(/^\| Rai \|/m);
    expect(partial).toMatch(/^\| Fact Checker \|/m);
    expect(await runRosterCommand(root, ['uninstall', 'fact-checker'])).toBe(0);

    expect(readFileSync(teamPath)).toEqual(original);
    expect(existsSync(path.join(root, '.squad', '.roster-provenance.json'))).toBe(false);
    expect(existsSync(path.join(root, '.squad', 'team.md.roster-backup'))).toBe(false);
  });
});
