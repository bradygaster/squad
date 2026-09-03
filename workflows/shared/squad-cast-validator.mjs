#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CORE_PAYLOAD = [
  '.squad/team.md',
  '.squad/routing.md',
  '.squad/casting/registry.json',
  '.squad/casting/history.json',
  '.squad/casting/policy.json',
  '.github/agents/squad.agent.md',
  'meet-the-squad.md',
];

// The four built-in support agents are permanent, non-configurable, and
// always present in a GH-AW Cast, separate from selected Cast specialists.
// There is no mechanism to add, remove, or rename members of this set.
const REQUIRED_BUILTIN_IDS = ['fact-checker', 'ralph', 'rai', 'scribe'];
const BUILTIN_DISPLAY_NAMES = {
  scribe: 'Scribe',
  ralph: 'Ralph',
  rai: 'Rai',
  'fact-checker': 'Fact Checker',
};
const REQUIRED_BUILTIN_CHARTERS = REQUIRED_BUILTIN_IDS
  .map((id) => `.squad/agents/${id}/charter.md`)
  .sort();
const BUILTIN_SECTION_HEADING = '## Built-in Support Agents';
const CAST_SOURCES_HEADING = '## Cast sources';
const BUILTIN_NAME_ROW_PATTERN = /^\|\s*(Scribe|Ralph|Rai|Fact Checker)\s*\|/gmi;
const PLACEHOLDER_PATTERN = /\b(?:pending|uncast)\b|(?:specialists|taskTypes|hints)=0\b/i;
const FORBIDDEN_REFERENCE_PATTERNS = [
  ['standalone template', /^\.squad\/templates\//],
  ['standalone support state', /^\.squad\/(?:decisions|config|hooks|identity|orchestration-log|plugins|scripts|skills|workflows)(?:\/|\.|$)/],
  ['non-GH-AW client', /^\.(?:claude|copilot|cursor|gemini|opencode|vscode)\//],
  ['internal source', /(?:^|\/)(?:packages|src)\//],
];
const BARE_INTERNAL_PATH_PATTERN =
  /(?:^|[\s`"'(])((?:packages\/[^/\s`"')]+\/src|src\/(?:agents|casting|cli|client|config|coordinator|hooks|runtime|tools))\/[^\s`"')]+)/gm;


function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Usage: validate-gh-aw-cast.mjs --root <path> --payload <json-file>');
    }
    args.set(key.slice(2), value);
  }
  if (!args.has('root') || !args.has('payload')) {
    throw new Error('Usage: validate-gh-aw-cast.mjs --root <path> --payload <json-file>');
  }
  return {
    root: resolve(args.get('root')),
    payloadPath: resolve(args.get('payload')),
  };
}

function readText(root, relativePath) {
  return readFileSync(join(root, ...relativePath.split('/')), 'utf8').replace(/\r\n/g, '\n');
}

function normalizePayloadPath(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.startsWith('/')
    || value.includes('\\')
    || value.split('/').includes('..')
    || /[*?{}[\]]/.test(value)
  ) {
    return null;
  }
  return value.replace(/^\.\//, '');
}

function exactPathStatus(root, relativePath) {
  let current = root;
  for (const segment of relativePath.split('/')) {
    if (!existsSync(current) || !statSync(current).isDirectory()) {
      return { exists: false, detail: `parent directory is absent before ${segment}` };
    }
    const entries = readdirSync(current);
    if (!entries.includes(segment)) {
      const caseMismatch = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
      return {
        exists: false,
        detail: caseMismatch
          ? `case mismatch: expected ${segment}, found ${caseMismatch}`
          : `missing segment ${segment}`,
      };
    }
    current = join(current, segment);
  }
  return {
    exists: existsSync(current),
    file: existsSync(current) && statSync(current).isFile(),
    detail: existsSync(current) ? 'path is not a file' : 'path is absent',
  };
}

function extractLocalReferences(markdown) {
  const references = [];
  const pattern = /(?:^|[\s`"'([])(\.[A-Za-z0-9_-]+\/[A-Za-z0-9_.*?{}@+~/-]+)/gm;
  for (const match of markdown.matchAll(pattern)) {
    references.push(match[1].replace(/[.,;:]+$/, ''));
  }
  return [...new Set(references)];
}

/**
 * Extract the body of a single `## Heading` section (up to the next `##`
 * heading or end of document). Requires the heading to appear exactly once;
 * returns null and records an error otherwise.
 */
function extractSingleSection(markdown, heading, sourceLabel, errors) {
  const headingRe = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gm');
  const matches = markdown.match(headingRe) ?? [];
  if (matches.length !== 1) {
    errors.push(`${sourceLabel}: expected exactly one "${heading}" heading, found ${matches.length}`);
    return null;
  }
  const idx = markdown.search(headingRe);
  const afterHeadingLine = markdown.slice(idx + markdown.slice(idx).indexOf('\n') + 1);
  const nextHeadingIdx = afterHeadingLine.search(/^##\s/m);
  return nextHeadingIdx === -1 ? afterHeadingLine : afterHeadingLine.slice(0, nextHeadingIdx);
}

/** Charter-path references (`.squad/agents/{id}/charter.md`) found in a markdown fragment. */
function charterReferences(markdown) {
  return extractLocalReferences(markdown)
    .filter((reference) => /^\.squad\/agents\/[^/]+\/charter\.md$/.test(reference))
    .sort();
}

function parseRouting(routing, activeNames, errors) {
  const headingMatches = routing.match(/^## Routing Table\s*$/gm) ?? [];
  if (headingMatches.length !== 1) {
    errors.push(`routing: expected exactly one "## Routing Table" heading, found ${headingMatches.length}`);
  }
  if (/^## Work Type\s*(?:→|->)\s*Agent\s*$/gmi.test(routing)) {
    errors.push('routing: legacy Work Type to Agent section is forbidden');
  }

  const section = routing.match(/^## Routing Table\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m)?.[1] ?? '';
  const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.includes('| Work Type | Route To | Examples |')) {
    errors.push('routing: exact header "| Work Type | Route To | Examples |" is required');
  }

  const rows = lines
    .filter((line) => /^\|.+\|$/.test(line))
    .filter((line) => line !== '| Work Type | Route To | Examples |')
    .filter((line) => !/^\|\s*:?-+/.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length === 3);

  if (rows.length === 0) {
    errors.push('routing: at least one routing row is required');
  }

  const routedNames = new Set();
  for (const [workType, routeTo] of rows) {
    if (!workType || !routeTo) {
      errors.push('routing: work type and route target must be non-empty');
      continue;
    }
    for (const target of routeTo.split(',').map((value) => value.trim()).filter(Boolean)) {
      if (!activeNames.has(target)) {
        errors.push(`routing: target "${target}" is not an active registry persistent_name`);
      } else {
        routedNames.add(target);
      }
    }
  }

  for (const name of activeNames) {
    if (!routedNames.has(name)) {
      errors.push(`routing: active member "${name}" has no route`);
    }
  }
  return rows;
}

function parseRegistry(root, errors) {
  let registry;
  try {
    registry = JSON.parse(readText(root, '.squad/casting/registry.json'));
  } catch (error) {
    errors.push(`registry: invalid JSON (${error.message})`);
    return [];
  }
  if (!registry?.agents || typeof registry.agents !== 'object' || Array.isArray(registry.agents)) {
    errors.push('registry: top-level agents object is required');
    return [];
  }
  const active = Object.entries(registry.agents)
    .filter(([, value]) => value?.status === 'active')
    .map(([id, value]) => ({ id, name: value.persistent_name }));
  if (active.length === 0) {
    errors.push('registry: at least one active member is required');
  }
  for (const member of active) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(member.id) || typeof member.name !== 'string' || !member.name.trim()) {
      errors.push(`registry: invalid active member ${JSON.stringify(member)}`);
    }
    if (REQUIRED_BUILTIN_IDS.includes(member.id)) {
      errors.push(`registry: built-in id "${member.id}" must not be an active specialist registry entry`);
    }
  }
  return active;
}

function validateCapabilities(coordinator, active, routingRows, errors) {
  const beginCount = coordinator.match(/<!-- SQUAD:TEAM-CAPABILITIES:BEGIN -->/g)?.length ?? 0;
  const endCount = coordinator.match(/<!-- SQUAD:TEAM-CAPABILITIES:END -->/g)?.length ?? 0;
  if (beginCount !== 1 || endCount !== 1) {
    errors.push(`coordinator: expected one capability marker pair, found BEGIN=${beginCount} END=${endCount}`);
    return;
  }
  const block = coordinator.match(
    /<!-- SQUAD:TEAM-CAPABILITIES:BEGIN -->([\s\S]*?)<!-- SQUAD:TEAM-CAPABILITIES:END -->/,
  )?.[1] ?? '';
  const metadata = block.match(
    /<!-- squad:capabilities schema=1 specialists=(\d+) taskTypes=(\d+) hints=(\d+) -->/,
  );
  if (!metadata) {
    errors.push('coordinator: synchronized nonzero capability metadata is required');
  } else {
    const [, specialists, taskTypes, hints] = metadata.map(Number);
    if (
      specialists !== active.length
      || taskTypes !== routingRows.length
      || hints !== routingRows.length
      || specialists === 0
      || taskTypes === 0
      || hints === 0
    ) {
      errors.push(
        `coordinator: capability counts must equal active/routing state `
        + `(specialists=${active.length}, taskTypes=${routingRows.length}, hints=${routingRows.length})`,
      );
    }
  }
  if (PLACEHOLDER_PATTERN.test(block)) {
    errors.push('coordinator: pending, uncast, or zero capability markers are forbidden');
  }
  for (const [id, displayName] of Object.entries(BUILTIN_DISPLAY_NAMES)) {
    if (new RegExp(`\\b${displayName}\\b`, 'i').test(block)) {
      errors.push(`coordinator: capability block must not list built-in "${id}" as a specialist`);
    }
  }
  for (const member of active) {
    if (!block.includes(member.name)) {
      errors.push(`coordinator: capability block omits active member "${member.name}"`);
    }
  }
  for (const [workType, routeTo] of routingRows) {
    if (!block.includes(workType) || !block.includes(routeTo)) {
      errors.push(`coordinator: capability block omits route "${workType}" -> "${routeTo}"`);
    }
  }
}

export function validateCastTree({ root, payloadPath }) {
  const errors = [];
  let payloadValue;
  try {
    payloadValue = JSON.parse(readFileSync(payloadPath, 'utf8'));
  } catch (error) {
    return [`payload: invalid JSON (${error.message})`];
  }
  if (!Array.isArray(payloadValue)) {
    return ['payload: expected a JSON array of concrete repository-relative paths'];
  }

  const payload = [];
  for (const value of payloadValue) {
    const normalized = normalizePayloadPath(value);
    if (!normalized) {
      errors.push(`payload: invalid, non-concrete, or non-POSIX path ${JSON.stringify(value)}`);
    } else {
      payload.push(normalized);
    }
  }
  if (new Set(payload).size !== payload.length) {
    errors.push('payload: duplicate paths are forbidden');
  }

  for (const required of CORE_PAYLOAD) {
    if (!payload.includes(required)) errors.push(`payload: missing required path ${required}`);
  }

  const active = parseRegistry(root, errors);
  const activeNames = new Set(active.map(({ name }) => name));
  const activeCharters = active.map(({ id }) => `.squad/agents/${id}/charter.md`);
  const expectedPayload = new Set([...CORE_PAYLOAD, ...activeCharters, ...REQUIRED_BUILTIN_CHARTERS]);
  for (const path of payload) {
    if (!expectedPayload.has(path)) errors.push(`payload: unexpected path ${path}`);
  }
  for (const path of expectedPayload) {
    if (!payload.includes(path)) errors.push(`payload: missing active Cast path ${path}`);
  }

  for (const path of payload) {
    const status = exactPathStatus(root, path);
    if (!status.exists || !status.file) {
      errors.push(`tree: ${path} does not exist with exact Linux casing (${status.detail})`);
    }
  }

  const agentsPath = join(root, '.squad', 'agents');
  if (existsSync(agentsPath)) {
    const materializedIds = readdirSync(agentsPath)
      .filter((entry) => statSync(join(agentsPath, entry)).isDirectory())
      .sort();
    const activeIds = active.map(({ id }) => id).sort();
    const expectedIds = [...new Set([...activeIds, ...REQUIRED_BUILTIN_IDS])].sort();
    if (JSON.stringify(materializedIds) !== JSON.stringify(expectedIds)) {
      errors.push(
        `tree: materialized agent directories must exactly match active registry IDs plus the `
        + `four required built-ins (expected ${expectedIds.join(', ')}, found ${materializedIds.join(', ')})`,
      );
    }
  }

  let team = '';
  let routing = '';
  let coordinator = '';
  try {
    team = readText(root, '.squad/team.md');
    routing = readText(root, '.squad/routing.md');
    coordinator = readText(root, '.github/agents/squad.agent.md');
  } catch (error) {
    errors.push(`tree: could not read final coordinator/team/routing (${error.message})`);
    return errors;
  }

  const teamCharters = charterReferences(team);
  const expectedTeamCharters = [...new Set([...activeCharters, ...REQUIRED_BUILTIN_CHARTERS])].sort();
  if (JSON.stringify(teamCharters) !== JSON.stringify(expectedTeamCharters)) {
    errors.push(
      `team: charter references must exactly match active specialists plus the four required `
      + `built-ins (expected ${expectedTeamCharters.join(', ')}, found ${teamCharters.join(', ')})`,
    );
  }

  const membersSection = extractSingleSection(team, '## Members', 'team', errors);
  if (membersSection !== null) {
    const leakedBuiltinCharters = charterReferences(membersSection)
      .filter((reference) => REQUIRED_BUILTIN_CHARTERS.includes(reference));
    if (leakedBuiltinCharters.length > 0) {
      errors.push(`team: Members roster must not reference built-in charters: ${leakedBuiltinCharters.join(', ')}`);
    }
    const builtinRows = [...membersSection.matchAll(BUILTIN_NAME_ROW_PATTERN)].map((match) => match[1]);
    if (builtinRows.length > 0) {
      errors.push(`team: Members roster must not list built-in agents as specialists: ${[...new Set(builtinRows)].join(', ')}`);
    }
  }

  const builtinSection = extractSingleSection(team, BUILTIN_SECTION_HEADING, 'team', errors);
  if (builtinSection !== null) {
    const builtinSectionCharters = charterReferences(builtinSection);
    if (JSON.stringify(builtinSectionCharters) !== JSON.stringify(REQUIRED_BUILTIN_CHARTERS)) {
      errors.push(
        `team: "${BUILTIN_SECTION_HEADING}" must reference exactly the four required built-in charters `
        + `(expected ${REQUIRED_BUILTIN_CHARTERS.join(', ')}, found ${builtinSectionCharters.join(', ')})`,
      );
    }
  }

  const castSourcesSection = extractSingleSection(coordinator, CAST_SOURCES_HEADING, 'coordinator', errors);
  if (castSourcesSection !== null) {
    const castSourcesBuiltinCharters = charterReferences(castSourcesSection)
      .filter((reference) => REQUIRED_BUILTIN_CHARTERS.includes(reference));
    if (JSON.stringify(castSourcesBuiltinCharters) !== JSON.stringify(REQUIRED_BUILTIN_CHARTERS)) {
      errors.push(
        `coordinator: "${CAST_SOURCES_HEADING}" must reference exactly the four required built-in charters `
        + `(expected ${REQUIRED_BUILTIN_CHARTERS.join(', ')}, found ${castSourcesBuiltinCharters.join(', ')})`,
      );
    }
  }
  extractSingleSection(coordinator, BUILTIN_SECTION_HEADING, 'coordinator', errors);

  const routingRows = parseRouting(routing, activeNames, errors);
  validateCapabilities(coordinator, active, routingRows, errors);

  const outputReferences = [
    ...extractLocalReferences(team).map((reference) => ['team', reference]),
    ...extractLocalReferences(coordinator).map((reference) => ['coordinator', reference]),
  ];
  for (const [source, reference] of outputReferences) {
    for (const [kind, pattern] of FORBIDDEN_REFERENCE_PATTERNS) {
      if (pattern.test(reference)) {
        errors.push(`${source}: forbidden ${kind} reference ${reference}`);
      }
    }
    if (!expectedPayload.has(reference)) {
      errors.push(`${source}: local reference is absent from the explicit final payload: ${reference}`);
      continue;
    }
    const status = exactPathStatus(root, reference);
    if (!status.exists || !status.file) {
      errors.push(`${source}: local reference is absent with exact Linux casing: ${reference}`);
    }
  }

  for (const [source, markdown] of [['team', team], ['coordinator', coordinator]]) {
    for (const match of markdown.matchAll(BARE_INTERNAL_PATH_PATTERN)) {
      errors.push(`${source}: forbidden internal source reference ${match[1]}`);
    }
    const validLabels = new Set(
      active.flatMap(({ id, name }) => [
        id.toLowerCase(),
        name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      ]),
    );
    const visibleMarkdown = markdown.replace(/<!--[\s\S]*?-->/g, '');
    for (const match of visibleMarkdown.matchAll(/\bsquad:([a-z][a-z0-9_-]*)\b/gi)) {
      if (!validLabels.has(match[1].toLowerCase())) {
        errors.push(`${source}: fictional or inactive sample label squad:${match[1]} is forbidden`);
      }
    }
  }

  return [...new Set(errors)].sort();
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Cast validation failed:\n- ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const errors = validateCastTree(options);
  if (errors.length > 0) {
    console.error(`Cast validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log('Cast validation passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
