import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  classifyRegistryTags,
  classifyRegistryVersion,
  planRegistryReconciliation,
  runRegistryClassification,
} from '../scripts/release/classify-npm-registry.mjs';

const VERSION = '2.0.0-preview.1';
const INTEGRITY = 'sha512-local';
const result = (status: number | null, stdout = '', stderr = '', signal: string | null = null) => ({
  status,
  stdout,
  stderr,
  signal,
});
const SDK = '@bradygaster/squad-sdk';
const CLI = '@bradygaster/squad-cli';
const versions = (sdk: string, cli: string) => ({
  [SDK]: { state: sdk },
  [CLI]: { state: cli },
});
const tagState = (
  sdkPrimary: boolean,
  cliPrimary: boolean,
  sdkPreview = sdkPrimary,
  cliPreview = cliPrimary,
) => ({
  [SDK]: {
    state: 'known',
    primary: { matches: sdkPrimary },
    preview: { matches: sdkPreview },
  },
  [CLI]: {
    state: 'known',
    primary: { matches: cliPrimary },
    preview: { matches: cliPreview },
  },
});

type ScenarioState = 'missing' | 'present' | 'conflict' | 'unknown';
interface RegistryScenario {
  sdk: ScenarioState;
  cli: ScenarioState;
  sdkTags?: Record<string, string>;
  cliTags?: Record<string, string>;
}

function scenarioSpawn(scenario: RegistryScenario) {
  return (_command: string, args: string[]) => {
    const spec = args[1];
    const isSdk = spec.startsWith(SDK);
    const state = isSdk ? scenario.sdk : scenario.cli;
    if (args.includes('dist-tags')) {
      return result(0, JSON.stringify(isSdk ? (scenario.sdkTags ?? {}) : (scenario.cliTags ?? {})));
    }
    if (state === 'missing') return result(1, '', 'npm error code E404\n404 Not Found');
    if (state === 'unknown') return result(1, '', 'generic registry failure');
    return result(0, JSON.stringify({
      version: VERSION,
      'dist.integrity': state === 'conflict' ? 'sha512-conflict' : INTEGRITY,
    }));
  };
}

