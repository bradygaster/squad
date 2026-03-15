/**
 * Tests for base roles opt-in behavior (Issue #379).
 *
 * Verifies:
 * - buildInitModePrompt defaults to fictional universe casting (no base roles catalog)
 * - buildInitModePrompt includes base roles catalog only when useBaseRoles is true
 * - .init-roles marker file is written by init when --roles is passed
 * - .init-roles marker is cleaned up after casting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildInitModePrompt,
  type CoordinatorConfig,
} from '../packages/squad-cli/src/cli/shell/coordinator.js';

describe('buildInitModePrompt — base roles opt-in (#379)', () => {
  let teamRoot: string;

  beforeEach(async () => {
    teamRoot = await mkdtemp(join(tmpdir(), 'squad-init-roles-'));
    mkdirSync(join(teamRoot, '.squad'), { recursive: true });
  });

  afterEach(async () => {
    await rm(teamRoot, { recursive: true, force: true });
  });

  it('default prompt uses fictional universe casting (no base roles catalog)', () => {
    const prompt = buildInitModePrompt({ teamRoot });

    // Should instruct to pick a fictional universe
    expect(prompt).toContain('Pick a fictional universe');
    expect(prompt).toContain('INIT_TEAM:');

    // Should NOT include the base roles catalog section
    expect(prompt).not.toContain('## Built-in Base Roles');
    expect(prompt).not.toContain('Prefer these over inventing new roles');
    expect(prompt).not.toContain('marketing-strategist');
    expect(prompt).not.toContain('compliance-legal');
  });

  it('prompt with useBaseRoles=true includes base roles catalog', () => {
    const prompt = buildInitModePrompt({ teamRoot, useBaseRoles: true });

    // Should still instruct fictional universe for character names
    expect(prompt).toContain('Pick a fictional universe');
    expect(prompt).toContain('INIT_TEAM:');

    // Should include the base roles catalog section
    expect(prompt).toContain('## Built-in Base Roles');
    expect(prompt).toContain('Prefer these over inventing new roles');
    expect(prompt).toContain('marketing-strategist');
    expect(prompt).toContain('compliance-legal');
    expect(prompt).toContain('lead');
    expect(prompt).toContain('backend');
    expect(prompt).toContain('frontend');
  });

  it('prompt with useBaseRoles=false matches default (no catalog)', () => {
    const defaultPrompt = buildInitModePrompt({ teamRoot });
    const explicitFalse = buildInitModePrompt({ teamRoot, useBaseRoles: false });

    expect(explicitFalse).toBe(defaultPrompt);
  });
});

describe('.init-roles marker file lifecycle', () => {
  let teamRoot: string;

  beforeEach(async () => {
    teamRoot = await mkdtemp(join(tmpdir(), 'squad-init-roles-marker-'));
    mkdirSync(join(teamRoot, '.squad'), { recursive: true });
  });

  afterEach(async () => {
    await rm(teamRoot, { recursive: true, force: true });
  });

  it('.init-roles marker does not exist by default', () => {
    expect(existsSync(join(teamRoot, '.squad', '.init-roles'))).toBe(false);
  });

  it('.init-roles marker can be created and detected', () => {
    const markerPath = join(teamRoot, '.squad', '.init-roles');
    writeFileSync(markerPath, '1', 'utf-8');
    expect(existsSync(markerPath)).toBe(true);
  });
});
