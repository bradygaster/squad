import { normalizeEol } from '../utils/normalize-eol.js';
import { slugify } from '../utils/slugify.js';

export { slugify } from '../utils/slugify.js';

/** Parsed routing rule from routing.md */
export interface RoutingRule {
  workType: string;
  agentName: string;
  keywords: string[]; // extracted from the Examples column
}

/** Parsed module ownership rule from routing.md */
export interface ModuleOwnership {
  modulePath: string;
  primary: string; // agent name
  secondary: string | null;
}

/** Team member from team.md roster */
export interface TeamMember {
  name: string;
  role: string;
  label: string; // squad:{lowercase name}
}

/** Triage decision result */
export interface TriageDecision {
  agent: TeamMember;
  reason: string;
  source: 'module-ownership' | 'routing-rule' | 'role-keyword' | 'lead-fallback';
  confidence: 'high' | 'medium' | 'low';
}

/** Issue data for triage */
export interface TriageIssue {
  number: number;
  title: string;
  body?: string;
  labels: string[];
}

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** Parse routing rules from routing.md content */
export function parseRoutingRules(routingMd: string): RoutingRule[] {
  const table = parseTableSection(
    routingMd,
    /^##\s*work\s*type\s*(?:→|->)\s*agent\b/i,
  );
  if (!table) return [];

  const workTypeIndex = findColumnIndex(table.headers, ['work type', 'type']);
  const agentIndex = findColumnIndex(table.headers, ['agent', 'route to', 'route']);
  const examplesIndex = findColumnIndex(table.headers, ['examples', 'example']);

  if (workTypeIndex < 0 || agentIndex < 0) return [];

  const rules: RoutingRule[] = [];
  for (const row of table.rows) {
    const workType = cleanCell(row[workTypeIndex] ?? '');
    const agentName = cleanCell(row[agentIndex] ?? '');
    const keywords = splitKeywords(examplesIndex >= 0 ? row[examplesIndex] : '');

    if (!workType || !agentName) continue;
    rules.push({ workType, agentName, keywords });
  }

  return rules;
}