function executeScenario(scenario: RegistryScenario) {
  const cache = path.resolve(__dirname, '..', 'node_modules', '.cache');
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(path.join(cache, 'npm-reconciliation-scenario-'));
  const packsDir = path.join(root, 'packs');
  const reconDir = path.join(root, 'reconciliation');
  mkdirSync(packsDir);
  mkdirSync(reconDir);
  writeFileSync(path.join(packsDir, 'local-packs.json'), JSON.stringify({
    [SDK]: { integrity: INTEGRITY },
    [CLI]: { integrity: INTEGRITY },
  }));
  try {
    let error: unknown = null;
    try {
      runRegistryClassification({
        version: VERSION,
        packsDir,
        reconDir,
        registry: 'https://registry.npmjs.org/',
        distTag: 'insider',
        addPreviewAlias: true,
        spawn: scenarioSpawn(scenario),
      });
    } catch (caught) {
      error = caught;
    }
    return {
      error,
      recorded: JSON.parse(readFileSync(path.join(reconDir, 'pre-publish-state.json'), 'utf8')),
    };
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

describe('npm pre-publish registry reconciliation', () => {
  it('classifies only an explicit 404 as missing', () => {
    const state = classifyRegistryVersion({
      name: '@bradygaster/squad-sdk',
      version: VERSION,
      localIntegrity: INTEGRITY,
      registry: 'https://registry.npmjs.org/',
      spawn: () => result(1, '', 'npm error code E404\n404 Not Found'),
    });
    expect(state.state).toBe('missing');
  });

  it('classifies timeout, TLS, 5xx, and other failures as unknown', () => {
    for (const failure of [
      result(null, '', 'request timed out', 'SIGTERM'),
      result(1, '', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'),
      result(1, '', '503 Service Unavailable'),
      result(1, '', 'generic registry failure'),
    ]) {
      const state = classifyRegistryVersion({
        name: '@bradygaster/squad-sdk',
        version: VERSION,
        localIntegrity: INTEGRITY,
        registry: 'https://registry.npmjs.org/',
        spawn: () => failure,
      });
      expect(state.state).toBe('unknown');
    }
    const invalidJson = classifyRegistryVersion({
      name: SDK,
      version: VERSION,
      localIntegrity: INTEGRITY,
      registry: 'https://registry.npmjs.org/',
      spawn: () => result(0, '{not-json'),
    });
    expect(invalidJson).toMatchObject({ state: 'unknown' });
    expect(invalidJson.diagnostic).toContain('invalid npm view JSON');
  });

  it('treats an explicit dist-tag 404 as empty only when that package version is missing', () => {
    const missing = classifyRegistryTags({
      name: SDK,
      version: VERSION,
      primaryTag: 'insider',
      requirePreviewAlias: true,
      versionState: 'missing',
      registry: 'https://registry.npmjs.org/',
      spawn: () => result(1, '', 'npm error code E404\n404 Not Found'),
    });
    expect(missing).toMatchObject({
      state: 'known',
      primary: { matches: false },
      preview: { matches: false },
    });
    const inconsistent = classifyRegistryTags({
      name: SDK,
      version: VERSION,
      primaryTag: 'insider',
      requirePreviewAlias: true,
      versionState: 'present',
      registry: 'https://registry.npmjs.org/',
      spawn: () => result(1, '', 'npm error code E404\n404 Not Found'),
    });
    expect(inconsistent.state).toBe('unknown');
  });

  it('accepts a present version only when registry integrity matches the verified tarball', () => {
    const state = classifyRegistryVersion({
      name: '@bradygaster/squad-sdk',
      version: VERSION,
      localIntegrity: INTEGRITY,
      registry: 'https://registry.npmjs.org/',
      spawn: () => result(0, JSON.stringify({ version: VERSION, 'dist.integrity': INTEGRITY })),
    });
    expect(state).toMatchObject({ state: 'present', version: VERSION, integrity: INTEGRITY });
  });

  it.each([
    {
      name: 'neither package present',
      versions: versions('missing', 'missing'),
      tags: tagState(false, false, false, false),
      expected: {
        state: 'publish_both',
        stagePair: true,
        publishSdk: true,
        publishCli: true,
      },
    },
    {
      name: 'SDK-only present',
      versions: versions('present', 'missing'),
      tags: tagState(false, false, false, false),
      expected: {
        state: 'publish_cli',
        stagePair: true,
        publishSdk: false,
        publishCli: true,
      },
    },
    {
      name: 'CLI-only present',
      versions: versions('missing', 'present'),
      tags: tagState(false, false, false, false),
      expected: {
        state: 'publish_sdk',
        stagePair: true,
        publishSdk: true,
        publishCli: false,
      },
    },
    {
      name: 'both present without dist-tags',
      versions: versions('present', 'present'),
      tags: tagState(false, false, false, false),
      expected: {
        state: 'promote_tags',
        stagePair: false,
        setSdkPrimary: true,
        setCliPrimary: true,
        setSdkPreview: true,
        setCliPreview: true,
      },
    },
    {
      name: 'partial tag promotion',
      versions: versions('present', 'present'),
      tags: tagState(true, true, true, false),
      expected: {
        state: 'promote_tags',
        stagePair: false,
        setSdkPrimary: false,
        setCliPrimary: false,
        setSdkPreview: false,
        setCliPreview: true,
      },
    },
    {
      name: 'already complete',
      versions: versions('present', 'present'),
      tags: tagState(true, true, true, true),
      expected: {
        state: 'complete',
        stagePair: false,
        noOp: true,
        setSdkPrimary: false,
        setCliPrimary: false,
        setSdkPreview: false,
        setCliPreview: false,
      },
    },
  ])('plans the explicit $name reconciliation outcome', ({ versions: packageVersions, tags, expected }) => {
    expect(planRegistryReconciliation({
      versions: packageVersions,
      tags,
      requirePreviewAlias: true,
    })).toMatchObject(expected);
  });

  it('plans explicit abort outcomes for integrity conflict and UNKNOWN reads', () => {
    expect(planRegistryReconciliation({
      versions: versions('conflict', 'present'),
      tags: tagState(true, true),
      requirePreviewAlias: true,
    })).toEqual({ state: 'abort_conflict' });
    expect(planRegistryReconciliation({
      versions: versions('unknown', 'present'),
      tags: tagState(true, true),
      requirePreviewAlias: true,
    })).toEqual({ state: 'abort_unknown' });
    expect(planRegistryReconciliation({
      versions: versions('present', 'present'),
      tags: {
        ...tagState(true, true),
        [CLI]: { state: 'unknown', diagnostic: 'timeout' },
      },
      requirePreviewAlias: true,
    })).toEqual({ state: 'abort_unknown' });
  });

  it.each([
    ['neither present', { sdk: 'missing', cli: 'missing' }, 'publish_both', { publishSdk: true, publishCli: true }],
    ['SDK-only present', { sdk: 'present', cli: 'missing' }, 'publish_cli', { publishSdk: false, publishCli: true }],
    ['CLI-only present', { sdk: 'missing', cli: 'present' }, 'publish_sdk', { publishSdk: true, publishCli: false }],
    ['both present without tags', { sdk: 'present', cli: 'present' }, 'promote_tags', { stagePair: false, setSdkPrimary: true, setCliPrimary: true }],
    ['partial tag promotion', {
      sdk: 'present',
      cli: 'present',
      sdkTags: { insider: VERSION, preview: VERSION },
      cliTags: { insider: VERSION },
    }, 'promote_tags', { setSdkPrimary: false, setCliPrimary: false, setSdkPreview: false, setCliPreview: true }],
    ['already complete', {
      sdk: 'present',
      cli: 'present',
      sdkTags: { insider: VERSION, preview: VERSION },
      cliTags: { insider: VERSION, preview: VERSION },
    }, 'complete', {
      noOp: true,
      stagePair: false,
      setSdkPrimary: false,
      setCliPrimary: false,
      setSdkPreview: false,
      setCliPreview: false,
    }],
    ['integrity conflict', { sdk: 'conflict', cli: 'present' }, 'abort_conflict', {}],
    ['UNKNOWN', { sdk: 'unknown', cli: 'present' }, 'abort_unknown', {}],
  ] as const)('persists the injectable-spawn %s execution plan', (_name, scenario, expectedState, expectedPlan) => {
    const { error, recorded } = executeScenario(scenario);
    expect(recorded.plan).toMatchObject({ state: expectedState, ...expectedPlan });
    if (expectedState.startsWith('abort_')) expect(error).toBeInstanceOf(Error);
    else expect(error).toBeNull();
  });

  it('classifies mismatching integrity as conflict and the workflow entry point fails closed', () => {
    const state = classifyRegistryVersion({
      name: '@bradygaster/squad-sdk',
      version: VERSION,
      localIntegrity: INTEGRITY,
      registry: 'https://registry.npmjs.org/',
      spawn: () => result(0, JSON.stringify({ version: VERSION, 'dist.integrity': 'sha512-other' })),
    });
    expect(state.state).toBe('conflict');

    const cache = path.resolve(__dirname, '..', 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const root = mkdtempSync(path.join(cache, 'npm-reconciliation-'));
    const packsDir = path.join(root, 'packs');
    const reconDir = path.join(root, 'reconciliation');
    mkdirSync(packsDir);
    mkdirSync(reconDir);
    writeFileSync(path.join(packsDir, 'local-packs.json'), JSON.stringify({
      '@bradygaster/squad-sdk': { integrity: INTEGRITY },
      '@bradygaster/squad-cli': { integrity: INTEGRITY },
    }));
    try {
      expect(() => runRegistryClassification({
        version: VERSION,
        packsDir,
        reconDir,
        registry: 'https://registry.npmjs.org/',
        distTag: 'insider',
        addPreviewAlias: true,
        spawn: (_command: string, args: string[]) => args.includes('dist-tags')
          ? result(0, '{}')
          : result(0, JSON.stringify({ version: VERSION, 'dist.integrity': 'sha512-other' })),
      })).toThrow(/CONFLICT/);
      const recorded = JSON.parse(readFileSync(path.join(reconDir, 'pre-publish-state.json'), 'utf8'));
      expect(recorded.packages[SDK].state).toBe('conflict');
      expect(recorded.plan.state).toBe('abort_conflict');
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('records and aborts an UNKNOWN registry outcome', () => {
    const cache = path.resolve(__dirname, '..', 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const root = mkdtempSync(path.join(cache, 'npm-reconciliation-unknown-'));
    const packsDir = path.join(root, 'packs');
    const reconDir = path.join(root, 'reconciliation');
    mkdirSync(packsDir);
    mkdirSync(reconDir);
    writeFileSync(path.join(packsDir, 'local-packs.json'), JSON.stringify({
      [SDK]: { integrity: INTEGRITY },
      [CLI]: { integrity: INTEGRITY },
    }));
    try {
      expect(() => runRegistryClassification({
        version: VERSION,
        packsDir,
        reconDir,
        registry: 'https://registry.npmjs.org/',
        distTag: 'insider',
        addPreviewAlias: true,
        spawn: () => result(1, '', '503 Service Unavailable'),
      })).toThrow(/UNKNOWN/);
      const recorded = JSON.parse(readFileSync(path.join(reconDir, 'pre-publish-state.json'), 'utf8'));
      expect(recorded.plan.state).toBe('abort_unknown');
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
