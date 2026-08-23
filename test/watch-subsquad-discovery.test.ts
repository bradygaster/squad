import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEAM_ROOT = path.join(os.tmpdir(), `squad-subsquad-team-${Date.now()}`);
const EXTERNAL_ROOT = path.join(os.tmpdir(), `squad-subsquad-external-${Date.now()}`);

import { discoverSubSquads } from '../packages/squad-cli/src/cli/commands/watch/index.js';

function writeSquad(root: string, relativePath: string, content: string = ''): void {
  const full = path.join(root, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  mkdirSync(TEAM_ROOT, { recursive: true });
  mkdirSync(EXTERNAL_ROOT, { recursive: true });
});

afterEach(() => {
  rmSync(TEAM_ROOT, { recursive: true, force: true });
  rmSync(EXTERNAL_ROOT, { recursive: true, force: true });
});

describe('discoverSubSquads', () => {
  it('finds subsquads with a team.md under {stateRoot}/subsquads/', () => {
    writeSquad(TEAM_ROOT, '.squad/subsquads/frontend/team.md', '# Frontend Team\n');
    writeSquad(TEAM_ROOT, '.squad/subsquads/backend/team.md', '# Backend Team\n');

    const squads = discoverSubSquads(path.join(TEAM_ROOT, '.squad'));
    expect(squads.map(s => s.name).sort()).toEqual(['backend', 'frontend']);
  });

  it('skips entries without a team.md', () => {
    writeSquad(TEAM_ROOT, '.squad/subsquads/frontend/team.md', '# Frontend Team\n');
    mkdirSync(path.join(TEAM_ROOT, '.squad', 'subsquads', 'empty-dir'), { recursive: true });

    const squads = discoverSubSquads(path.join(TEAM_ROOT, '.squad'));
    expect(squads.map(s => s.name)).toEqual(['frontend']);
  });

  it('parses labels from routing.md when present', () => {
    writeSquad(TEAM_ROOT, '.squad/subsquads/frontend/team.md', '# Frontend Team\n');
    writeSquad(TEAM_ROOT, '.squad/subsquads/frontend/routing.md', 'labels: squad:frontend, ui\n');

    const squads = discoverSubSquads(path.join(TEAM_ROOT, '.squad'));
    expect(squads[0]!.labels).toEqual(['squad:frontend', 'ui']);
  });

  it('returns empty when the subsquads directory does not exist', () => {
    const squads = discoverSubSquads(path.join(TEAM_ROOT, '.squad'));
    expect(squads).toEqual([]);
  });

  // Regression (#1490): before the fix, runWatch called
  // discoverSubSquads(teamRoot), which joined '.squad/subsquads' itself —
  // after `squad externalize`, subsquads/ lives at the external state dir,
  // not under the local .squad/, so discovery silently found nothing.
  // Proven here directly: the same subsquad only shows up when discovery
  // is pointed at the dir that actually holds it.
  it('finds nothing under the local .squad/ once subsquads/ has moved to an external state dir', () => {
    writeSquad(EXTERNAL_ROOT, 'subsquads/frontend/team.md', '# Frontend Team\n');

    const local = discoverSubSquads(path.join(TEAM_ROOT, '.squad'));
    expect(local).toEqual([]);

    const external = discoverSubSquads(EXTERNAL_ROOT);
    expect(external.map(s => s.name)).toEqual(['frontend']);
  });
});