/** Parse module ownership from routing.md content */
export function parseModuleOwnership(routingMd: string): ModuleOwnership[] {
  const table = parseTableSection(routingMd, /^##\s*module\s*ownership\b/i);
  if (!table) return [];

  const moduleIndex = findColumnIndex(table.headers, ['module', 'path']);
  const primaryIndex = findColumnIndex(table.headers, ['primary']);
  const secondaryIndex = findColumnIndex(table.headers, ['secondary']);

  if (moduleIndex < 0 || primaryIndex < 0) return [];

  const modules: ModuleOwnership[] = [];
  for (const row of table.rows) {
    const modulePath = normalizeModulePath(row[moduleIndex] ?? '');
    const primary = cleanCell(row[primaryIndex] ?? '');
    const secondaryRaw = cleanCell(secondaryIndex >= 0 ? row[secondaryIndex] ?? '' : '');
    const secondary = normalizeOptionalOwner(secondaryRaw);

    if (!modulePath || !primary) continue;
    modules.push({ modulePath, primary, secondary });
  }

  return modules;
}

/** Parse team roster from team.md content */
export function parseRoster(teamMd: string): TeamMember[] {
  const table =
    parseTableSection(teamMd, /^##\s*members\b/i) ??
    parseTableSection(teamMd, /^##\s*team\s*roster\b/i);

  if (!table) return [];

  const nameIndex = findColumnIndex(table.headers, ['name']);
  const roleIndex = findColumnIndex(table.headers, ['role']);
  if (nameIndex < 0 || roleIndex < 0) return [];

  const excluded = new Set(['scribe', 'ralph']);
  const members: TeamMember[] = [];

  for (const row of table.rows) {
    const name = cleanCell(row[nameIndex] ?? '');
    const role = cleanCell(row[roleIndex] ?? '');
    if (!name || !role) continue;
    if (excluded.has(name.toLowerCase())) continue;

    members.push({
      name,
      role,
      label: `squad:${slugify(name)}`,
    });
  }

  return members;
}

/**
 * Triage an issue using routing rules, module ownership, and roster.
 * Priority order:
 * 1. Module path match — issue mentions a file path matching module ownership
 * 2. Work type keyword — issue content matches routing rule keywords
 * 3. Role keyword — fallback to generic role-based matching (frontend/backend/test)
 * 4. Lead fallback — assign to Lead/Architect if no match
 */
export function triageIssue(
  issue: TriageIssue,
  rules: RoutingRule[],
  modules: ModuleOwnership[],
  roster: TeamMember[],
): TriageDecision | null {
  const issueText = `${issue.title}\n${issue.body ?? ''}`.toLowerCase();
  const normalizedIssueText = normalizeTextForPathMatch(issueText);

  const bestModule = findBestModuleMatch(normalizedIssueText, modules);
  if (bestModule) {
    const primaryMember = findMember(bestModule.primary, roster);
    if (primaryMember) {
      return {
        agent: primaryMember,
        reason: `Matched module path "${bestModule.modulePath}" to primary owner "${bestModule.primary}"`,
        source: 'module-ownership',
        confidence: 'high',
      };
    }

    if (bestModule.secondary) {
      const secondaryMember = findMember(bestModule.secondary, roster);
      if (secondaryMember) {
        return {
          agent: secondaryMember,
          reason: `Matched module path "${bestModule.modulePath}" to secondary owner "${bestModule.secondary}"`,
          source: 'module-ownership',
          confidence: 'medium',
        };
      }
    }
  }

  const bestRule = findBestRuleMatch(issueText, rules);
  if (bestRule) {
    const agent = findMember(bestRule.rule.agentName, roster);
    if (agent) {
      return {
        agent,
        reason: `Matched routing keyword(s): ${bestRule.matchedKeywords.join(', ')}`,
        source: 'routing-rule',
        confidence: bestRule.matchedKeywords.length >= 2 ? 'high' : 'medium',
      };
    }
  }

  const roleMatch = findRoleKeywordMatch(issueText, roster);
  if (roleMatch) {
    return {
      agent: roleMatch.agent,
      reason: roleMatch.reason,
      source: 'role-keyword',
      confidence: 'medium',
    };
  }

  const lead = findLeadFallback(roster);
  if (!lead) return null;

  return {
    agent: lead,
    reason: 'No module, routing, or role keyword match — routed to Lead/Architect',
    source: 'lead-fallback',
    confidence: 'low',
  };
}

function parseTableSection(markdown: string, sectionHeader: RegExp): ParsedTable | null {
  const lines = normalizeEol(markdown).split('\n');
  let inSection = false;
  const tableLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inSection && sectionHeader.test(trimmed)) {
      inSection = true;
      continue;
    }

    if (inSection && /^##\s+/.test(trimmed)) {
      break;
    }

    if (inSection && trimmed.startsWith('|')) {
      tableLines.push(trimmed);
    }
  }

  if (tableLines.length === 0) return null;

  let headers: string[] | null = null;
  const rows: string[][] = [];

  for (const line of tableLines) {
    const cells = parseTableLine(line);
    if (cells.length === 0) continue;
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;

    if (!headers) {
      headers = cells;
      continue;
    }

    rows.push(cells);
  }

  if (!headers) return null;
  return { headers, rows };
}

function parseTableLine(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalizedHeaders = headers.map((header) => cleanCell(header).toLowerCase());
  for (const candidate of candidates) {
    const index = normalizedHeaders.findIndex((header) => header.includes(candidate));
    if (index >= 0) return index;
  }
  return -1;
}

function cleanCell(value: string): string {
  return value
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function splitKeywords(examplesCell: string | undefined): string[] {
  if (!examplesCell) return [];
  return examplesCell
    .split(',')
    .map((keyword) => cleanCell(keyword))
    .filter((keyword) => keyword.length > 0);
}

function normalizeOptionalOwner(owner: string): string | null {
  if (!owner) return null;
  if (/^[-—–]+$/.test(owner)) return null;
  return owner;
}

function normalizeModulePath(modulePath: string): string {
  return cleanCell(modulePath).replace(/\\/g, '/').toLowerCase();
}

function normalizeTextForPathMatch(text: string): string {
  return text.replace(/\\/g, '/').replace(/`/g, '');
}

function normalizeName(value: string): string {
  return cleanCell(value)
    .toLowerCase()
    .replace(/[^\w@\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMember(target: string, roster: TeamMember[]): TeamMember | null {
  const normalizedTarget = normalizeName(target);
  if (!normalizedTarget) return null;

  for (const member of roster) {
    if (normalizeName(member.name) === normalizedTarget) return member;
  }

  for (const member of roster) {
    if (normalizeName(member.role) === normalizedTarget) return member;
  }

  for (const member of roster) {
    const memberName = normalizeName(member.name);
    if (normalizedTarget.includes(memberName) || memberName.includes(normalizedTarget)) {
      return member;
    }
  }

  for (const member of roster) {
    const memberRole = normalizeName(member.role);
    if (normalizedTarget.includes(memberRole) || memberRole.includes(normalizedTarget)) {
      return member;
    }
  }

  return null;
}

function findBestModuleMatch(issueText: string, modules: ModuleOwnership[]): ModuleOwnership | null {
  let best: ModuleOwnership | null = null;
  let bestLength = -1;

  for (const module of modules) {
    const modulePath = normalizeModulePath(module.modulePath);
    if (!modulePath) continue;
    if (!issueText.includes(modulePath)) continue;

    if (modulePath.length > bestLength) {
      best = module;
      bestLength = modulePath.length;
    }
  }

  return best;
}

function findBestRuleMatch(
  issueText: string,
  rules: RoutingRule[],
): { rule: RoutingRule; matchedKeywords: string[] } | null {
  let best: { rule: RoutingRule; matchedKeywords: string[] } | null = null;
  let bestScore = 0;

  for (const rule of rules) {
    const matchedKeywords = rule.keywords
      .map((keyword) => keyword.toLowerCase())
      .filter((keyword) => keyword.length > 0 && issueText.includes(keyword));

    if (matchedKeywords.length === 0) continue;

    const score =
      matchedKeywords.length * 100 + matchedKeywords.reduce((sum, keyword) => sum + keyword.length, 0);
    if (score > bestScore) {
      best = {
        rule,
        matchedKeywords,
      };
      bestScore = score;
    }
  }

  return best;
}

function findRoleKeywordMatch(
  issueText: string,
  roster: TeamMember[],
): { agent: TeamMember; reason: string } | null {
  for (const member of roster) {
    const role = member.role.toLowerCase();

    if (
      (role.includes('frontend') || role.includes('ui')) &&
      (issueText.includes('ui') || issueText.includes('frontend') || issueText.includes('css'))
    ) {
      return { agent: member, reason: 'Matched frontend/UI role keywords' };
    }

    if (
      (role.includes('backend') || role.includes('api') || role.includes('server')) &&
      (issueText.includes('api') || issueText.includes('backend') || issueText.includes('database'))
    ) {
      return { agent: member, reason: 'Matched backend/API role keywords' };
    }

    if (
      (role.includes('test') || role.includes('qa')) &&
      (issueText.includes('test') || issueText.includes('bug') || issueText.includes('fix'))
    ) {
      return { agent: member, reason: 'Matched testing/QA role keywords' };
    }
  }

  return null;
}

function findLeadFallback(roster: TeamMember[]): TeamMember | null {
  return (
    roster.find((member) => {
      const role = member.role.toLowerCase();
      return role.includes('lead') || role.includes('architect');
    }) ?? null
  );
}
