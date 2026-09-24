import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHARTER_CAPABILITIES,
  CHARTER_PROFILE,
  CHARTER_PROFILE_METADATA,
  compileCharterFull,
  parseCharterMarkdown,
  serializeCharter,
  validateCharterMarkdown,
  type CharterConformance,
  type CharterDiagnosticCode,
  type CharterDiagnosticSeverity,
} from '@bradygaster/squad-sdk/parsers';

interface ExpectedDiagnostic {
  code: CharterDiagnosticCode;
  severity: CharterDiagnosticSeverity;
  line: number;
  column: number;
}

interface FixtureManifest {
  profile: string;
  requiredCapabilities: string[];
  fixtures: Array<{
    path: string;
    expected: {
      accepted: boolean;
      conforms: boolean;
      conformance: CharterConformance;
      diagnostics: ExpectedDiagnostic[];
      identityId?: string;
      identityName?: string;
      identityRole?: string;
      reasoningEffort?: string;
      contextTier?: string;
      serializedOutputPath?: string;
      editedOutputPath?: string;
    };
  }>;
  duplicateFields: Array<{
    section: 'Identity' | 'Model';
    name: string;
    value: string;
  }>;
  duplicateSections: string[];
}

const FIXTURE_ROOT = path.resolve(__dirname, '..', 'test-fixtures', 'spec', 'charter-v0.1');

async function loadManifest(): Promise<FixtureManifest> {
  return JSON.parse(
    await readFile(path.join(FIXTURE_ROOT, 'manifest.json'), 'utf8'),
  ) as FixtureManifest;
}

const CANONICAL = `# Contract Agent — Tester

## Identity
- **ID:** \`contract-agent\`
- **Purpose:** Exercise the charter contract.

## Accountable Responsibilities
- Contract tests.

## Non-Responsibilities
- Runtime authorization.

## Collaboration and Review Authority
- Reviews public API compatibility.

## Model
- **Preferred:** auto
- **Reasoning Effort:** auto
- **Context Tier:** auto
`;

