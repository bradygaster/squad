/**
 * Export context loader — reads .squad/ state into a typed IR
 * for coordinator prompt compilation.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  SquadExportContext,
  LoadExportContextOptions,
  TeamMeta,
  SquadMemberSummary,
  RoutingMeta,
  RoutingRuleSummary,
  CeremonySummary,
  CoordinatorMeta,
  MemoryBootstrapPlan,
  DispatchPlan,
} from './types.js';

const BASELINE_SKILLS = [
  'squad-conventions',
  'agent-collaboration',
  'reviewer-protocol',
  'test-discipline',
  'secret-handling',
  'session-recovery',
  'git-workflow',
];

function readIfExists(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

function readJsonIfExists(filePath: string): Record<string, unknown> | undefined {
  const raw = readIfExists(filePath);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function listDirNames(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }
}

function listSkillNames(skillsDir: string): string[] {
  return listDirNames(skillsDir);
}

/**
 * Parse team.md into team metadata.
 * Expects a table under ## Members with columns: Name | Role | Charter | Status
 */
function parseTeamMd(content: string | undefined): Omit<TeamMeta, 'members'> & { memberRows: Array<{ name: string; role: string; charterPath: string }> } {
  const result: { name: string; mission?: string; user?: string; memberRows: Array<{ name: string; role: string; charterPath: string }> } = {
    name: 'Squad',
    memberRows: [],
  };

  if (!content) return result;

  // Extract squad name from H1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match?.[1]) result.name = h1Match[1].trim();

  // Extract mission from blockquote or ## Project Context
  const bqMatch = content.match(/^>\s+(.+)$/m);
  if (bqMatch?.[1]) result.mission = bqMatch[1].trim();

  // Extract user from **User:** pattern
  const userMatch = content.match(/\*\*User:\*\*\s*(.+)/);
  if (userMatch?.[1]) result.user = userMatch[1].trim();

  // Parse members table
  const tableRegex = /\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g;
  let match: RegExpExecArray | null;
  let headerSkipped = false;
  let separatorSkipped = false;

  while ((match = tableRegex.exec(content)) !== null) {
    const col1 = match[1] ?? '';
    const col2 = match[2] ?? '';
    const col3 = match[3] ?? '';
    // Skip header row
    if (!headerSkipped && /name/i.test(col1)) {
      headerSkipped = true;
      continue;
    }
    // Skip separator row
    if (!separatorSkipped && /^[-:]+$/.test(col1.trim())) {
      separatorSkipped = true;
      continue;
    }
    if (/^[-:]+$/.test(col1.trim())) continue;

    // v008: Filter out non-member rows (category headers, placeholders, empty)
    const name = col1.trim();
    const role = col2.trim();
    if (!name || !role) continue;
    // Skip rows where name/role are just dashes, "N/A", or markdown emphasis only
    if (/^[-—]+$/.test(name) || /^[-—]+$/.test(role)) continue;
    if (/^n\/?a$/i.test(name) || /^n\/?a$/i.test(role)) continue;
    // Skip if col1 looks like a category header (bold-only with no slug-worthy content)
    if (/^\*\*[^*]+\*\*$/.test(name) && (!col3.trim() || col3.trim() === '—' || col3.trim() === '-')) continue;

    result.memberRows.push({
      name,
      role,
      charterPath: col3.trim(),
    });
  }

  return result;
}

/**
 * Parse routing.md into routing metadata.
 */
