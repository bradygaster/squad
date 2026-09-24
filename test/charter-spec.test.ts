import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import Ajv2020, {
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  CHARTER_CAPABILITIES,
  CHARTER_DIAGNOSTIC_CODES,
  CHARTER_PROFILE,
  CHARTER_PROFILE_METADATA,
  compileCharterFull,
  parseCharterMarkdown,
  serializeCharter,
  validateCharterConformance,
  validateCharterMarkdown,
  type CharterCapability,
  type CharterDiagnostic,
  type ParsedCharter,
} from '@bradygaster/squad-sdk/parsers';

type ValidationApi = 'conformance';
type SerializationMode = 'canonical' | 'legacy' | 'preserve';

interface ManifestDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  start: { line: number; column: number };
  end: { line: number; column: number };
  path: string | null;
}

interface ParsedSemantics {
  identity: {
    id: string | null;
    purpose: string | null;
    name: string | null;
    role: string | null;
    expertise: string[] | null;
    style: string | null;
  };
  ownership: string | null;
  boundaries: string | null;
  collaboration: string | null;
  modelPreference: string | null;
  modelRationale: string | null;
  modelFallback: string | null;
  reasoningEffort: string | null;
  authoredReasoningEffort: string | null;
  contextTier: string | null;
  authoredContextTier: string | null;
}

interface ManifestCase {
  id: string;
  capabilities: CharterCapability[];
  input: {
    fixture: string | null;
    text: string | null;
    path: string | null;
    profile: string | null;
    validationApi: ValidationApi;
  };
  serialization: {
    mode: SerializationMode;
    edits: Array<{
      field: 'identity.purpose';
      value: string;
    }>;
  } | null;
  expected: {
    validation: {
      profile: string;
      accepted: boolean;
      conforms: boolean;
      classification: 'canonical' | 'noncanonical-compatible' | 'invalid';
      capabilities: CharterCapability[];
      diagnostics: ManifestDiagnostic[];
    };
    parsed: ParsedSemantics | null;
    serialization: {
      output: string | null;
      outputFixture: string | null;
      eol: 'LF' | 'CRLF' | 'CR';
      validation: {
        accepted: boolean;
        conforms: boolean;
        classification: 'canonical' | 'noncanonical-compatible' | 'invalid';
        diagnostics: ManifestDiagnostic[];
      };
    } | null;
    runtime: {
      compile: boolean;
      errorCodes: string[];
      resolvedModel: string | null;
      resolvedReasoningEffort: string | null;
      resolvedContextTier: string | null;
    } | null;
  };
}

interface FixtureManifest {
  $schema: './manifest.schema.json';
  schemaVersion: 1;
  profile: string;
  capabilities: CharterCapability[];
  cases: ManifestCase[];
}

interface ManifestSchema extends Record<string, unknown> {
  $defs: {
    capability: { enum: CharterCapability[] };
    diagnostic: {
      properties: {
        code: { enum: string[] };
      };
    };
  };
}

const FIXTURE_ROOT = path.resolve(__dirname, '..', 'test-fixtures', 'spec', 'charter-v0.1');

async function loadManifestDocument(): Promise<FixtureManifest> {
  return JSON.parse(
    await readFile(path.join(FIXTURE_ROOT, 'manifest.json'), 'utf8'),
  ) as FixtureManifest;
}

async function loadManifestSchema(): Promise<ManifestSchema> {
  return JSON.parse(
    await readFile(path.join(FIXTURE_ROOT, 'manifest.schema.json'), 'utf8'),
  ) as ManifestSchema;
}

async function compileManifestValidator(): Promise<ValidateFunction> {
  const schema = await loadManifestSchema();
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
  });
  return ajv.compile(schema as AnySchema);
}

async function loadManifest(): Promise<FixtureManifest> {
  const manifest = await loadManifestDocument();
  const validateManifest = await compileManifestValidator();
  if (!validateManifest(manifest)) {
    throw new Error(
      `Invalid charter conformance manifest:\n${JSON.stringify(validateManifest.errors, null, 2)}`,
    );
  }
  return manifest;
}

function schemaErrorKeywords(errors: ErrorObject[] | null | undefined): string[] {
  return errors?.map(error => error.keyword) ?? [];
}

async function readCaseSource(testCase: ManifestCase): Promise<string> {
  if (testCase.input.fixture !== null) {
    return readFile(path.join(FIXTURE_ROOT, testCase.input.fixture), 'utf8');
  }
  if (testCase.input.text !== null) return testCase.input.text;
  throw new Error(`${testCase.id}: exactly one input source is required`);
}

