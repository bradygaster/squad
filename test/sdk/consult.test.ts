/**
 * Tests for consult mode SDK functions.
 *
 * @module test/sdk/consult
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import {
  detectLicense,
  loadStagedLearnings,
  logConsultation,
  mergeToPersonalSquad,
  type LicenseInfo,
  type ExtractionResult,
  type StagedLearning,
} from '@bradygaster/squad-sdk';

const TEST_ROOT = join(
  process.cwd(),
  `.test-consult-${randomBytes(4).toString('hex')}`,
);

describe('detectLicense', () => {
  describe('SPDX identifier detection', () => {
    it('detects MIT via SPDX identifier', () => {
      const content = `
// SPDX-License-Identifier: MIT
// Copyright 2024 Example Corp
`;
      const result = detectLicense(content);
      expect(result.type).toBe('permissive');
      expect(result.spdxId).toBe('MIT');
    });

    it('detects GPL via SPDX identifier', () => {
      const content = `
/* SPDX-License-Identifier: GPL-3.0-only */
`;
      const result = detectLicense(content);
      expect(result.type).toBe('copyleft');
      expect(result.spdxId).toBe('GPL-3.0-only');
    });

    it('detects Apache-2.0 via SPDX identifier', () => {
      const content = `SPDX-License-Identifier: Apache-2.0`;
      const result = detectLicense(content);
      expect(result.type).toBe('permissive');
      expect(result.spdxId).toBe('Apache-2.0');
    });

    it('detects LGPL correctly (not misclassified as GPL)', () => {
      const content = `SPDX-License-Identifier: LGPL-2.1`;
      const result = detectLicense(content);
      expect(result.type).toBe('copyleft');
      expect(result.spdxId).toBe('LGPL-2.1');
    });
  });

  describe('fallback word-boundary detection', () => {
    it('detects MIT License from standard LICENSE file', () => {
      const content = `
MIT License

Copyright (c) 2024 Example

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software...
`;
      const result = detectLicense(content);
      expect(result.type).toBe('permissive');
      expect(result.spdxId).toBe('MIT');
    });

    it('detects GNU GPL from standard LICENSE file', () => {
      const content = `
GNU GPL License
Version 3, 29 June 2007

Copyright (C) 2007 Free Software Foundation, Inc.
`;
      const result = detectLicense(content);
      expect(result.type).toBe('copyleft');
      expect(result.spdxId).toBe('GPL');
    });

    it('detects Apache License', () => {
      const content = `
                                 Apache License
                           Version 2.0, January 2004
`;
      const result = detectLicense(content);
      expect(result.type).toBe('permissive');
      expect(result.spdxId).toBe('Apache');
    });

    it('detects BSD License', () => {
      const content = `BSD 3-Clause License`;
      const result = detectLicense(content);
      expect(result.type).toBe('permissive');
      expect(result.spdxId).toBe('BSD');
    });

    it('detects MPL as copyleft', () => {
      const content = `MPL-2.0 (Mozilla Public License)`;
      const result = detectLicense(content);
      expect(result.type).toBe('copyleft');
      expect(result.spdxId).toBe('MPL');
    });

    it('returns unknown for unrecognized license', () => {
      const content = `
This software is proprietary.
All rights reserved.
`;
      const result = detectLicense(content);
      expect(result.type).toBe('unknown');
    });

    it('returns unknown for empty content', () => {
      const result = detectLicense('');
      expect(result.type).toBe('unknown');
    });
  });

  describe('edge cases', () => {
    it('handles case-insensitive matching', () => {
      const content = `mit license`;
      const result = detectLicense(content);
      expect(result.type).toBe('permissive');
    });

    it('prefers SPDX over body text', () => {
      // License body says MIT but SPDX says GPL — SPDX wins
      const content = `
