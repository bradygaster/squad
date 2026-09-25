import { access, readFile, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import Ajv2020, { type AnySchema, type ValidateFunction } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SPEC_ROOT = path.join(ROOT, 'docs', 'specification');
const FIXTURE_ROOT = path.join(ROOT, 'test-fixtures', 'spec', 'suite-v0.1');

const requirementsDocuments = [
  'team-routing-v0.1.md',
  'configuration-casting-v0.1.md',
  'execution-preferences-v0.1.md',
  'planning-activation-v0.1.md',
  'ceremony-v0.1.md',
  'work-lifecycle-v0.1.md',
  'github-work-lifecycle-binding-v0.1.md',
  'coordination-handoff-v0.1.md',
  'automation-v0.1.md',
  'state-memory-requirements-v0.1.md',
] as const;

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(FIXTURE_ROOT, file), 'utf8')) as unknown;
}

function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  ajv.addFormat('date-time', value => !Number.isNaN(Date.parse(value)));
  ajv.addFormat('uri-reference', value => !/\s/.test(value));
  return ajv;
}

async function evidenceValidator(): Promise<ValidateFunction> {
  return createAjv().compile(await readJson('evidence.schema.json') as AnySchema);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function markdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return markdownFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  }));
  return nested.flat().sort();
}

function markdownHeadingAnchors(content: string): Set<string> {
  const anchors = new Set<string>();
  const counts = new Map<string, number>();

  for (const match of content.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const heading = match[1]
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~]/g, '')
      .trim();
    const base = heading
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }

  return anchors;
}

function markdownLinkTargets(content: string): Array<{ line: number; target: string }> {
  const links: Array<{ line: number; target: string }> = [];
  let fenced = false;

  for (const [index, line] of content.split('\n').entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    for (const match of line.matchAll(/!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ line: index + 1, target: match[1].replace(/^<|>$/g, '') });
    }
  }

  return links;
}

function findDependencyCycle(
  profiles: Array<{ id: string; dependencies: string[] }>,
): string[] | null {
  const dependencies = new Map(profiles.map(profile => [profile.id, profile.dependencies]));
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];

  function visit(profileId: string): string[] | null {
    if (active.has(profileId)) {
      const cycleStart = stack.indexOf(profileId);
      return [...stack.slice(cycleStart), profileId];
    }
    if (visited.has(profileId)) return null;

    active.add(profileId);
    stack.push(profileId);
    for (const dependency of dependencies.get(profileId) ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    active.delete(profileId);
    visited.add(profileId);
    return null;
  }

  for (const profile of profiles) {
    const cycle = visit(profile.id);
    if (cycle) return cycle;
  }
  return null;
}

function governanceRelationshipErrors(value: {
  causationId: string | null;
  data: {
    reviewerUid: string;
    currentRevisionAuthorUid: string;
    successorRevisionAuthorUid: string | null;
    lockoutUids: string[];
    eligibleRevisionAuthorUids: string[];
    replayDisposition: string;
  };
}): string[] {
  const errors: string[] = [];
  if (value.data.reviewerUid === value.data.currentRevisionAuthorUid) errors.push('self-review');
  if (!value.data.lockoutUids.includes(value.data.currentRevisionAuthorUid)) {
    errors.push('author-not-locked');
  }
  if (value.data.eligibleRevisionAuthorUids.includes(value.data.currentRevisionAuthorUid)) {
    errors.push('locked-author-eligible');
  }
  if (value.data.eligibleRevisionAuthorUids.includes(value.data.reviewerUid)) {
    errors.push('reviewer-eligible');
  }
  if (value.data.successorRevisionAuthorUid !== null) {
    if (!value.data.eligibleRevisionAuthorUids.includes(value.data.successorRevisionAuthorUid)) {
      errors.push('successor-not-eligible');
    }
    if (value.data.lockoutUids.includes(value.data.successorRevisionAuthorUid)) {
      errors.push('successor-locked');
    }
    if (value.data.successorRevisionAuthorUid === value.data.reviewerUid) {
      errors.push('reviewer-is-successor');
    }
  }
  if (value.data.replayDisposition === 'duplicate-same-result' && value.causationId === null) {
    errors.push('duplicate-without-original-link');
  }
  return errors;
}