function parseRoutingMd(content: string | undefined): RoutingMeta {
  const result: RoutingMeta = { rules: [], principles: [] };
  if (!content) return result;

  // Parse routing table
  const tableRegex = /\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g;
  let match: RegExpExecArray | null;
  let headerSkipped = false;
  let separatorSkipped = false;

  while ((match = tableRegex.exec(content)) !== null) {
    const col1 = match[1] ?? '';
    const col2 = match[2] ?? '';
    const col3 = match[3] ?? '';
    if (!headerSkipped && /work\s*type/i.test(col1)) {
      headerSkipped = true;
      continue;
    }
    if (!separatorSkipped && /^[-:]+$/.test(col1.trim())) {
      separatorSkipped = true;
      continue;
    }
    if (/^[-:]+$/.test(col1.trim())) continue;

    result.rules.push({
      workType: col1.trim(),
      routeTo: col2.trim(),
      examples: col3.trim() || undefined,
    });
  }

  // Parse numbered rules/principles
  const rulesSection = content.match(/## Rules\s*\n([\s\S]*?)(?=\n##|$)/);
  if (rulesSection?.[1]) {
    const lines = rulesSection[1].split('\n');
    for (const line of lines) {
      const ruleMatch = line.match(/^\d+\.\s+(.+)/);
      if (ruleMatch?.[1]) result.principles.push(ruleMatch[1].trim());
    }
  }

  return result;
}

/**
 * Parse ceremonies.md into ceremony summaries.
 */
function parseCeremoniesMd(content: string | undefined): CeremonySummary[] {
  if (!content) return [];
  const ceremonies: CeremonySummary[] = [];

  // Split by ## headings
  const sections = content.split(/^## /m).slice(1);
  for (const section of sections) {
    const lines = section.split('\n');
    const name = lines[0]?.trim() || '';
    if (!name) continue;

    const ceremony: CeremonySummary = { name, trigger: '' };

    for (const line of lines.slice(1)) {
      const triggerMatch = line.match(/[-*]\s*(?:\*\*)?Trigger(?:\*\*)?:\s*(.+)/i);
      const facilMatch = line.match(/[-*]\s*(?:\*\*)?Facilitator(?:\*\*)?:\s*(.+)/i);
      const partMatch = line.match(/[-*]\s*(?:\*\*)?Participants(?:\*\*)?:\s*(.+)/i);

      if (triggerMatch?.[1]) ceremony.trigger = triggerMatch[1].trim();
      if (facilMatch?.[1]) ceremony.facilitator = facilMatch[1].trim();
      if (partMatch?.[1]) ceremony.participants = partMatch[1].split(/[,+]/).map(p => p.trim());
    }

    if (ceremony.trigger) ceremonies.push(ceremony);
  }

  return ceremonies;
}

/**
 * Derive charter summary from charter.md content.
 */
function summarizeCharter(content: string | undefined): string {
  if (!content) return '';

  // Extract identity/role lines
  const lines: string[] = [];
  const roleMatch = content.match(/(?:##\s*(?:Role|Identity|What I Own))\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (roleMatch?.[1]) {
    const bullets = roleMatch[1].split('\n')
      .filter(l => l.match(/^[-*]\s+/))
      .slice(0, 4)
      .map(l => l.replace(/^[-*]\s+/, '').trim());
    lines.push(...bullets);
  }

  return lines.join('; ') || content.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() || '';
}

/**
 * Load export context from .squad/ state.
 */
export async function loadExportContext(
  root: string,
  squadRoot: string,
  options: LoadExportContextOptions,
): Promise<SquadExportContext> {
  const sourceFiles: string[] = [];

  // Read source files
  const teamMdPath = path.join(squadRoot, 'team.md');
  const routingMdPath = path.join(squadRoot, 'routing.md');
  const ceremoniesMdPath = path.join(squadRoot, 'ceremonies.md');
  const decisionsMdPath = path.join(squadRoot, 'decisions.md');
  const configJsonPath = path.join(squadRoot, 'config.json');

  const teamMd = readIfExists(teamMdPath);
  const routingMd = readIfExists(routingMdPath);
  const ceremoniesMd = readIfExists(ceremoniesMdPath);
  const decisionsMd = readIfExists(decisionsMdPath);
  const configJson = readJsonIfExists(configJsonPath);

  if (teamMd !== undefined) sourceFiles.push('.squad/team.md');
  if (routingMd !== undefined) sourceFiles.push('.squad/routing.md');
  if (ceremoniesMd !== undefined) sourceFiles.push('.squad/ceremonies.md');
  if (decisionsMd !== undefined) sourceFiles.push('.squad/decisions.md');
  if (configJson !== undefined) sourceFiles.push('.squad/config.json');

  // Parse team
  const teamParsed = parseTeamMd(teamMd);

  // Load member details
  const members: SquadMemberSummary[] = [];
  for (const row of teamParsed.memberRows) {
    const slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const charterPath = row.charterPath || `.squad/agents/${slug}/charter.md`;

    // Validate charter path stays within repo root (prevent path traversal)
    const charterFullPath = path.resolve(root, charterPath);
    const normalizedRoot = path.resolve(root);
    if (!charterFullPath.startsWith(normalizedRoot + path.sep) && charterFullPath !== normalizedRoot) {
      throw new Error(
        `Charter path "${charterPath}" resolves outside the repository root. ` +
        `Paths must be relative and stay within the repo.`
      );
    }
    const charterContent = readIfExists(charterFullPath);

    if (charterContent !== undefined) {
      sourceFiles.push(charterPath);
    }

    members.push({
      slug,
      displayName: row.name,
      role: row.role,
      charterPath,
      charterSummary: summarizeCharter(charterContent),
      inlineMode: 'full-summary',
    });
  }

  // Resolve skills
  const skillsDir = path.join(root, '.copilot', 'skills');
  const allSkillNames = listSkillNames(skillsDir);
  let resolvedSkills: string[];

  if (options.skillMode === 'none') {
    resolvedSkills = [];
  } else if (options.skillMode === 'all') {
    resolvedSkills = allSkillNames;
  } else if (Array.isArray(options.skillMode)) {
    resolvedSkills = options.skillMode;
  } else {
    // baseline: include only known coordination skills that actually exist
    resolvedSkills = BASELINE_SKILLS.filter(s => allSkillNames.includes(s));
  }

  // Resolve model
  const model = options.modelOverride
    || (configJson?.coordinator as Record<string, unknown>)?.model as string | undefined
    || undefined;

  // Derive description
  const description = options.descriptionOverride
    || teamParsed.mission
    || `Repository-native squad coordinator exported from .squad/`;

  const coordinator: CoordinatorMeta = {
    displayName: 'Squad',
    description,
    model,
    tools: '*',
    skills: resolvedSkills,
  };

  const team: TeamMeta = {
    name: teamParsed.name,
    mission: teamParsed.mission,
    user: teamParsed.user,
    members,
  };

  const routing = parseRoutingMd(routingMd);
  const ceremonies = parseCeremoniesMd(ceremoniesMd);

  const memoryBootstrap: MemoryBootstrapPlan = {
    steps: [
      'Read `.squad/team.md` for roster and mission.',
      'Read `.squad/routing.md` for routing rules.',
      'Read `.squad/ceremonies.md` for ceremony triggers.',
      'Read `.squad/decisions.md` only when repository conventions or prior decisions matter.',
      'Before dispatching a specialist, read that specialist\'s charter file from `.squad/agents/<slug>/charter.md` if detailed boundaries or tone matter.',
    ],
  };

  const dispatch: DispatchPlan = {
    protocol: [
      'Choose the smallest responsible set of specialists.',
      'Read the target charter(s) only when needed for higher-fidelity dispatch.',
      'Pass the user\'s goal, repository context, and relevant source findings.',
      'Ask each specialist for concrete deliverables.',
      'Launch independent work in parallel.',
      'Synthesize the returned work into one response for the user.',
    ],
  };

  return {
    repoRoot: root,
    squadRoot,
    outputPath: options.outputPath,
    generatedAt: options.generatedAt,
    coordinator,
    team,
    routing,
    ceremonies,
    decisions: decisionsMd,
    memoryBootstrap,
    dispatch,
    sourceFiles,
  };
}
