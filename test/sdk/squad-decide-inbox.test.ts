/**
 * `squad_decide` inbox routing and filename hygiene (#2299).
 *
 * Decisions land in the active workstream inbox
 * (`.squad/workstreams/active/<slug>/decisions/inbox/`) when one is resolvable —
 * `SQUAD_WORKSTREAM`, the `.squad-workstream` activation file, or a single active
 * workstream — and in the root `decisions/inbox/` otherwise. Filenames use a lowercase
 * agent slug and a summary slug that is not truncated below 60 characters.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolRegistry, resolveDecisionInboxDir, isMutableStateKey, type DecisionRecord } from '@bradygaster/squad-sdk/tools';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const ctx = { sessionId: 's', toolCallId: 'c', toolName: 'squad_decide', arguments: {} };

describe('squad_decide inbox resolution (#2299)', () => {
  let projectRoot: string;
  let squadRoot: string;
  const savedEnv = process.env['SQUAD_WORKSTREAM'];

  beforeEach(() => {
    projectRoot = path.resolve('.test-decide-inbox-' + randomUUID());
    squadRoot = path.join(projectRoot, '.squad');
    fs.mkdirSync(squadRoot, { recursive: true });
    delete process.env['SQUAD_WORKSTREAM'];
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env['SQUAD_WORKSTREAM']; else process.env['SQUAD_WORKSTREAM'] = savedEnv;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  const storage = new FSStorageProvider();
  const active = (slug: string) => fs.mkdirSync(path.join(squadRoot, 'workstreams', 'active', slug), { recursive: true });

  it('falls back to the root inbox when there are no workstreams', () => {
    expect(resolveDecisionInboxDir(squadRoot, storage, {})).toBe(path.join(squadRoot, 'decisions', 'inbox'));
  });

  it('uses the single active workstream', () => {
    active('squad-2.0');
    expect(resolveDecisionInboxDir(squadRoot, storage, {})).toBe(path.join(squadRoot, 'workstreams', 'active', 'squad-2.0', 'decisions', 'inbox'));
  });

  it('with several active workstreams, SQUAD_WORKSTREAM or .squad-workstream picks one; otherwise root', () => {
    active('alpha');
    active('beta');
    expect(resolveDecisionInboxDir(squadRoot, storage, {})).toBe(path.join(squadRoot, 'decisions', 'inbox'));
    expect(resolveDecisionInboxDir(squadRoot, storage, { SQUAD_WORKSTREAM: 'beta' })).toBe(path.join(squadRoot, 'workstreams', 'active', 'beta', 'decisions', 'inbox'));
    // An env slug that is not an active workstream is ignored (no path traversal, no guessing).
    expect(resolveDecisionInboxDir(squadRoot, storage, { SQUAD_WORKSTREAM: '../escape' })).toBe(path.join(squadRoot, 'decisions', 'inbox'));
    fs.writeFileSync(path.join(projectRoot, '.squad-workstream'), 'alpha\n');
    expect(resolveDecisionInboxDir(squadRoot, storage, {})).toBe(path.join(squadRoot, 'workstreams', 'active', 'alpha', 'decisions', 'inbox'));
    // Env wins over the activation file.
    expect(resolveDecisionInboxDir(squadRoot, storage, { SQUAD_WORKSTREAM: 'beta' })).toContain(path.join('active', 'beta'));
  });

  it('the handler writes into the workstream inbox with a lowercase author and an untruncated slug', async () => {
    active('squad-2.0');
    const registry = new ToolRegistry(squadRoot);
    const tool = registry.getTool('squad_decide')!;
    const summary = 'Squad 2.0.0-preview.1 self-check runtime inbox write verification for the bridge handshake';
    const result = await tool.handler({ author: 'Scribe', summary, body: 'why' } as DecisionRecord, ctx);
    expect(result.resultType).toBe('success');
    const inbox = path.join(squadRoot, 'workstreams', 'active', 'squad-2.0', 'decisions', 'inbox');
    const files = fs.readdirSync(inbox);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^scribe-squad-2-0-0-preview-1-self-check-runtime-inbox-write-verification-for-the/);
    expect(files[0]!.length).toBeGreaterThan('scribe-'.length + 60);
    expect(files[0]).not.toMatch(/-\.md$/);
    expect(result.textResultForLlm).toContain('workstreams/active/squad-2.0/decisions/inbox/scribe-');
    expect(fs.existsSync(path.join(squadRoot, 'decisions', 'inbox'))).toBe(false);
  });

  it('state tools may write/delete workstream inbox files but nothing else under workstreams/', () => {
    expect(isMutableStateKey('workstreams/active/squad-2.0/decisions/inbox/scribe-note.md')).toBe(true);
    expect(isMutableStateKey('workstreams/active/squad-2.0/now.md')).toBe(false);
    expect(isMutableStateKey('workstreams/active/../../team.md')).toBe(false);
  });
});
