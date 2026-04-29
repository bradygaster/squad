/**
 * Tests for team-manifest parsing extracted to SDK.
 * Verifies parseTeamManifest, getRoleEmoji, and loadWelcomeData
 * work correctly when imported from the SDK path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseTeamManifest,
  getRoleEmoji,
  loadWelcomeData,
  type DiscoveredAgent,
  type WelcomeData,
} from '@bradygaster/squad-sdk/runtime/team-manifest';

// ─── parseTeamManifest ──────────────────────────────────────────────

describe('parseTeamManifest', () => {
  const standardTable = `
# Squad Team — TestProject

> A test project

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Keaton | Lead | \`.squad/agents/keaton/charter.md\` | ✅ Active |
| EECOM | Core Dev | \`.squad/agents/eecom/charter.md\` | ✅ Active |
| Retro | Tester | \`.squad/agents/retro/charter.md\` | 🚫 Inactive |

## Decisions

Some decisions here.
`;

  it('parses standard Members table', () => {
    const agents = parseTeamManifest(standardTable);
    expect(agents).toHaveLength(3);
  });

  it('extracts name, role, charter path, status', () => {
    const agents = parseTeamManifest(standardTable);
    expect(agents[0]).toEqual({
      name: 'Keaton',
      role: 'Lead',
      charter: '.squad/agents/keaton/charter.md',
      status: 'Active',
    });
    expect(agents[1]).toEqual({
      name: 'EECOM',
      role: 'Core Dev',
      charter: '.squad/agents/eecom/charter.md',
      status: 'Active',
    });
  });

  it('strips emoji from status (✅ Active → Active)', () => {
    const agents = parseTeamManifest(standardTable);
    expect(agents[0]!.status).toBe('Active');
    expect(agents[2]!.status).toBe('Inactive');
  });

  it('skips header and separator rows', () => {
    const agents = parseTeamManifest(standardTable);
    // Should not contain "Name" or "---" entries
    for (const a of agents) {
      expect(a.name).not.toBe('Name');
      expect(a.name).not.toContain('---');
    }
  });

  it('returns empty array for no Members section', () => {
    const noMembers = `# Squad Team — Test\n\n## Decisions\n\nSome text.`;
    expect(parseTeamManifest(noMembers)).toEqual([]);
  });

  it('stops at next section header', () => {
    const agents = parseTeamManifest(standardTable);
    // "Decisions" section should not leak into members
    expect(agents).toHaveLength(3);
  });

  it('handles rows with fewer than 4 columns gracefully', () => {
    const badTable = `
## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Valid | Lead | \`.squad/agents/valid/charter.md\` | ✅ Active |
| Short | Dev |
| Also | Good | \`.squad/agents/also/charter.md\` | ✅ Active |
`;
    const agents = parseTeamManifest(badTable);
    expect(agents).toHaveLength(2);
    expect(agents[0]!.name).toBe('Valid');
    expect(agents[1]!.name).toBe('Also');
  });

  it('sets charter to undefined when not backtick-wrapped', () => {
    const table = `
## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Agent | Dev | none | ✅ Active |
`;
    const agents = parseTeamManifest(table);
    expect(agents[0]!.charter).toBeUndefined();
  });
});

// ─── getRoleEmoji ───────────────────────────────────────────────────

describe('getRoleEmoji', () => {
  it('returns correct emoji for known roles', () => {
    expect(getRoleEmoji('Lead')).toBe('🏗️');
    expect(getRoleEmoji('Core Dev')).toBe('🔧');
    expect(getRoleEmoji('Tester')).toBe('🧪');
    expect(getRoleEmoji('DevRel')).toBe('📢');
    expect(getRoleEmoji('Coordinator')).toBe('🎯');
    expect(getRoleEmoji('Coding Agent')).toBe('🤖');
  });

  it('falls back to keyword matching for custom roles', () => {
    expect(getRoleEmoji('Frontend Engineer')).toBe('⚛️');
    expect(getRoleEmoji('Backend API Dev')).toBe('🔧');
    expect(getRoleEmoji('QA Lead')).toBe('🏗️'); // 'lead' keyword matches first
    expect(getRoleEmoji('Game Logic')).toBe('🎮');
    expect(getRoleEmoji('DevOps Engineer')).toBe('⚙️');
    expect(getRoleEmoji('Security Auditor')).toBe('🔒');
    expect(getRoleEmoji('Technical Writer')).toBe('📝');
    expect(getRoleEmoji('Data Analyst')).toBe('📊');
    expect(getRoleEmoji('Visual Designer')).toBe('🎨');
  });

  it('returns 🔹 for unknown roles', () => {
    expect(getRoleEmoji('Mystical Oracle')).toBe('🔹');
    expect(getRoleEmoji('')).toBe('🔹');
  });
});

// ─── loadWelcomeData ────────────────────────────────────────────────

describe('loadWelcomeData', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-team-manifest-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when team.md does not exist', () => {
    const result = loadWelcomeData(tempDir);
    expect(result).toBeNull();
  });

  it('extracts project name, description, agents, and focus', () => {
    const squadDir = path.join(tempDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });

    const teamMd = `# Squad Team — My Project

> A cool description

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Alpha | Lead | \`.squad/agents/alpha/charter.md\` | ✅ Active |
| Beta | Tester | \`.squad/agents/beta/charter.md\` | ✅ Active |
| Gamma | Dev | \`.squad/agents/gamma/charter.md\` | 🚫 Inactive |
`;
    fs.writeFileSync(path.join(squadDir, 'team.md'), teamMd);

    const identityDir = path.join(squadDir, 'identity');
    fs.mkdirSync(identityDir, { recursive: true });
    fs.writeFileSync(
      path.join(identityDir, 'now.md'),
      'focus_area: shipping v2\n'
    );

    const result = loadWelcomeData(tempDir);
    expect(result).not.toBeNull();
    expect(result!.projectName).toBe('My Project');
    expect(result!.description).toBe('A cool description');
    expect(result!.agents).toHaveLength(2); // only Active
    expect(result!.agents[0]!.name).toBe('Alpha');
    expect(result!.agents[0]!.emoji).toBe('🏗️');
    expect(result!.agents[1]!.name).toBe('Beta');
    expect(result!.focus).toBe('shipping v2');
  });

  it('detects and consumes first-run marker', () => {
    const squadDir = path.join(tempDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'team.md'), '# Squad Team — Test\n\n## Members\n\n| Name | Role | Charter | Status |\n|---|---|---|---|\n');
    fs.writeFileSync(path.join(squadDir, '.first-run'), '');

    const result = loadWelcomeData(tempDir);
    expect(result).not.toBeNull();
    expect(result!.isFirstRun).toBe(true);

    // Marker should be consumed (deleted)
    expect(fs.existsSync(path.join(squadDir, '.first-run'))).toBe(false);

    // Second call should not be first-run
    const result2 = loadWelcomeData(tempDir);
    expect(result2!.isFirstRun).toBe(false);
  });
});
