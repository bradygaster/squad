import { VALID_CONTEXT_TIERS, VALID_REASONING_EFFORTS } from '../config/models.js';
import {
  scanCharterMarkdown,
  type CharterMarkdownField,
  type CharterMarkdownHeading,
} from './charter-markdown.js';

export const CHARTER_PROFILE = 'squad-charter/v0.1' as const;

export const CHARTER_PROFILE_METADATA = {
  id: CHARTER_PROFILE,
  artifactClass: 'required',
  rootRelativePath: 'agents/{id}/charter.md',
  repositoryRelativePath: '.squad/agents/{id}/charter.md',
} as const;

export const CHARTER_CAPABILITIES = {
  parse: 'squad-charter/v0.1/parse',
  validate: 'squad-charter/v0.1/validate',
  edit: 'squad-charter/v0.1/edit',
  legacyConsume: 'squad-charter/v0.1/legacy-consume',
} as const;

export type CharterCapability =
  typeof CHARTER_CAPABILITIES[keyof typeof CHARTER_CAPABILITIES];

export const CHARTER_DIAGNOSTIC_CODES = [
  'SQC001',
  'SQC002',
  'SQC003',
  'SQC004',
  'SQC005',
  'SQC006',
  'SQC007',
  'SQC008',
  'SQC009',
  'SQC010',
  'SQC011',
  'SQC012',
  'SQC013',
  'SQC014',
  'SQC015',
  'SQC101',
  'SQC102',
  'SQC103',
  'SQC104',
  'SQC105',
  'SQC106',
  'SQC107',
  'SQC108',
] as const;

export type CharterDiagnosticCode = typeof CHARTER_DIAGNOSTIC_CODES[number];

export const CHARTER_DIAGNOSTIC_SEVERITIES = ['error', 'warning'] as const;
export type CharterDiagnosticSeverity = typeof CHARTER_DIAGNOSTIC_SEVERITIES[number];

export type CharterConformance =
  | 'canonical'
  | 'noncanonical-compatible'
  | 'invalid';

export interface CharterDiagnostic {
  code: CharterDiagnosticCode;
  severity: CharterDiagnosticSeverity;
  message: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  path?: string;
}

export interface CharterValidationOptions {
  /**
   * Artifact path context. Recognized forms are `agents/{id}/charter.md`,
   * `.squad/agents/{id}/charter.md`, or an absolute path ending in the latter.
   */
  path?: string;
  /** Requested profile. Unsupported versions produce SQC013. */
  profile?: string;
}

export interface CharterConformanceOptions extends CharterValidationOptions {
  /** Explicit profile selection is required for a conformance claim. */
  profile: string;
}

export interface CharterValidationResult {
  profile: string;
  /** True only for canonical profile documents. */
  conforms: boolean;
  /** True when a consumer may accept the document, including legacy input. */
  accepted: boolean;
  conformance: CharterConformance;
  capabilities: readonly CharterCapability[];
  diagnostics: readonly CharterDiagnostic[];
}

