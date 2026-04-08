/**
 * Cross-package export smoke test
 *
 * Validates that every value import squad-cli uses from squad-sdk actually
 * exists at runtime.  TypeScript can resolve from source during development,
 * but the compiled npm output may diverge (missing re-exports, renamed files,
 * ESM/CJS mismatches).  This test catches that class of bug.
 *
 * How it works:
 *   For each SDK subpath the CLI imports from, we dynamically import the
 *   module and assert every named export the CLI relies on is defined.
 *
 * Maintenance:
 *   When a new import from @bradygaster/squad-sdk is added to squad-cli,
 *   add a corresponding assertion here.  The grep one-liner in the test
 *   description shows how to audit.
 *
 * Related incident: v0.9.3-insider.1 shipped with FSStorageProvider missing
 * from the SDK barrel — broke users at runtime while tests passed locally.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Helper ──────────────────────────────────────────────────────────────

/** Assert a set of named exports exist on a module. */
function expectExports(mod: Record<string, unknown>, names: string[], subpath: string) {
  for (const name of names) {
    expect(mod[name], `"${name}" should be exported from ${subpath}`).toBeDefined();
  }
}

// ─── Root barrel: @bradygaster/squad-sdk ─────────────────────────────────

describe('cross-package exports — CLI → SDK', () => {
  describe('@bradygaster/squad-sdk (root barrel)', () => {
    it('exports FSStorageProvider and core runtime symbols', async () => {
      const sdk = await import('@bradygaster/squad-sdk');
      expectExports(sdk, [
        'FSStorageProvider',
        'SquadState',
        'TIMEOUTS',
        'StreamingPipeline',
        'RuntimeEventBus',
        'resolveSquad',
        'resolveGlobalSquadPath',
        'initSquadTelemetry',
        'recordAgentSpawn',
        'recordAgentDuration',
        'recordAgentError',
        'recordAgentDestroy',
        'safeTimestamp',
        'getMeter',
      ], '@bradygaster/squad-sdk');
    });

    it('exports role helpers', async () => {
      const sdk = await import('@bradygaster/squad-sdk');
      expectExports(sdk, [
        'listRoles',
        'searchRoles',
        'getCategories',
        'getRoleById',
        'generateCharterFromRole',
        'addAgentToConfig',
      ], '@bradygaster/squad-sdk');
    });

    it('exports init / personal-squad helpers', async () => {
      const sdk = await import('@bradygaster/squad-sdk');
      expectExports(sdk, [
        'initSquad',
        'cleanupOrphanInitPrompt',
        'ensurePersonalSquadDir',
        'resolvePersonalSquadDir',
      ], '@bradygaster/squad-sdk');
    });

    it('exports external-state helpers', async () => {
      const sdk = await import('@bradygaster/squad-sdk');
      expectExports(sdk, [
        'resolveExternalStateDir',
        'deriveProjectKey',
      ], '@bradygaster/squad-sdk');
    });

    it('exports consult-mode helpers', async () => {
      const sdk = await import('@bradygaster/squad-sdk');
      expectExports(sdk, [
        'setupConsultMode',
        'isConsultMode',
        'PersonalSquadNotFoundError',
        'detectLicense',
        'loadStagedLearnings',
        'logConsultation',
        'mergeToPersonalSquad',
        'getPersonalSquadRoot',
      ], '@bradygaster/squad-sdk');
    });

    it('exports cross-squad helpers', async () => {
      const sdk = await import('@bradygaster/squad-sdk');
      expectExports(sdk, [
        'discoverSquads',
        'formatDiscoveryTable',
        'findSquadByName',
        'buildDelegationArgs',
        'loadSubSquadsConfig',
        'resolveSubSquad',
      ], '@bradygaster/squad-sdk');
    });

    it('exports RemoteBridge', async () => {
      const sdk = await import('@bradygaster/squad-sdk');
      expectExports(sdk, ['RemoteBridge'], '@bradygaster/squad-sdk');
    });
  });

  // ─── Subpath: /config ──────────────────────────────────────────────────

  describe('@bradygaster/squad-sdk/config', () => {
    it('exports config helpers used by CLI', async () => {
      const mod = await import('@bradygaster/squad-sdk/config');
      expectExports(mod, [
        'initSquad',
        'MigrationRegistry',
        'writeEconomyMode',
        'readEconomyMode',
      ], '@bradygaster/squad-sdk/config');
    });
  });

  // ─── Subpath: /config/agent-source ─────────────────────────────────────

  describe('@bradygaster/squad-sdk/config/agent-source', () => {
    it('exports LocalAgentSource', async () => {
      const mod = await import('@bradygaster/squad-sdk/config/agent-source');
      expectExports(mod, ['LocalAgentSource'], '@bradygaster/squad-sdk/config/agent-source');
    });
  });

  // ─── Subpath: /resolution ──────────────────────────────────────────────

  describe('@bradygaster/squad-sdk/resolution', () => {
    it('exports resolution helpers', async () => {
      const mod = await import('@bradygaster/squad-sdk/resolution');
      expectExports(mod, [
        'resolveSquad',
        'resolveSquadPaths',
        'resolveGlobalSquadPath',
        'resolvePersonalSquadDir',
        'ensurePersonalSquadDir',
      ], '@bradygaster/squad-sdk/resolution');
    });
  });

  // ─── Subpath: /client ──────────────────────────────────────────────────

  describe('@bradygaster/squad-sdk/client', () => {
    it('exports SquadClient', async () => {
      const mod = await import('@bradygaster/squad-sdk/client');
      expectExports(mod, ['SquadClient'], '@bradygaster/squad-sdk/client');
    });
  });

  // ─── Subpath: /adapter/errors ──────────────────────────────────────────

  describe('@bradygaster/squad-sdk/adapter/errors', () => {
    it('exports RateLimitError', async () => {
      const mod = await import('@bradygaster/squad-sdk/adapter/errors');
      expectExports(mod, ['RateLimitError'], '@bradygaster/squad-sdk/adapter/errors');
    });
  });

  // ─── Subpath: /agents/personal ─────────────────────────────────────────

  describe('@bradygaster/squad-sdk/agents/personal', () => {
    it('exports personal-agent helpers', async () => {
      const mod = await import('@bradygaster/squad-sdk/agents/personal');
      expectExports(mod, [
        'resolvePersonalAgents',
        'mergeSessionCast',
      ], '@bradygaster/squad-sdk/agents/personal');
    });
  });

  // ─── Subpath: /casting ─────────────────────────────────────────────────

  describe('@bradygaster/squad-sdk/casting', () => {
    it('exports CastingEngine', async () => {
      const mod = await import('@bradygaster/squad-sdk/casting');
      expectExports(mod, ['CastingEngine'], '@bradygaster/squad-sdk/casting');
    });
  });

  // ─── Subpath: /platform ────────────────────────────────────────────────

  describe('@bradygaster/squad-sdk/platform', () => {
    it('exports createPlatformAdapter', async () => {
      const mod = await import('@bradygaster/squad-sdk/platform');
      expectExports(mod, ['createPlatformAdapter'], '@bradygaster/squad-sdk/platform');
    });
  });

  // ─── Subpath: /ralph ───────────────────────────────────────────────────

  describe('@bradygaster/squad-sdk/ralph', () => {
    it('exports RalphMonitor', async () => {
      const mod = await import('@bradygaster/squad-sdk/ralph');
      expectExports(mod, ['RalphMonitor'], '@bradygaster/squad-sdk/ralph');
    });
  });

  describe('@bradygaster/squad-sdk/ralph/triage', () => {
    it('exports triage helpers', async () => {
      const mod = await import('@bradygaster/squad-sdk/ralph/triage');
      expectExports(mod, [
        'parseRoster',
        'parseRoutingRules',
        'parseModuleOwnership',
        'triageIssue',
      ], '@bradygaster/squad-sdk/ralph/triage');
    });
  });

  describe('@bradygaster/squad-sdk/ralph/rate-limiting', () => {
    it('exports rate-limiting helpers', async () => {
      const mod = await import('@bradygaster/squad-sdk/ralph/rate-limiting');
      expectExports(mod, [
        'PredictiveCircuitBreaker',
        'getTrafficLight',
      ], '@bradygaster/squad-sdk/ralph/rate-limiting');
    });
  });

  // ─── Subpath: /runtime/* ───────────────────────────────────────────────

  describe('@bradygaster/squad-sdk/runtime/event-bus', () => {
    it('exports EventBus', async () => {
      const mod = await import('@bradygaster/squad-sdk/runtime/event-bus');
      expectExports(mod, ['EventBus'], '@bradygaster/squad-sdk/runtime/event-bus');
    });
  });

  // ─── SDK exports-map file resolution ───────────────────────────────────

  describe('SDK package.json exports map → file existence', () => {
    it('every exports-map entry points to an existing file', async () => {
      const fs = await import('node:fs');

      // In a workspace monorepo the SDK lives at packages/squad-sdk.
      // In CI / installed scenarios, find it under node_modules.
      const candidates = [
        resolve(process.cwd(), 'packages', 'squad-sdk'),
        resolve(process.cwd(), 'node_modules', '@bradygaster', 'squad-sdk'),
      ];
      const sdkRoot = candidates.find(
        (p) => existsSync(resolve(p, 'package.json')),
      );
      expect(sdkRoot, 'Could not locate SDK package.json').toBeDefined();

      const pkg = JSON.parse(
        fs.readFileSync(resolve(sdkRoot!, 'package.json'), 'utf8'),
      );
      const exportsMap = pkg.exports as Record<string, Record<string, string>>;
      const missing: string[] = [];

      for (const [subpath, targets] of Object.entries(exportsMap)) {
        if (typeof targets === 'string') {
          if (!existsSync(resolve(sdkRoot!, targets))) {
            missing.push(`${subpath} → ${targets}`);
          }
          continue;
        }
        for (const [condition, file] of Object.entries(targets)) {
          if (!existsSync(resolve(sdkRoot!, file))) {
            missing.push(`${subpath}[${condition}] → ${file}`);
          }
        }
      }

      expect(missing, `Missing files in SDK exports map:\n${missing.join('\n')}`).toEqual([]);
    });
  });
});