describe('Squad specification suite v0.1', () => {
  it.each([
    ['index.schema.json', 'index.json'],
    ['evidence.schema.json', 'governance-rejection.example.json'],
  ])('validates %s fixtures', async (schemaFile, exampleFile) => {
    const validate = createAjv().compile(await readJson(schemaFile) as AnySchema);
    const example = await readJson(exampleFile);

    expect(validate(example), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('allows neutral observations without an authority assertion', async () => {
    const validate = await evidenceValidator();
    const observation = {
      specversion: 'squad-interop/v0.1',
      schema: 'squad-observation/v0.1',
      id: '3f87d0a6-196e-4e07-9abc-77716b5d20b2',
      type: 'squad.observation.recorded',
      source: 'file:.squad/team.md',
      subject: 'record:team-roster',
      time: '2026-09-25T14:17:33Z',
      actor: { uid: 'observer:local-validator' },
      resource: { uid: 'record:team-roster', revision: 'sha256:abc' },
      correlationId: '9d8b858a-9cad-48d7-8bd5-9c465060182a',
      causationId: null,
      idempotencyKey: 'observe:team-roster:sha256-abc',
      payloadDigest: `sha256:${'a'.repeat(64)}`,
      redaction: 'none',
      data: { result: 'present' },
    };

    expect(validate(observation), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('checks every specification Markdown link and local anchor offline', async () => {
    const files = await markdownFiles(SPEC_ROOT);
    const contentByFile = new Map(
      await Promise.all(files.map(async file => [file, await readFile(file, 'utf8')] as const)),
    );
    const errors: string[] = [];

    for (const [file, content] of contentByFile) {
      for (const link of markdownLinkTargets(content)) {
        if (link.target.startsWith('https://')) continue;
        if (/^[a-z][a-z0-9+.-]*:/i.test(link.target) || link.target.startsWith('//')) {
          errors.push(`${path.relative(ROOT, file)}:${link.line}: external citation is not absolute HTTPS: ${link.target}`);
          continue;
        }

        const [rawTarget, rawAnchor] = link.target.split('#', 2);
        const target = rawTarget.length === 0
          ? file
          : path.resolve(path.dirname(file), decodeURIComponent(rawTarget));
        try {
          await access(target);
        } catch {
          errors.push(`${path.relative(ROOT, file)}:${link.line}: missing local target ${rawTarget}`);
          continue;
        }

        if (rawAnchor !== undefined) {
          if (!target.endsWith('.md')) {
            errors.push(`${path.relative(ROOT, file)}:${link.line}: local anchor target is not Markdown: ${link.target}`);
            continue;
          }
          const targetContent = contentByFile.get(target) ?? await readFile(target, 'utf8');
          const anchor = decodeURIComponent(rawAnchor).toLowerCase();
          if (!markdownHeadingAnchors(targetContent).has(anchor)) {
            errors.push(`${path.relative(ROOT, file)}:${link.line}: missing local anchor #${rawAnchor} in ${rawTarget || path.basename(file)}`);
          }
        }
      }
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('rejects incomplete authority assertions', async () => {
    const validate = await evidenceValidator();
    const example = await readJson('governance-rejection.example.json') as Record<string, unknown>;
    const invalid = clone(example);
    const authority = invalid['authority'] as Record<string, unknown>;
    delete authority['policyRevision'];

    expect(validate(invalid)).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ instancePath: '/authority' })]),
    );
  });

  it.each([
    ['CAS expected revision', (value: Record<string, unknown>) => {
      delete (value['resource'] as Record<string, unknown>)['expectedRevision'];
    }],
    ['replay key', (value: Record<string, unknown>) => {
      delete value['replayKey'];
    }],
    ['lockout identities', (value: Record<string, unknown>) => {
      delete (value['data'] as Record<string, unknown>)['lockoutUids'];
    }],
    ['blocking evidence', (value: Record<string, unknown>) => {
      (value['data'] as Record<string, unknown>)['blockers'] = [];
    }],
    ['transition states', (value: Record<string, unknown>) => {
      ((value['data'] as Record<string, unknown>)['transition'] as Record<string, unknown>)['currentState'] = 'completed';
    }],
  ])('rejects governance evidence missing %s', async (_name, mutate) => {
    const validate = await evidenceValidator();
    const invalid = clone(await readJson('governance-rejection.example.json') as Record<string, unknown>);
    mutate(invalid);

    expect(validate(invalid)).toBe(false);
  });

  it('enforces reviewer independence and revision-author eligibility', async () => {
    const example = await readJson('governance-rejection.example.json') as {
      data: {
        reviewerUid: string;
        currentRevisionAuthorUid: string;
        successorRevisionAuthorUid: string;
        lockoutUids: string[];
        eligibleRevisionAuthorUids: string[];
      };
    };

    expect(example.data.reviewerUid).not.toBe(example.data.currentRevisionAuthorUid);
    expect(example.data.lockoutUids).toContain(example.data.currentRevisionAuthorUid);
    expect(example.data.eligibleRevisionAuthorUids).not.toContain(example.data.currentRevisionAuthorUid);
    expect(example.data.eligibleRevisionAuthorUids).not.toContain(example.data.reviewerUid);
    expect(example.data.eligibleRevisionAuthorUids).toContain(example.data.successorRevisionAuthorUid);
    expect(governanceRelationshipErrors({ ...example, causationId: null })).toEqual([]);
  });

  it('rejects invalid lockout and replay relationships', async () => {
    const example = await readJson('governance-rejection.example.json') as {
      replayKey: string;
      idempotencyKey: string;
      data: {
        reviewerUid: string;
        currentRevisionAuthorUid: string;
        successorRevisionAuthorUid: string;
        lockoutUids: string[];
        eligibleRevisionAuthorUids: string[];
        replayDisposition: string;
      };
    };
    const invalidLockout = clone(example);
    invalidLockout.data.lockoutUids = [];
    invalidLockout.data.eligibleRevisionAuthorUids = [invalidLockout.data.currentRevisionAuthorUid];
    const invalidReplay = clone(example);
    invalidReplay.data.replayDisposition = 'duplicate-same-result';

    expect(governanceRelationshipErrors({ ...invalidLockout, causationId: null })).toEqual(
      expect.arrayContaining(['author-not-locked', 'locked-author-eligible']),
    );
    expect(governanceRelationshipErrors({ ...invalidReplay, causationId: null })).toContain(
      'duplicate-without-original-link',
    );
  });

  it('accepts clean approval and deadlock governance transitions', async () => {
    const validate = await evidenceValidator();
    const rejection = await readJson('governance-rejection.example.json') as Record<string, unknown>;
    const approval = clone(rejection);
    approval['type'] = 'squad.governance.approved';
    const approvalData = approval['data'] as Record<string, unknown>;
    approvalData['transition'] = { priorState: 'under-review', currentState: 'approved' };
    approvalData['successorRevisionAuthorUid'] = null;
    approvalData['blockers'] = [];
    approvalData['lockoutUids'] = [];
    approvalData['eligibleRevisionAuthorUids'] = [];
    approvalData['gateResult'] = 'accepted';

    expect(validate(approval), JSON.stringify(validate.errors, null, 2)).toBe(true);

    const deadlock = clone(rejection);
    deadlock['type'] = 'squad.governance.escalated';
    const deadlockData = deadlock['data'] as Record<string, unknown>;
    deadlockData['transition'] = { priorState: 'rejected', currentState: 'escalated' };
    deadlockData['successorRevisionAuthorUid'] = null;
    deadlockData['eligibleRevisionAuthorUids'] = [];
    deadlockData['escalation'] = {
      status: 'required',
      deadlocked: true,
      authorityUid: null,
      reason: 'No eligible successor revision author remains',
    };
    deadlockData['gateResult'] = 'escalated';

    expect(validate(deadlock), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it.each([
    ['rejection without blockers', (data: Record<string, unknown>) => {
      data['blockers'] = [];
    }],
    ['rejection without lockout evidence', (data: Record<string, unknown>) => {
      data['lockoutUids'] = [];
    }],
    ['approval with an open blocker', (data: Record<string, unknown>) => {
      data['transition'] = { priorState: 'under-review', currentState: 'approved' };
      data['successorRevisionAuthorUid'] = null;
      data['gateResult'] = 'accepted';
    }],
    ['deadlock with an eligible successor', (data: Record<string, unknown>) => {
      data['transition'] = { priorState: 'rejected', currentState: 'escalated' };
      data['successorRevisionAuthorUid'] = null;
      data['escalation'] = {
        status: 'required',
        deadlocked: true,
        authorityUid: null,
        reason: 'Contradictory eligible-author evidence',
      };
      data['gateResult'] = 'escalated';
    }],
  ])('rejects %s', async (_name, mutate) => {
    const validate = await evidenceValidator();
    const invalid = clone(await readJson('governance-rejection.example.json') as Record<string, unknown>);
    mutate(invalid['data'] as Record<string, unknown>);

    expect(validate(invalid)).toBe(false);
  });

  it('enforces suite index and Charter manifest invariants', async () => {
    const index = await readJson('index.json') as {
      publication: { status: string; revision: string | null; digest: string | null };
      dialects: Array<{ id: string }>;
      sharedSchemas: string[];
      profiles: Array<{
        id: string;
        maturity: string;
        spec: string;
        dialect: string;
        dependencies: string[];
        capabilities: string[];
        conformanceClasses: string[];
        manifest: string | null;
        manifestSchema: string | null;
        fixtures: string[];
        implementationStatus: string;
        knownDeviations: string[];
        promotionCriteria: string[];
        entryPoint: string;
      }>;
    };
    const profileIds = new Set(index.profiles.map(profile => profile.id));
    const dialectIds = new Set(index.dialects.map(dialect => dialect.id));
    const caseIds = new Set<string>();

    expect(index.publication).toEqual({ status: 'working-draft', revision: null, digest: null });
    expect(index.profiles.every(profile => !profile.maturity.startsWith('published'))).toBe(true);
    expect(index.profiles.find(profile => profile.id === 'squad-core/v0.1')).toMatchObject({
      maturity: 'experimental-normative-draft',
      manifest: null,
      capabilities: [],
      conformanceClasses: [],
    });
    expect(index.profiles.find(profile => profile.id === 'squad-charter/v0.1')).toMatchObject({
      maturity: 'executable-normative-draft',
    });
    expect(profileIds.size).toBe(index.profiles.length);
    expect(findDependencyCycle(index.profiles)).toBeNull();
    for (const profile of index.profiles) {
      expect(dialectIds.has(profile.dialect), profile.id).toBe(true);
      expect(profile.dependencies.every(dependency => profileIds.has(dependency)), profile.id).toBe(true);
      expect(await readFile(path.join(ROOT, profile.spec), 'utf8')).not.toHaveLength(0);
      expect(profile.implementationStatus, profile.id).not.toHaveLength(0);
      expect(profile.entryPoint, profile.id).not.toHaveLength(0);

      if (profile.manifest === null) {
        expect(profile.manifestSchema, profile.id).toBeNull();
        expect(profile.capabilities, profile.id).toEqual([]);
        expect(profile.conformanceClasses, profile.id).toEqual([]);
        expect(profile.promotionCriteria.length, profile.id).toBeGreaterThan(0);
      } else {
        expect(profile.manifestSchema, profile.id).not.toBeNull();
        const manifest = JSON.parse(await readFile(path.join(ROOT, profile.manifest), 'utf8')) as {
          profile: string;
          capabilities: string[];
          cases: Array<{ id: string }>;
        };
        const schema = JSON.parse(
          await readFile(path.join(ROOT, profile.manifestSchema!), 'utf8'),
        ) as AnySchema;
        const validate = createAjv().compile(schema);

        expect(validate(manifest), `${profile.id}: ${JSON.stringify(validate.errors, null, 2)}`).toBe(true);
        expect(manifest.profile).toBe(profile.id);
        expect(profile.capabilities).toEqual(manifest.capabilities);
        for (const testCase of manifest.cases) {
          const qualifiedId = `${profile.id}/${testCase.id}`;
          expect(caseIds.has(qualifiedId), qualifiedId).toBe(false);
          caseIds.add(qualifiedId);
        }
      }

      for (const fixture of profile.fixtures) {
        expect(await readFile(path.join(ROOT, fixture), 'utf8')).not.toHaveLength(0);
      }
    }

    for (const schema of index.sharedSchemas) {
      const document = JSON.parse(await readFile(path.join(ROOT, schema), 'utf8')) as AnySchema;
      expect(() => createAjv().compile(document)).not.toThrow();
    }
  });

  it('detects a cyclic suite dependency graph', async () => {
    const index = await readJson('index.json') as {
      profiles: Array<{ id: string; dependencies: string[] }>;
    };
    const cyclic = clone(index.profiles);
    const core = cyclic.find(profile => profile.id === 'squad-core/v0.1');
    expect(core).toBeDefined();
    core!.dependencies = ['squad-charter/v0.1'];

    expect(findDependencyCycle(cyclic)).toEqual([
      'squad-core/v0.1',
      'squad-charter/v0.1',
      'squad-core/v0.1',
    ]);
  });

  it.each(requirementsDocuments)('%s is non-claimable and avoids BCP 14 keywords', async (file) => {
    const content = await readFile(path.join(SPEC_ROOT, file), 'utf8');

    expect(content).toMatch(/\*\*Maturity:\*\* Requirements draft|\*\*Maturity:\*\* Informative draft/);
    expect(content).toMatch(/\*\*Claimable capabilities:\*\* None/);
    expect(content).toMatch(/## \d+\. Promotion criteria/i);
    expect(content).not.toMatch(/\b(MUST|MUST NOT|SHOULD|SHOULD NOT|MAY|REQUIRED|RECOMMENDED|OPTIONAL)\b/);
  });

  it('keeps volatile provider catalogs and casting aesthetics non-normative', async () => {
    const preferences = await readFile(
      path.join(SPEC_ROOT, 'execution-preferences-v0.1.md'),
      'utf8',
    );
    const casting = await readFile(
      path.join(SPEC_ROOT, 'configuration-casting-v0.1.md'),
      'utf8',
    );

    expect(preferences).not.toMatch(/gpt-|claude-|gemini-/i);
    expect(casting).toContain('Casting aesthetics are an');
    expect(casting).toContain('do not define authority');
  });
});