interface FieldDefinition {
  readonly name: string;
  readonly section: 'Identity' | 'Model';
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXTENSION_PATTERN = /^X-([a-z0-9]+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const CANONICAL_RESPONSIBILITY_SECTIONS = [
  'Accountable Responsibilities',
  'Non-Responsibilities',
  'Collaboration and Review Authority',
] as const;
const LEGACY_RESPONSIBILITY_SECTIONS = ['What I Own', 'Boundaries', 'Collaboration'] as const;
const STANDARD_SECTION_GROUPS = [
  { semantic: 'Identity', names: ['Identity'] },
  {
    semantic: 'Accountable Responsibilities',
    names: ['Accountable Responsibilities', 'What I Own'],
  },
  {
    semantic: 'Non-Responsibilities',
    names: ['Non-Responsibilities', 'Boundaries'],
  },
  {
    semantic: 'Collaboration and Review Authority',
    names: ['Collaboration and Review Authority', 'Collaboration'],
  },
  { semantic: 'Model', names: ['Model'] },
] as const;
const UNIQUE_MACHINE_FIELDS: readonly FieldDefinition[] = [
  { name: 'ID', section: 'Identity' },
  { name: 'Purpose', section: 'Identity' },
  { name: 'Name', section: 'Identity' },
  { name: 'Role', section: 'Identity' },
  { name: 'Expertise', section: 'Identity' },
  { name: 'Style', section: 'Identity' },
  { name: 'Preferred', section: 'Model' },
  { name: 'Rationale', section: 'Model' },
  { name: 'Fallback', section: 'Model' },
  { name: 'Reasoning Effort', section: 'Model' },
  { name: 'Context Tier', section: 'Model' },
] as const;
const COMPATIBILITY_FIELDS: readonly FieldDefinition[] = [
  { name: 'Name', section: 'Identity' },
  { name: 'Role', section: 'Identity' },
  { name: 'Expertise', section: 'Identity' },
  { name: 'Style', section: 'Identity' },
  { name: 'Fallback', section: 'Model' },
] as const;
const VALID_EFFORTS = new Set<string>(VALID_REASONING_EFFORTS);
const VALID_TIERS = new Set<string>(VALID_CONTEXT_TIERS);
const DIAGNOSTIC_ORDER = new Map(
  CHARTER_DIAGNOSTIC_CODES.map((code, index) => [code, index]),
);

/**
 * Validate a charter against the Squad Charter Profile v0.1.
 *
 * The validator is intentionally non-throwing so editors and migration tools
 * can report every deterministic diagnostic in one pass.
 */
export function validateCharterMarkdown(
  markdown: string,
  options: CharterValidationOptions = {},
): CharterValidationResult {
  return validateCharter(markdown, options, false);
}

/**
 * Validate a charter for an explicit portable conformance claim.
 *
 * Unlike {@link validateCharterMarkdown}, this API never assumes a profile.
 * JavaScript callers that omit `profile` receive SQC014.
 */
export function validateCharterConformance(
  markdown: string,
  options: CharterConformanceOptions,
): CharterValidationResult {
  return validateCharter(markdown, options, true);
}

function validateCharter(
  markdown: string,
  options: CharterValidationOptions | undefined,
  requireExplicitProfile: boolean,
): CharterValidationResult {
  const requestedProfile = options?.profile;
  const diagnostics: CharterDiagnostic[] = [];
  const add = (
    code: CharterDiagnosticCode,
    severity: CharterDiagnosticSeverity,
    message: string,
    location: { line: number; column?: number; width?: number },
  ): void => {
    const column = location.column ?? 1;
    const width = Math.max(location.width ?? 1, 1);
    diagnostics.push({
      code,
      severity,
      message,
      line: location.line,
      column,
      endLine: location.line,
      endColumn: column + width - 1,
      ...(options?.path ? { path: options.path } : {}),
    });
  };

  if (requireExplicitProfile && requestedProfile === undefined) {
    add(
      'SQC014',
      'error',
      'portable conformance validation requires an explicit profile',
      { line: 1 },
    );
    return createResult('', diagnostics, []);
  }

  const selectedProfile = requestedProfile ?? CHARTER_PROFILE;
  if (selectedProfile !== CHARTER_PROFILE) {
    add(
      'SQC013',
      'error',
      `unsupported charter profile "${selectedProfile}"`,
      { line: 1 },
    );
    return createResult(selectedProfile, diagnostics, []);
  }

  const scan = scanCharterMarkdown(markdown);
  if (!markdown.trim()) {
    add('SQC001', 'error', 'charter.md must not be empty', { line: 1 });
    return createResult(selectedProfile, diagnostics);
  }

  if (!scan.h1) {
    add('SQC002', 'error', 'charter.md must contain an H1 identity heading', { line: 1 });
  } else if (!/^.+?\s+—\s+.+?$/.test(scan.h1.name)) {
    add(
      'SQC003',
      'warning',
      'the canonical H1 form is "# <display name> — <role>"',
      headingLocation(scan.h1),
    );
  }

  for (const duplicate of scan.h1s.slice(1)) {
    add(
      'SQC015',
      'error',
      'charter.md must contain at most one structural H1 identity',
      headingLocation(duplicate),
    );
  }

  const identityHeadings = headingsNamed(scan.sections, 'Identity');
  const identityHeading = identityHeadings[0];
  if (!identityHeading) {
    add(
      'SQC101',
      'warning',
      'canonical charters include an "Identity" section',
      { line: scan.h1?.line ?? 1 },
    );
  }

  for (const group of STANDARD_SECTION_GROUPS) {
    const matches = scan.sections.filter(section =>
      group.names.some(name => equalName(section.name, name)),
    );
    for (const duplicate of matches.slice(1)) {
      add(
        'SQC011',
        'error',
        `standard section "${group.semantic}" must appear at most once`,
        headingLocation(duplicate),
      );
    }
  }

  for (const fieldDefinition of UNIQUE_MACHINE_FIELDS) {
    const matches = findFields(scan.fields, fieldDefinition.name, fieldDefinition.section);
    for (const duplicate of matches.slice(1)) {
      add(
        'SQC004',
        'error',
        `machine-readable field "${fieldDefinition.name}" must appear at most once`,
        fieldLocation(duplicate),
      );
    }
  }

  const id = findField(scan.fields, 'ID', 'Identity');
  const legacyName = findField(scan.fields, 'Name', 'Identity');
  if (id) {
    const normalizedId = stripCode(id.value);
    if (!ID_PATTERN.test(normalizedId)) {
      add(
        'SQC005',
        'error',
        'Identity ID must be a lowercase kebab-case identifier',
        fieldLocation(id),
      );
    }

    const pathId = profileIdentityFromPath(options?.path);
    if (pathId !== undefined && pathId !== normalizedId) {
      add(
        'SQC010',
        'error',
        `Identity ID "${normalizedId}" does not match profile path ID "${pathId}"`,
        fieldLocation(id),
      );
    }
  } else {
    add(
      'SQC102',
      'warning',
      legacyName
        ? 'legacy Identity Name is accepted, but canonical charters declare Identity ID'
        : 'canonical charters declare a non-empty Identity ID',
      { line: identityHeading?.line ?? scan.h1?.line ?? 1 },
    );
  }

  const purpose = findField(scan.fields, 'Purpose', 'Identity');
  if (!purpose) {
    add(
      'SQC103',
      'warning',
      'canonical charters declare a non-empty Identity Purpose',
      { line: identityHeading?.line ?? scan.h1?.line ?? 1 },
    );
  } else if (!purpose.value.trim()) {
    add(
      'SQC009',
      'error',
      'Identity Purpose must be non-empty',
      fieldLocation(purpose),
    );
  }

  const headingNames = new Set(scan.sections.map(section => section.name.toLowerCase()));
  for (const section of CANONICAL_RESPONSIBILITY_SECTIONS) {
    if (!headingNames.has(section.toLowerCase())) {
      add(
        'SQC104',
        'warning',
        `canonical charters include a "${section}" section`,
        { line: scan.h1?.line ?? 1 },
      );
    }
  }

  const firstLegacy = scan.sections.find(heading =>
    LEGACY_RESPONSIBILITY_SECTIONS.some(section => equalName(section, heading.name)),
  );
  if (firstLegacy) {
    add(
      'SQC105',
      'warning',
      'legacy responsibility headings are consumer-compatible but are not canonical v0.1',
      headingLocation(firstLegacy),
    );
  }

  const canonicalSectionNames = [
    'Identity',
    ...CANONICAL_RESPONSIBILITY_SECTIONS,
    'Model',
  ];
  const standardSections = scan.sections.filter(section => !section.isExtension);
  const unknownSection = standardSections.find(section =>
    !canonicalSectionNames.some(name => equalName(name, section.name))
    && !LEGACY_RESPONSIBILITY_SECTIONS.some(name => equalName(name, section.name)),
  );
  if (unknownSection) {
    add(
      'SQC108',
      'warning',
      `section "${unknownSection.name}" is not part of the canonical v0.1 shape`,
      headingLocation(unknownSection),
    );
  }

  const canonicalSections = standardSections.filter(section =>
    canonicalSectionNames.some(name => equalName(name, section.name)),
  );
  const canonicalOrder = canonicalSections.map(section =>
    canonicalSectionNames.findIndex(name => equalName(name, section.name)),
  );
  const outOfOrderIndex = canonicalOrder.findIndex(
    (order, index) => index > 0 && order < canonicalOrder[index - 1]!,
  );
  if (outOfOrderIndex >= 0) {
    add(
      'SQC108',
      'warning',
      'standard sections are not in canonical v0.1 order',
      headingLocation(canonicalSections[outOfOrderIndex]!),
    );
  }

  const preferred = findField(scan.fields, 'Preferred', 'Model');
  if (preferred && !preferred.value.trim()) {
    add(
      'SQC006',
      'error',
      'Model Preferred must be non-empty when present',
      fieldLocation(preferred),
    );
  }

  const reasoningEffort = findField(scan.fields, 'Reasoning Effort', 'Model');
  if (reasoningEffort) {
    const value = reasoningEffort.value.trim().toLowerCase();
    if (value !== 'auto' && !VALID_EFFORTS.has(value)) {
      add(
        'SQC007',
        'error',
        `Reasoning Effort must be one of: auto, ${VALID_REASONING_EFFORTS.join(', ')}`,
        fieldLocation(reasoningEffort),
      );
    }
  }

  const contextTier = findField(scan.fields, 'Context Tier', 'Model');
  if (contextTier) {
    const value = contextTier.value.trim().toLowerCase();
    if (value !== 'auto' && !VALID_TIERS.has(value)) {
      add(
        'SQC008',
        'error',
        `Context Tier must be one of: auto, ${VALID_CONTEXT_TIERS.join(', ')}`,
        fieldLocation(contextTier),
      );
    }

    for (const compatibilityField of COMPATIBILITY_FIELDS) {
      for (const field of findFields(
        scan.fields,
        compatibilityField.name,
        compatibilityField.section,
      )) {
        add(
          'SQC107',
          'warning',
          `compatibility field "${compatibilityField.name}" is accepted but is not canonical v0.1`,
          fieldLocation(field),
        );
      }
    }
  }

  const extensions = scan.sections.filter(section => section.isExtension);
  const extensionNames = new Set<string>();
  for (const extension of extensions) {
    const normalizedName = extension.name.toLowerCase();
    if (extensionNames.has(normalizedName)) {
      add(
        'SQC012',
        'error',
        `extension section "${extension.name}" collides case-insensitively with an earlier extension`,
        headingLocation(extension),
      );
    }
    extensionNames.add(normalizedName);

    if (!EXTENSION_PATTERN.test(extension.name)) {
      add(
        'SQC106',
        'warning',
        'extension headings should use "X-<lowercase-namespace>-<lowercase-name>"',
        headingLocation(extension),
      );
    }
  }

  diagnostics.sort((left, right) =>
    left.line - right.line
    || left.column - right.column
    || diagnosticIndex(left.code) - diagnosticIndex(right.code),
  );

  return createResult(selectedProfile, diagnostics);
}

function createResult(
  profile: string,
  diagnostics: readonly CharterDiagnostic[],
  capabilities: readonly CharterCapability[] = [CHARTER_CAPABILITIES.validate],
): CharterValidationResult {
  const accepted = diagnostics.every(diagnostic => diagnostic.severity !== 'error');
  const conformance: CharterConformance = !accepted
    ? 'invalid'
    : diagnostics.length === 0
      ? 'canonical'
      : 'noncanonical-compatible';
  return {
    profile,
    conforms: conformance === 'canonical',
    accepted,
    conformance,
    capabilities,
    diagnostics,
  };
}

function findFields(
  fields: readonly CharterMarkdownField[],
  name: string,
  section: string,
): CharterMarkdownField[] {
  return fields.filter(field =>
    equalName(field.name, name) && equalName(field.section, section),
  );
}

function findField(
  fields: readonly CharterMarkdownField[],
  name: string,
  section: string,
): CharterMarkdownField | undefined {
  return findFields(fields, name, section)[0];
}

function headingsNamed(
  headings: readonly CharterMarkdownHeading[],
  name: string,
): CharterMarkdownHeading[] {
  return headings.filter(heading => equalName(heading.name, name));
}

function equalName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function stripCode(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('`') && trimmed.endsWith('`')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function profileIdentityFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/');
  const artifactRelative = normalized.match(/^agents\/([^/]+)\/charter\.md$/);
  if (artifactRelative) return artifactRelative[1];

  const squadRelative = normalized.match(
    /(?:^|\/)\.squad\/agents\/([^/]+)\/charter\.md$/,
  );
  return squadRelative?.[1];
}

function headingLocation(
  heading: CharterMarkdownHeading,
): { line: number; column: number; width: number } {
  return {
    line: heading.line,
    column: heading.column,
    width: heading.width,
  };
}

function fieldLocation(
  field: CharterMarkdownField,
): { line: number; column: number; width: number } {
  return {
    line: field.line,
    column: field.column,
    width: field.width,
  };
}

function diagnosticIndex(code: CharterDiagnosticCode): number {
  return DIAGNOSTIC_ORDER.get(code) ?? Number.MAX_SAFE_INTEGER;
}