SPDX-License-Identifier: GPL-3.0
MIT License
`;
      const result = detectLicense(content);
      expect(result.type).toBe('copyleft');
      expect(result.spdxId).toBe('GPL-3.0');
    });
  });
});

describe('loadStagedLearnings', () => {
  const STAGED_ROOT = join(
    process.cwd(),
    `.test-staged-${randomBytes(4).toString('hex')}`,
  );
  const EXTRACT_DIR = join(STAGED_ROOT, '.squad', 'extract');

  beforeEach(() => {
    mkdirSync(EXTRACT_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(STAGED_ROOT, { recursive: true, force: true });
  });

  it('loads markdown files from extract folder', () => {
    writeFileSync(join(EXTRACT_DIR, 'async-await.md'), '### Always use async/await');
    writeFileSync(join(EXTRACT_DIR, 'error-handling.md'), '### Handle errors explicitly');

    const result = loadStagedLearnings(join(STAGED_ROOT, '.squad'));

    expect(result).toHaveLength(2);
    expect(result.map((l) => l.filename).sort()).toEqual(['async-await.md', 'error-handling.md']);
  });

  it('returns empty array if extract folder is empty', () => {
    const result = loadStagedLearnings(join(STAGED_ROOT, '.squad'));
    expect(result).toHaveLength(0);
  });

  it('returns empty array if extract folder does not exist', () => {
    rmSync(EXTRACT_DIR, { recursive: true, force: true });
    const result = loadStagedLearnings(join(STAGED_ROOT, '.squad'));
    expect(result).toHaveLength(0);
  });

  it('includes file content in learning', () => {
    const content = '### Test Pattern\n\nUse this pattern for testing.';
    writeFileSync(join(EXTRACT_DIR, 'test-pattern.md'), content);

    const result = loadStagedLearnings(join(STAGED_ROOT, '.squad'));

    expect(result[0].content).toBe(content);
    expect(result[0].filename).toBe('test-pattern.md');
    expect(result[0].filepath).toBe(join(EXTRACT_DIR, 'test-pattern.md'));
  });

  it('only loads .md files', () => {
    writeFileSync(join(EXTRACT_DIR, 'valid.md'), '### Valid');
    writeFileSync(join(EXTRACT_DIR, 'invalid.txt'), 'Invalid');
    writeFileSync(join(EXTRACT_DIR, 'invalid.json'), '{}');

    const result = loadStagedLearnings(join(STAGED_ROOT, '.squad'));

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('valid.md');
  });
});

describe('logConsultation', () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  const makeLearning = (
    filename: string,
    content: string,
  ): StagedLearning => ({
    filename,
    filepath: join(TEST_ROOT, 'extract', filename),
    content,
  });

  const makeResult = (
    extracted: StagedLearning[] = [],
    projectName = 'test-project',
  ): ExtractionResult => ({
    extracted,
    license: { type: 'permissive', spdxId: 'MIT' },
    projectName,
    timestamp: '2024-02-28T12:00:00.000Z',
    acceptedRisks: false,
  });

  it('creates consultations directory if it does not exist', async () => {
    const result = makeResult();
    await logConsultation(TEST_ROOT, result);

    expect(existsSync(join(TEST_ROOT, 'consultations'))).toBe(true);
  });

  it('creates a new consultation log file', async () => {
    const result = makeResult();
    const logPath = await logConsultation(TEST_ROOT, result);

    expect(logPath).toBe(join(TEST_ROOT, 'consultations', 'test-project.md'));
    expect(existsSync(logPath)).toBe(true);
  });

  it('writes header with project name, date, and license', async () => {
    const result = makeResult();
    await logConsultation(TEST_ROOT, result);

    const content = readFileSync(
      join(TEST_ROOT, 'consultations', 'test-project.md'),
      'utf-8',
    );
    expect(content).toContain('# test-project');
    expect(content).toContain('**First consulted:** 2024-02-28');
    expect(content).toContain('**License:** MIT');
  });

  it('writes session entry with extracted learnings', async () => {
    const result = makeResult([
      makeLearning('async-await.md', '### Use async/await everywhere'),
    ]);
    await logConsultation(TEST_ROOT, result);

    const content = readFileSync(
      join(TEST_ROOT, 'consultations', 'test-project.md'),
      'utf-8',
    );
    expect(content).toContain('### 2024-02-28');
    expect(content).toContain('async-await.md');
  });

  it('appends to existing consultation log', async () => {
    // First consultation
    const result1 = makeResult([], 'test-project');
    result1.timestamp = '2024-02-27T12:00:00.000Z';
    await logConsultation(TEST_ROOT, result1);

    // Second consultation
    const result2 = makeResult([
      makeLearning('factory-pattern.md', '### Factory Pattern'),
    ]);
    result2.timestamp = '2024-02-28T12:00:00.000Z';
    await logConsultation(TEST_ROOT, result2);

    const content = readFileSync(
      join(TEST_ROOT, 'consultations', 'test-project.md'),
      'utf-8',
    );

    // Check both sessions are present
    expect(content).toContain('### 2024-02-27');
    expect(content).toContain('### 2024-02-28');
    // Check "Last session" was updated
    expect(content).toContain('**Last session:** 2024-02-28');
  });

  it('handles no learnings extracted', async () => {
    const result = makeResult([]);
    await logConsultation(TEST_ROOT, result);

    const content = readFileSync(
      join(TEST_ROOT, 'consultations', 'test-project.md'),
      'utf-8',
    );
    expect(content).toContain('No learnings extracted');
  });
});

describe('mergeToPersonalSquad', () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  const makeLearning = (
    filename: string,
    content: string,
  ): StagedLearning => ({
    filename,
    filepath: join(TEST_ROOT, 'extract', filename),
    content,
  });

  it('creates decisions.md if it does not exist', async () => {
    const learnings = [
      makeLearning('validate-inputs.md', '### Always validate inputs'),
    ];
    await mergeToPersonalSquad(learnings, TEST_ROOT);

    expect(existsSync(join(TEST_ROOT, 'decisions.md'))).toBe(true);
  });

  it('writes learnings to decisions.md', async () => {
    const learnings = [
      makeLearning('validate-inputs.md', '### Always validate inputs'),
      makeLearning('user-input.md', '### Never trust user input'),
    ];
    const result = await mergeToPersonalSquad(learnings, TEST_ROOT);

    expect(result.decisions).toBe(2);
    const content = readFileSync(join(TEST_ROOT, 'decisions.md'), 'utf-8');
    expect(content).toContain('Always validate inputs');
    expect(content).toContain('Never trust user input');
  });

  it('appends to existing decisions.md', async () => {
    // Pre-existing decisions file
    writeFileSync(
      join(TEST_ROOT, 'decisions.md'),
      '# Squad Decisions\n\n- Existing decision\n',
    );

    const learnings = [
      makeLearning('new-decision.md', '### New decision from consultation'),
    ];
    await mergeToPersonalSquad(learnings, TEST_ROOT);

    const content = readFileSync(join(TEST_ROOT, 'decisions.md'), 'utf-8');
    expect(content).toContain('Existing decision');
    expect(content).toContain('New decision from consultation');
    expect(content).toContain('## Extracted from Consultations');
  });

  it('returns zero skills added (not implemented yet)', async () => {
    const learnings = [
      makeLearning('factory-pattern.md', '### Pattern: Use factories'),
    ];
    const result = await mergeToPersonalSquad(learnings, TEST_ROOT);

    // Patterns are logged but not merged to skills yet
    expect(result.skills).toBe(0);
  });
});

// ============================================================================
// setupConsultMode tests
// ============================================================================

import {
  setupConsultMode,
  extractLearnings,
  loadSessionHistory,
  getPersonalSquadRoot,
  resolveGlobalSquadPath,
} from '@bradygaster/squad-sdk';

// ============================================================================
// getPersonalSquadRoot tests (#590)
// ============================================================================

describe('getPersonalSquadRoot', () => {
  it('resolves to personal-squad subdirectory, not .squad', () => {
    const root = getPersonalSquadRoot();
    const globalDir = resolveGlobalSquadPath();
    expect(root).toBe(join(globalDir, 'personal-squad'));
  });

  it('does not resolve to .squad subdirectory', () => {
    const root = getPersonalSquadRoot();
    expect(root).not.toMatch(/[/\\]\.squad$/);
  });
});

describe('setupConsultMode', () => {
  const SETUP_ROOT = join(
    process.cwd(),
    `.test-setup-${randomBytes(4).toString('hex')}`,
  );
  const PROJECT_ROOT = join(SETUP_ROOT, 'my-project');
  const PERSONAL_SQUAD = join(SETUP_ROOT, 'personal-squad');

  beforeEach(() => {
    // Create fake project with git
    mkdirSync(join(PROJECT_ROOT, '.git', 'info'), { recursive: true });
    // Create fake personal squad
    mkdirSync(PERSONAL_SQUAD, { recursive: true });
  });

  afterEach(() => {
    rmSync(SETUP_ROOT, { recursive: true, force: true });
  });

  it('creates .squad/ directory with config.json', async () => {
    const result = await setupConsultMode({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    expect(result.squadDir).toBe(join(PROJECT_ROOT, '.squad'));
    expect(result.projectName).toBe('my-project');
    expect(existsSync(join(PROJECT_ROOT, '.squad'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.squad', 'config.json'))).toBe(true);

    const config = JSON.parse(
      readFileSync(join(PROJECT_ROOT, '.squad', 'config.json'), 'utf-8'),
    );
    expect(config.consult).toBe(true);
    expect(config.sourceSquad).toBe(PERSONAL_SQUAD);
  });

  it('copies personal squad contents into project .squad/', async () => {
    // Create some content in personal squad
    writeFileSync(join(PERSONAL_SQUAD, 'decisions.md'), '# Decisions\n- Use TypeScript');
    mkdirSync(join(PERSONAL_SQUAD, 'agents'), { recursive: true });
    writeFileSync(join(PERSONAL_SQUAD, 'agents', 'test-agent.md'), '# Test Agent');

    const result = await setupConsultMode({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    // Verify content was copied
    expect(existsSync(join(PROJECT_ROOT, '.squad', 'decisions.md'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.squad', 'agents', 'test-agent.md'))).toBe(true);
    
    const copiedDecisions = readFileSync(join(PROJECT_ROOT, '.squad', 'decisions.md'), 'utf-8');
    expect(copiedDecisions).toContain('Use TypeScript');

    // Verify createdFiles list includes the copied files
    expect(result.createdFiles).toContain('decisions.md');
    expect(result.createdFiles).toContain(join('agents', 'test-agent.md'));
  });

  it('creates sessions directory', async () => {
    await setupConsultMode({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    expect(existsSync(join(PROJECT_ROOT, '.squad', 'sessions'))).toBe(true);
  });

  it('adds .squad/ to git exclude', async () => {
    const result = await setupConsultMode({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    const excludeContent = readFileSync(result.gitExclude, 'utf-8');
    expect(excludeContent).toContain('.squad/');
  });

  it('creates .github/agents/squad.agent.md', async () => {
    const result = await setupConsultMode({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    expect(result.agentFile).toBe(join(PROJECT_ROOT, '.github', 'agents', 'squad.agent.md'));
    expect(existsSync(result.agentFile)).toBe(true);

    const content = readFileSync(result.agentFile, 'utf-8');
    expect(content).toContain('name: Squad');
    expect(content).toContain('consult-mode: true');
    // Agent file should reference local .squad/ (the copy), not absolute paths
    expect(content).toContain('.squad/decisions.md');
    expect(content).toContain('.squad/agents/');
  });

  it('uses full squad.agent.md template with consult mode preamble', async () => {
    const result = await setupConsultMode({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    const content = readFileSync(result.agentFile, 'utf-8');
    // Should have consult mode preamble
    expect(content).toContain('Consult Mode Active');
    expect(content).toContain('Skip Init Mode');
    // Should have full template content (Coordinator Identity section)
    expect(content).toContain('Coordinator Identity');
    expect(content).toContain('Team Mode');
  });

  it('adds .github/agents/squad.agent.md to git exclude', async () => {
    const result = await setupConsultMode({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    const excludeContent = readFileSync(result.gitExclude, 'utf-8');
    expect(excludeContent).toContain('.github/agents/squad.agent.md');
  });

  it('throws if not a git repository', async () => {
    const nonGitDir = join(SETUP_ROOT, 'no-git');
    mkdirSync(nonGitDir, { recursive: true });

    await expect(
      setupConsultMode({
        projectRoot: nonGitDir,
        personalSquadRoot: PERSONAL_SQUAD,
      }),
    ).rejects.toThrow('Not a git repository');
  });

  it('throws if personal squad missing', async () => {
    const missingSquad = join(SETUP_ROOT, 'nonexistent');

    await expect(
      setupConsultMode({
        projectRoot: PROJECT_ROOT,
        personalSquadRoot: missingSquad,
      }),
    ).rejects.toThrow('No personal squad found');
  });

  it('throws if project already has .squad/', async () => {
    mkdirSync(join(PROJECT_ROOT, '.squad'), { recursive: true });

    await expect(
      setupConsultMode({
        projectRoot: PROJECT_ROOT,
        personalSquadRoot: PERSONAL_SQUAD,
      }),
    ).rejects.toThrow('already has a .squad/ directory');
  });

  it('dry run does not create files', async () => {
    const result = await setupConsultMode({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.squad'))).toBe(false);
  });
});

// ============================================================================
// extractLearnings tests
// ============================================================================

describe('extractLearnings', () => {
  const EXTRACT_ROOT = join(
    process.cwd(),
    `.test-extract-${randomBytes(4).toString('hex')}`,
  );
  const PROJECT_ROOT = join(EXTRACT_ROOT, 'my-project');
  const PERSONAL_SQUAD = join(EXTRACT_ROOT, 'personal-squad');

  beforeEach(() => {
    // Create project with consult mode set up
    mkdirSync(join(PROJECT_ROOT, '.git', 'info'), { recursive: true });
    mkdirSync(join(PROJECT_ROOT, '.squad', 'extract'), { recursive: true });
    writeFileSync(
      join(PROJECT_ROOT, '.squad', 'config.json'),
      JSON.stringify({ consult: true, sourceSquad: PERSONAL_SQUAD }),
    );
    // Create personal squad
    mkdirSync(PERSONAL_SQUAD, { recursive: true });
  });

  afterEach(() => {
    rmSync(EXTRACT_ROOT, { recursive: true, force: true });
  });

  it('extracts staged learnings from extract folder', async () => {
    // Add a staged learning
    writeFileSync(
      join(PROJECT_ROOT, '.squad', 'extract', 'use-async-await.md'),
      '### Always use async/await\n\nThis is a best practice.',
    );

    const result = await extractLearnings({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    expect(result.blocked).toBe(false);
    expect(result.extracted.length).toBe(1);
    expect(result.extracted[0].filename).toBe('use-async-await.md');
  });

  it('blocks extraction from copyleft-licensed projects', async () => {
    // Add GPL license with SPDX identifier
    writeFileSync(join(PROJECT_ROOT, 'LICENSE'), 'SPDX-License-Identifier: GPL-3.0');

    const result = await extractLearnings({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    expect(result.blocked).toBe(true);
    expect(result.extracted).toHaveLength(0);
    expect(result.license.type).toBe('copyleft');
  });

  it('allows copyleft extraction with acceptRisks', async () => {
    writeFileSync(join(PROJECT_ROOT, 'LICENSE'), 'SPDX-License-Identifier: GPL-3.0');
    writeFileSync(
      join(PROJECT_ROOT, '.squad', 'extract', 'factories.md'),
      '### Use factories\n\nFactory pattern is cleaner.',
    );

    const result = await extractLearnings({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
      acceptRisks: true,
    });

    expect(result.blocked).toBe(false);
    expect(result.acceptedRisks).toBe(true);
    expect(result.extracted.length).toBe(1);
  });

  it('cleans up project .squad/ when clean=true', async () => {
    writeFileSync(join(PROJECT_ROOT, 'LICENSE'), 'MIT License');

    const result = await extractLearnings({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
      clean: true,
    });

    expect(result.cleaned).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.squad'))).toBe(false);
  });

  it('throws if not in consult mode', async () => {
    rmSync(join(PROJECT_ROOT, '.squad'), { recursive: true, force: true });

    await expect(
      extractLearnings({
        projectRoot: PROJECT_ROOT,
        personalSquadRoot: PERSONAL_SQUAD,
      }),
    ).rejects.toThrow('Not in consult mode');
  });

  it('logs consultation to personal squad', async () => {
    writeFileSync(join(PROJECT_ROOT, 'LICENSE'), 'MIT License');
    writeFileSync(
      join(PROJECT_ROOT, '.squad', 'extract', 'test-learning.md'),
      '### Test learning\n\nSome content.',
    );

    const result = await extractLearnings({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    expect(result.consultationLogPath).toBeDefined();
    expect(existsSync(result.consultationLogPath!)).toBe(true);
  });

  it('removes extracted files from extract folder', async () => {
    writeFileSync(join(PROJECT_ROOT, 'LICENSE'), 'MIT License');
    const extractPath = join(PROJECT_ROOT, '.squad', 'extract', 'to-extract.md');
    writeFileSync(extractPath, '### Learning\n\nContent.');

    await extractLearnings({
      projectRoot: PROJECT_ROOT,
      personalSquadRoot: PERSONAL_SQUAD,
    });

    expect(existsSync(extractPath)).toBe(false);
  });
});

// ============================================================================
// loadSessionHistory tests
// ============================================================================

describe('loadSessionHistory', () => {
  const HISTORY_ROOT = join(
    process.cwd(),
    `.test-history-${randomBytes(4).toString('hex')}`,
  );
  const SQUAD_DIR = join(HISTORY_ROOT, '.squad');

  beforeEach(() => {
    mkdirSync(join(SQUAD_DIR, 'sessions'), { recursive: true });
  });

  afterEach(() => {
    rmSync(HISTORY_ROOT, { recursive: true, force: true });
  });

  it('returns empty entries if no sessions', () => {
    const history = loadSessionHistory(SQUAD_DIR);
    expect(history.entries).toHaveLength(0);
  });

  it('loads learnings from session files', () => {
    const session = {
      timestamp: '2024-01-15T10:00:00Z',
      learnings: [
        { type: 'pattern', content: 'Use dependency injection' },
        { type: 'decision', content: 'Always use TypeScript' },
      ],
    };
    writeFileSync(
      join(SQUAD_DIR, 'sessions', 'session1.json'),
      JSON.stringify(session),
    );

    const history = loadSessionHistory(SQUAD_DIR);
    expect(history.entries).toHaveLength(2);
    expect(history.entries[0].content).toBe('Use dependency injection');
    expect(history.entries[1].content).toBe('Always use TypeScript');
  });

  it('loads decisions from session files', () => {
    const session = {
      decisions: [
        { type: 'decision', content: 'Use PostgreSQL' },
      ],
    };
    writeFileSync(
      join(SQUAD_DIR, 'sessions', 'session1.json'),
      JSON.stringify(session),
    );

    const history = loadSessionHistory(SQUAD_DIR);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].type).toBe('decision');
  });

  it('skips malformed session files', () => {
    writeFileSync(
      join(SQUAD_DIR, 'sessions', 'bad.json'),
      'not valid json',
    );
    writeFileSync(
      join(SQUAD_DIR, 'sessions', 'good.json'),
      JSON.stringify({ learnings: [{ content: 'Valid' }] }),
    );

    const history = loadSessionHistory(SQUAD_DIR);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].content).toBe('Valid');
  });
});