function validateCase(testCase: ManifestCase, markdown: string) {
  const options = {
    ...(testCase.input.path === null ? {} : { path: testCase.input.path }),
    ...(testCase.input.profile === null ? {} : { profile: testCase.input.profile }),
  };
  return Reflect.apply(validateCharterConformance, undefined, [markdown, options]);
}

function normalizeDiagnostics(
  diagnostics: readonly CharterDiagnostic[],
): ManifestDiagnostic[] {
  return diagnostics.map(diagnostic => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    start: { line: diagnostic.line, column: diagnostic.column },
    end: { line: diagnostic.endLine, column: diagnostic.endColumn },
    path: diagnostic.path ?? null,
  }));
}

function normalizeParsed(parsed: ParsedCharter): ParsedSemantics {
  return {
    identity: {
      id: parsed.identity.id ?? null,
      purpose: parsed.identity.purpose ?? null,
      name: parsed.identity.name ?? null,
      role: parsed.identity.role ?? null,
      expertise: parsed.identity.expertise ?? null,
      style: parsed.identity.style ?? null,
    },
    ownership: parsed.ownership ?? null,
    boundaries: parsed.boundaries ?? null,
    collaboration: parsed.collaboration ?? null,
    modelPreference: parsed.modelPreference ?? null,
    modelRationale: parsed.modelRationale ?? null,
    modelFallback: parsed.modelFallback ?? null,
    reasoningEffort: parsed.reasoningEffort ?? null,
    authoredReasoningEffort: parsed.authoredReasoningEffort ?? null,
    contextTier: parsed.contextTier ?? null,
    authoredContextTier: parsed.authoredContextTier ?? null,
  };
}

function applyEdits(parsed: ParsedCharter, testCase: ManifestCase): void {
  for (const edit of testCase.serialization?.edits ?? []) {
    if (edit.field === 'identity.purpose') {
      parsed.identity.purpose = edit.value;
    }
  }
}

function eolName(value: string): 'LF' | 'CRLF' | 'CR' {
  const first = value.match(/\r\n|\r|\n/)?.[0];
  if (first === '\r\n') return 'CRLF';
  if (first === '\r') return 'CR';
  return 'LF';
}

function runtimeErrorCodes(error: unknown): string[] {
  if (typeof error !== 'object' || error === null || !('context' in error)) return [];
  const context = error.context;
  if (typeof context !== 'object' || context === null || !('metadata' in context)) return [];
  const metadata = context.metadata;
  if (typeof metadata !== 'object' || metadata === null || !('diagnostics' in metadata)) {
    return [];
  }
  if (!Array.isArray(metadata.diagnostics)) return [];
  return metadata.diagnostics.flatMap(diagnostic =>
    typeof diagnostic === 'object'
      && diagnostic !== null
      && 'code' in diagnostic
      && typeof diagnostic.code === 'string'
      ? [diagnostic.code]
      : [],
  );
}

