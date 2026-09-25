import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import Ajv2020, { type AnySchema } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SPEC_ROOT = path.join(ROOT, 'docs', 'specification');
const FIXTURE_ROOT = path.join(ROOT, 'test-fixtures', 'spec', 'suite-v0.1');

const normativeDocuments = [
  'interoperability-conventions-v0.1.md',
  'team-routing-v0.1.md',
  'configuration-casting-v0.1.md',
  'governance-review-v0.1.md',
  'execution-preferences-v0.1.md',
  'planning-activation-v0.1.md',
  'ceremony-v0.1.md',
  'work-lifecycle-v0.1.md',
  'github-work-lifecycle-binding-v0.1.md',
  'coordination-handoff-v0.1.md',
  'automation-v0.1.md',
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

describe('Squad specification suite v0.1', () => {
  it.each([
    ['index.schema.json', 'index.json'],
    ['evidence.schema.json', 'governance-rejection.example.json'],
  ])('validates %s fixtures', async (schemaFile, exampleFile) => {
    const ajv = createAjv();
    const validate = ajv.compile(await readJson(schemaFile) as AnySchema);
    const example = await readJson(exampleFile);

    expect(validate(example), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('enforces suite index cross-document invariants', async () => {
    const index = await readJson('index.json') as {
      dialects: Array<{ id: string }>;
      sharedSchemas: string[];
      profiles: Array<{
        id: string;
        spec: string;
        dialect: string;
        dependencies: string[];
        capabilities: string[];
        manifest: string | null;
        manifestSchema: string | null;
      }>;
    };
    const profileIds = new Set(index.profiles.map(profile => profile.id));
    const dialectIds = new Set(index.dialects.map(dialect => dialect.id));
    const caseIds = new Set<string>();

    expect(profileIds.size).toBe(index.profiles.length);
    for (const profile of index.profiles) {
      expect(dialectIds.has(profile.dialect), profile.id).toBe(true);
      expect(profile.capabilities.every(capability => capability.startsWith(`${profile.id}#`)), profile.id).toBe(true);
      expect(profile.dependencies.every(dependency => profileIds.has(dependency)), profile.id).toBe(true);
      expect(await readFile(path.join(ROOT, profile.spec), 'utf8')).not.toHaveLength(0);
      if (profile.manifest !== null) {
        expect(profile.manifestSchema, profile.id).not.toBeNull();
        const manifest = JSON.parse(await readFile(path.join(ROOT, profile.manifest), 'utf8')) as {
          profile?: string;
          schema?: string;
          cases?: Array<{ id: string }>;
        };
        const schema = JSON.parse(
          await readFile(path.join(ROOT, profile.manifestSchema!), 'utf8'),
        ) as AnySchema;
        const validate = createAjv().compile(schema);

        expect(validate(manifest), `${profile.id}: ${JSON.stringify(validate.errors, null, 2)}`).toBe(true);
        expect(manifest.profile ?? manifest.schema, profile.id).toBe(profile.id);
        for (const testCase of manifest.cases ?? []) {
          const qualifiedId = `${profile.id}#${testCase.id}`;
          expect(caseIds.has(qualifiedId), qualifiedId).toBe(false);
          caseIds.add(qualifiedId);
        }
      }
    }

    for (const schema of index.sharedSchemas) {
      const document = JSON.parse(await readFile(path.join(ROOT, schema), 'utf8')) as AnySchema;
      expect(() => createAjv().compile(document)).not.toThrow();
    }
  });

  it.each(normativeDocuments)('%s exposes falsifiable conformance sections', async (file) => {
    const content = await readFile(path.join(SPEC_ROOT, file), 'utf8');

    expect(content).toMatch(/\*\*Maturity:\*\*/);
    expect(content).toMatch(/## \d+\. .*Conformance/i);
    expect(content).toMatch(/\bMUST\b/);
    expect(content).toMatch(/squad-interop\/v0\.1|Interoperability Conventions/);
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
    expect(casting).toContain('MUST NOT define authority');
  });
});
