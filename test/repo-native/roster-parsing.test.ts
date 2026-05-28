/**
 * Tests for roster parsing bug fix — v008.
 * Ensures category headers and placeholder rows are filtered out.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExportContext } from '../../packages/squad-sdk/src/repo-native/load-export-context.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function setupSquadDir(teamMdContent: string): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-test-'));
  const squadDir = path.join(tmp, '.squad');
  fs.mkdirSync(squadDir, { recursive: true });
  fs.writeFileSync(path.join(squadDir, 'team.md'), teamMdContent);
  return tmp;
}

describe('roster parsing', () => {
  it('filters category header rows', async () => {
    const teamMd = `# My Squad

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| **Backend** | — | — | — |
| Alice | Backend Engineer | .squad/agents/alice/charter.md | active |
| Bob | API Developer | .squad/agents/bob/charter.md | active |
`;
    const root = setupSquadDir(teamMd);
    const ctx = await loadExportContext(root, path.join(root, '.squad'), {
      outputPath: '.github/agents/squad.md',
      generatedAt: new Date().toISOString(),
      skillMode: 'none',
    });

    assert.equal(ctx.team.members.length, 2);
    assert.equal(ctx.team.members[0]!.displayName, 'Alice');
    assert.equal(ctx.team.members[1]!.displayName, 'Bob');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('filters rows with dash-only roles', async () => {
    const teamMd = `# Squad

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Charlie | Lead | .squad/agents/charlie/charter.md | active |
| --- | --- | --- | --- |
| Dana | Designer | .squad/agents/dana/charter.md | active |
`;
    const root = setupSquadDir(teamMd);
    const ctx = await loadExportContext(root, path.join(root, '.squad'), {
      outputPath: '.github/agents/squad.md',
      generatedAt: new Date().toISOString(),
      skillMode: 'none',
    });

    assert.equal(ctx.team.members.length, 2);
    assert.equal(ctx.team.members[0]!.displayName, 'Charlie');
    assert.equal(ctx.team.members[1]!.displayName, 'Dana');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps valid members with real names and roles', async () => {
    const teamMd = `# Squad

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Eve | Security Specialist | .squad/agents/eve/charter.md | active |
| Frank | DevOps Lead | .squad/agents/frank/charter.md | active |
`;
    const root = setupSquadDir(teamMd);
    const ctx = await loadExportContext(root, path.join(root, '.squad'), {
      outputPath: '.github/agents/squad.md',
      generatedAt: new Date().toISOString(),
      skillMode: 'none',
    });

    assert.equal(ctx.team.members.length, 2);
    assert.equal(ctx.team.members[0]!.slug, 'eve');
    assert.equal(ctx.team.members[1]!.slug, 'frank');

    fs.rmSync(root, { recursive: true, force: true });
  });
});