describe('Squad Charter Profile v0.1 portable conformance manifest', () => {
  it('validates the published manifest against its Draft 2020-12 schema', async () => {
    await expect(loadManifest()).resolves.toMatchObject({
      $schema: './manifest.schema.json',
      schemaVersion: 1,
      profile: CHARTER_PROFILE,
    });
  });

  it('rejects representative schema mutations', async () => {
    const manifest = await loadManifestDocument();
    const validateManifest = await compileManifestValidator();
    const firstCase = manifest.cases[0];
    const parseCase = manifest.cases.find(testCase =>
      testCase.expected.parsed !== null);
    expect(firstCase).toBeDefined();
    expect(parseCase).toBeDefined();
    if (firstCase === undefined || parseCase === undefined) {
      throw new Error('manifest requires cases for schema mutation coverage');
    }

    const { schemaVersion: _schemaVersion, ...missingRequired } = manifest;
    const invalidManifests: Array<{
      name: string;
      document: unknown;
      keyword: string;
    }> = [
      {
        name: 'forbidden top-level property',
        document: { ...manifest, unexpected: true },
        keyword: 'additionalProperties',
      },
      {
        name: 'missing required schema version',
        document: missingRequired,
        keyword: 'required',
      },
      {
        name: 'invalid validation result type',
        document: {
          ...manifest,
          cases: [
            {
              ...firstCase,
              expected: {
                ...firstCase.expected,
                validation: {
                  ...firstCase.expected.validation,
                  accepted: 'true',
                },
              },
            },
            ...manifest.cases.slice(1),
          ],
        },
        keyword: 'type',
      },
      {
        name: 'invalid expectation enum',
        document: {
          ...manifest,
          cases: [
            {
              ...firstCase,
              expected: {
                ...firstCase.expected,
                validation: {
                  ...firstCase.expected.validation,
                  classification: 'accepted',
                },
              },
            },
            ...manifest.cases.slice(1),
          ],
        },
        keyword: 'enum',
      },
      {
        name: 'both input sources supplied',
        document: {
          ...manifest,
          cases: [
            {
              ...firstCase,
              input: {
                ...firstCase.input,
                fixture: 'positive/canonical.md',
                text: '# duplicate source',
              },
            },
            ...manifest.cases.slice(1),
          ],
        },
        keyword: 'oneOf',
      },
      {
        name: 'invalid case identifier pattern',
        document: {
          ...manifest,
          cases: [
            { ...firstCase, id: 'INVALID_CASE_ID' },
            ...manifest.cases.slice(1),
          ],
        },
        keyword: 'pattern',
      },
      {
        name: 'parsed expectation without parse capability',
        document: {
          ...manifest,
          cases: manifest.cases.map(testCase =>
            testCase.id === parseCase.id
              ? {
                  ...testCase,
                  capabilities: testCase.capabilities.filter(
                    capability => capability !== CHARTER_CAPABILITIES.parse,
                  ),
                }
              : testCase),
        },
        keyword: 'type',
      },
    ];

    for (const mutation of invalidManifests) {
      expect(validateManifest(mutation.document), mutation.name).toBe(false);
      expect(
        schemaErrorKeywords(validateManifest.errors),
        `${mutation.name}: schema keyword`,
      ).toContain(mutation.keyword);
    }
  });

  it('declares the published profile metadata and every operational capability', async () => {
    const manifest = await loadManifest();
    const schema = await loadManifestSchema();
    expect(manifest.$schema).toBe('./manifest.schema.json');
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.profile).toBe(CHARTER_PROFILE);
    expect(manifest.capabilities).toEqual(Object.values(CHARTER_CAPABILITIES));
    expect(schema.$defs.capability.enum).toEqual(manifest.capabilities);
    expect(schema.$defs.diagnostic.properties.code.enum)
      .toEqual(CHARTER_DIAGNOSTIC_CODES);
    expect(CHARTER_PROFILE_METADATA).toEqual({
      id: CHARTER_PROFILE,
      artifactClass: 'required',
      rootRelativePath: 'agents/{id}/charter.md',
      repositoryRelativePath: '.squad/agents/{id}/charter.md',
    });

    const caseIds = manifest.cases.map(testCase => testCase.id);
    expect(new Set(caseIds).size).toBe(caseIds.length);

    for (const capability of manifest.capabilities) {
      expect(
        manifest.cases.some(testCase => testCase.capabilities.includes(capability)),
        capability,
      ).toBe(true);
    }

    const coveredDiagnostics = new Set(
      manifest.cases.flatMap(testCase =>
        testCase.expected.validation.diagnostics.map(diagnostic => diagnostic.code),
      ),
    );
    expect(
      [...coveredDiagnostics].sort(),
      'every normative diagnostic code has portable manifest coverage',
    ).toEqual([...CHARTER_DIAGNOSTIC_CODES].sort());

    for (const testCase of manifest.cases) {
      expect(testCase.capabilities, `${testCase.id}: known capabilities`).toEqual(
        testCase.capabilities.filter(capability =>
          manifest.capabilities.includes(capability),
        ),
      );
      expect(
        testCase.capabilities.includes(CHARTER_CAPABILITIES.validate),
        `${testCase.id}: validation capability`,
      ).toBe(true);
      expect(
        testCase.expected.parsed !== null,
        `${testCase.id}: parse applicability`,
      ).toBe(testCase.capabilities.includes(CHARTER_CAPABILITIES.parse));
      expect(
        testCase.serialization !== null
          && testCase.expected.serialization !== null,
        `${testCase.id}: edit applicability`,
      ).toBe(testCase.capabilities.includes(CHARTER_CAPABILITIES.edit));
      expect(
        testCase.expected.runtime !== null,
        `${testCase.id}: runtime applicability`,
      ).toBe(testCase.capabilities.includes(CHARTER_CAPABILITIES.runtime));
      if (testCase.capabilities.includes(CHARTER_CAPABILITIES.runtime)) {
        expect(testCase.input.profile, `${testCase.id}: explicit runtime profile`)
          .toBe(manifest.profile);
      }
    }
  });

  it('executes every normative case without synthesizing cases in TypeScript', async () => {
    const manifest = await loadManifest();

    for (const testCase of manifest.cases) {
      const markdown = await readCaseSource(testCase);
      const validation = validateCase(testCase, markdown);
      expect(
        {
          profile: validation.profile,
          accepted: validation.accepted,
          conforms: validation.conforms,
          classification: validation.conformance,
          capabilities: validation.capabilities,
          diagnostics: normalizeDiagnostics(validation.diagnostics),
        },
        testCase.id,
      ).toEqual(testCase.expected.validation);

      if (testCase.expected.parsed !== null) {
        expect(
          normalizeParsed(parseCharterMarkdown(markdown)),
          `${testCase.id}: parsed semantics`,
        ).toEqual(testCase.expected.parsed);
      }

      if (testCase.serialization !== null) {
        const parsed = parseCharterMarkdown(markdown);
        applyEdits(parsed, testCase);
        const output = serializeCharter(parsed, { format: testCase.serialization.mode });
        const expectedOutput = testCase.expected.serialization?.outputFixture
          ? await readFile(
              path.join(FIXTURE_ROOT, testCase.expected.serialization.outputFixture),
              'utf8',
            )
          : testCase.expected.serialization?.output;
        expect(output, `${testCase.id}: serialized output`).toBe(expectedOutput);
        expect(eolName(output), `${testCase.id}: line endings`)
          .toBe(testCase.expected.serialization?.eol);
        const outputValidation = validateCharterConformance(output, {
          profile: manifest.profile,
          ...(testCase.input.path === null ? {} : { path: testCase.input.path }),
        });
        expect({
          accepted: outputValidation.accepted,
          conforms: outputValidation.conforms,
          classification: outputValidation.conformance,
          diagnostics: normalizeDiagnostics(outputValidation.diagnostics),
        }, `${testCase.id}: serialized output validation`)
          .toEqual(testCase.expected.serialization?.validation);
      }

      if (testCase.capabilities.includes(CHARTER_CAPABILITIES.runtime)) {
        const runtimeExpectation = testCase.expected.runtime;
        expect(runtimeExpectation, `${testCase.id}: runtime expectation`).not.toBeNull();
        if (runtimeExpectation === null) {
          throw new Error(`${testCase.id}: runtime capability requires expected.runtime`);
        }
        const compile = () => compileCharterFull({
          agentName: 'manifest-agent',
          charterPath: testCase.input.path ?? 'agents/manifest-agent/charter.md',
          charterContent: markdown,
          ...(testCase.input.profile === null ? {} : { profile: testCase.input.profile }),
        });

        if (!runtimeExpectation.compile) {
          let errorCodes: string[] = [];
          try {
            compile();
          } catch (error) {
            errorCodes = runtimeErrorCodes(error);
          }
          expect(errorCodes, `${testCase.id}: runtime rejection codes`)
            .toEqual(runtimeExpectation.errorCodes);
        } else {
          const compiled = compile();
          expect({
            resolvedModel: compiled.resolvedModel ?? null,
            resolvedReasoningEffort: compiled.resolvedReasoningEffort ?? null,
            resolvedContextTier: compiled.resolvedContextTier ?? null,
          }, `${testCase.id}: runtime semantics`).toEqual({
            resolvedModel: runtimeExpectation.resolvedModel,
            resolvedReasoningEffort: runtimeExpectation.resolvedReasoningEffort,
            resolvedContextTier: runtimeExpectation.resolvedContextTier,
          });
        }
      }
    }
  });
});

describe('TypeScript charter validator reference behavior', () => {
  it('defaults the convenience validator to v0.1 without making it portable', async () => {
    const markdown = await readFile(
      path.join(FIXTURE_ROOT, 'positive', 'canonical.md'),
      'utf8',
    );

    expect(validateCharterMarkdown(markdown)).toMatchObject({
      profile: CHARTER_PROFILE,
      accepted: true,
      conforms: true,
      conformance: 'canonical',
      capabilities: [CHARTER_CAPABILITIES.validate],
      diagnostics: [],
    });
  });
});