describe('Squad Charter Profile v0.1', () => {
  it('executes the language-neutral conformance manifest', async () => {
    const manifest = await loadManifest();

    expect(manifest.profile).toBe(CHARTER_PROFILE);
    expect(manifest.requiredCapabilities).toEqual(Object.values(CHARTER_CAPABILITIES));
    expect(CHARTER_PROFILE_METADATA).toEqual({
      id: CHARTER_PROFILE,
      artifactClass: 'required',
      rootRelativePath: 'agents/{id}/charter.md',
      repositoryRelativePath: '.squad/agents/{id}/charter.md',
    });

    for (const fixture of manifest.fixtures) {
      const fixturePath = path.join(FIXTURE_ROOT, fixture.path);
      const markdown = await readFile(fixturePath, 'utf8');
      const validation = validateCharterMarkdown(markdown, { path: fixture.path });
      const parsed = parseCharterMarkdown(markdown);

      expect(validation.accepted, fixture.path).toBe(fixture.expected.accepted);
      expect(validation.conforms, fixture.path).toBe(fixture.expected.conforms);
      expect(validation.conformance, fixture.path).toBe(fixture.expected.conformance);
      expect(validation.capabilities, fixture.path).toEqual([CHARTER_CAPABILITIES.validate]);
      expect(
        validation.diagnostics.map(({ code, severity, line, column }) => ({
          code,
          severity,
          line,
          column,
        })),
        fixture.path,
      ).toEqual(fixture.expected.diagnostics);

      if (fixture.expected.identityId) {
        expect(parsed.identity.id, fixture.path).toBe(fixture.expected.identityId);
      }
      if (fixture.expected.identityName) {
        expect(parsed.identity.name, fixture.path).toBe(fixture.expected.identityName);
      }
      if (fixture.expected.identityRole) {
        expect(parsed.identity.role, fixture.path).toBe(fixture.expected.identityRole);
      }
      if (fixture.expected.reasoningEffort) {
        expect(parsed.reasoningEffort, fixture.path).toBe(fixture.expected.reasoningEffort);
      }
      if (fixture.expected.contextTier) {
        expect(parsed.contextTier, fixture.path).toBe(fixture.expected.contextTier);
      }
    }
  });

  it('preserves exact source on canonical no-op and exact extensions after a known edit', async () => {
    const manifest = await loadManifest();
    const fixture = manifest.fixtures.find(item => item.expected.editedOutputPath);
    expect(fixture).toBeDefined();

    const markdown = await readFile(path.join(FIXTURE_ROOT, fixture!.path), 'utf8');
    const expectedNoOp = await readFile(
      path.join(FIXTURE_ROOT, fixture!.expected.serializedOutputPath!),
      'utf8',
    );
    const expectedEdited = await readFile(
      path.join(FIXTURE_ROOT, fixture!.expected.editedOutputPath!),
      'utf8',
    );
    const parsed = parseCharterMarkdown(markdown);

    expect(serializeCharter(parsed)).toBe(expectedNoOp);

    parsed.identity.purpose = 'Verify edited fields without losing unknown extensions.';
    const edited = serializeCharter(parsed);
    expect(edited).toBe(expectedEdited);
    expect(edited.indexOf('## X-example-deployment'))
      .toBeLessThan(edited.indexOf('## X-example-policy'));
  });

  it('uses one scanner that ignores structural lookalikes in opaque contexts', async () => {
    const markdown = await readFile(
      path.join(FIXTURE_ROOT, 'round-trip', 'extensions.md'),
      'utf8',
    );
    const parsed = parseCharterMarkdown(markdown);
    const validation = validateCharterMarkdown(markdown);

    expect(parsed.identity.id).toBe('extensible-agent');
    expect(parsed.modelPreference).toBeUndefined();
    expect(parsed.reasoningEffort).toBeUndefined();
    expect(parsed.contextTier).toBeUndefined();
    expect(validation).toMatchObject({
      accepted: true,
      conforms: true,
      conformance: 'canonical',
      diagnostics: [],
    });
  });

  it('preserves CRLF source exactly and preserves CRLF extension bytes after editing', () => {
    const markdown = CANONICAL.replace(/\n/g, '\r\n')
      + '\r\n## X-example-data\r\n\r\nopaque: true\r\n';
    const parsed = parseCharterMarkdown(markdown);
    expect(serializeCharter(parsed)).toBe(markdown);

    parsed.identity.purpose = 'Edited purpose.';
    const edited = serializeCharter(parsed);
    expect(edited).toContain('## X-example-data\r\n\r\nopaque: true\r\n');
    expect(validateCharterMarkdown(edited).accepted).toBe(true);
  });

  it('enforces profile identity for POSIX and Windows paths only', () => {
    expect(
      validateCharterMarkdown(CANONICAL, {
        path: '/repo/.squad/agents/contract-agent/charter.md',
      }).diagnostics,
    ).toEqual([]);
    expect(
      validateCharterMarkdown(CANONICAL, {
        path: 'C:\\repo\\.squad\\agents\\contract-agent\\charter.md',
      }).diagnostics,
    ).toEqual([]);
    expect(
      validateCharterMarkdown(CANONICAL, {
        path: 'agents/contract-agent/charter.md',
      }).diagnostics,
    ).toEqual([]);

    const mismatch = validateCharterMarkdown(CANONICAL, {
      path: '.squad/agents/different-agent/charter.md',
    });
    expect(mismatch.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['SQC010']);
    expect(mismatch.diagnostics[0]).toMatchObject({ line: 4, column: 3 });

    expect(
      validateCharterMarkdown(CANONICAL, { path: 'docs/charter.md' }).diagnostics,
    ).toEqual([]);
  });

  it('rejects every duplicate standard machine field', async () => {
    const manifest = await loadManifest();
    for (const duplicate of manifest.duplicateFields) {
      const markdown = charterWithDuplicateField(duplicate);
      const diagnostics = validateCharterMarkdown(markdown).diagnostics;
      expect(
        diagnostics.filter(diagnostic => diagnostic.code === 'SQC004'),
        `${duplicate.section}.${duplicate.name}`,
      ).toHaveLength(1);
    }
  });

  it('rejects duplicate standard sections, including semantic legacy aliases', async () => {
    const manifest = await loadManifest();
    for (const section of manifest.duplicateSections) {
      const markdown = `${CANONICAL}\n## ${section}\n`;
      expect(
        validateCharterMarkdown(markdown).diagnostics.some(
          diagnostic => diagnostic.code === 'SQC011',
        ),
        section,
      ).toBe(true);
    }

    const aliasDuplicate = CANONICAL.replace(
      '## Non-Responsibilities',
      '## Boundaries\n\nLegacy duplicate.\n\n## Non-Responsibilities',
    );
    expect(
      validateCharterMarkdown(aliasDuplicate).diagnostics.some(
        diagnostic => diagnostic.code === 'SQC011',
      ),
    ).toBe(true);
  });

  function charterWithDuplicateField(
    duplicate: FixtureManifest['duplicateFields'][number],
  ): string {
    const duplicateLines = [
      `- **${duplicate.name}:** ${duplicate.value}`,
      `- **${duplicate.name}:** ${duplicate.value}`,
    ].join('\n');
    const identityFields = duplicate.section === 'Identity'
      ? [
          ...(duplicate.name === 'ID' ? [] : ['- **ID:** `contract-agent`']),
          ...(duplicate.name === 'Purpose' ? [] : ['- **Purpose:** Exercise the charter contract.']),
          duplicateLines,
        ].join('\n')
      : [
          '- **ID:** `contract-agent`',
          '- **Purpose:** Exercise the charter contract.',
        ].join('\n');
    const modelFields = duplicate.section === 'Model'
      ? duplicateLines
      : [
          '- **Preferred:** auto',
          '- **Reasoning Effort:** auto',
          '- **Context Tier:** auto',
        ].join('\n');

    return [
      '# Contract Agent — Tester',
      '',
      '## Identity',
      identityFields,
      '',
      '## Accountable Responsibilities',
      '- Contract tests.',
      '',
      '## Non-Responsibilities',
      '- Runtime authorization.',
      '',
      '## Collaboration and Review Authority',
      '- Reviews public API compatibility.',
      '',
      '## Model',
      modelFields,
      '',
    ].join('\n');
  }

  it('emits canonical responsibility headings unless legacy mode is explicit', async () => {
    const legacy = await readFile(
      path.join(FIXTURE_ROOT, 'legacy', 'template-style.md'),
      'utf8',
    );
    const parsed = parseCharterMarkdown(legacy);
    const canonical = serializeCharter(parsed);

    expect(canonical).toContain('## Accountable Responsibilities');
    expect(canonical).toContain('## Non-Responsibilities');
    expect(canonical).toContain('## Collaboration and Review Authority');
    expect(canonical).not.toContain('## What I Own');
    expect(serializeCharter(parsed, { format: 'legacy' })).toContain('## What I Own');
    expect(serializeCharter(parsed, { format: 'preserve' })).toBe(legacy);
  });

  it('preserves authored auto preferences without producing runtime overrides', () => {
    const compiled = compileCharterFull({
      agentName: 'contract-agent',
      charterPath: '.squad/agents/contract-agent/charter.md',
      charterContent: CANONICAL,
    });

    expect(compiled.parsed.modelPreference).toBe('auto');
    expect(compiled.parsed.authoredReasoningEffort).toBe('auto');
    expect(compiled.parsed.authoredContextTier).toBe('auto');
    expect(compiled.resolvedModel).toBeUndefined();
    expect(compiled.resolvedReasoningEffort).toBeUndefined();
    expect(compiled.resolvedContextTier).toBeUndefined();
    expect(serializeCharter(compiled.parsed)).toBe(CANONICAL);

    const explicitAutoOverride = compileCharterFull({
      agentName: 'contract-agent',
      charterPath: '.squad/agents/contract-agent/charter.md',
      charterContent: CANONICAL
        .replace('**Preferred:** auto', '**Preferred:** supported-model')
        .replace('**Reasoning Effort:** auto', '**Reasoning Effort:** high')
        .replace('**Context Tier:** auto', '**Context Tier:** long_context'),
      configOverrides: {
        model: 'auto',
        reasoningEffort: 'auto',
        contextTier: 'auto',
      },
    });
    expect(explicitAutoOverride.resolvedModel).toBeUndefined();
    expect(explicitAutoOverride.resolvedReasoningEffort).toBeUndefined();
    expect(explicitAutoOverride.resolvedContextTier).toBeUndefined();
  });

  it('reports unsupported profiles and extension collisions deterministically', () => {
    const unsupported = validateCharterMarkdown(CANONICAL, {
      profile: 'squad-charter/v9',
    });
    expect(unsupported).toMatchObject({
      accepted: false,
      conforms: false,
      conformance: 'invalid',
      capabilities: [],
    });
    expect(unsupported.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['SQC013']);

    const extensions = `${CANONICAL}
## X-Example-Data

one

## x-example-data

two
`;
    expect(
      validateCharterMarkdown(extensions).diagnostics.map(
        diagnostic => diagnostic.code,
      ),
    ).toEqual(['SQC106', 'SQC012', 'SQC106']);
  });

  it('returns identical diagnostic ordering and ranges across runs', () => {
    const markdown = `# Invalid Agent

## Identity
- **ID:** Invalid Agent
- **Purpose:**
- **Purpose:** duplicate

## Model
- **Context Tier:** huge
- **Reasoning Effort:** turbo
`;
    const first = validateCharterMarkdown(markdown);
    const second = validateCharterMarkdown(markdown);

    expect(second).toEqual(first);
    expect(first.diagnostics.every(diagnostic =>
      diagnostic.line >= 1
      && diagnostic.column >= 1
      && diagnostic.endLine >= diagnostic.line
      && diagnostic.endColumn >= diagnostic.column,
    )).toBe(true);
  });
});
