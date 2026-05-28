/**
 * v007 — Intelligent decision distillation for export.
 *
 * Transforms verbose, chronological .squad/decisions.md content into
 * a compact, priority-driven, self-contained representation optimized
 * for CCA consumption within tight character budgets.
 *
 * Design principles:
 * - Storage format ≠ delivery format
 * - Non-chronological: grouped by concern, not date
 * - Priority-driven: mission-critical > nice-to-have
 * - Self-contained: NO external file references
 * - CCA already has the code — don't repeat what's obvious from source
 */

export interface ExportDecision {
  title: string;
  what: string;
  why?: string;
  category: DecisionCategory;
  priority: number; // 1 = highest
}

export type DecisionCategory =
  | 'mission'
  | 'architecture'
  | 'workflow'
  | 'quality'
  | 'deployment'
  | 'naming'
  | 'directive'
  | 'operational';

export interface DistillOptions {
  /** Maximum characters allowed for the decisions section */
  charBudget: number;
  /** If true, attempt LLM distillation (requires SquadClient) */
  useLlm?: boolean;
}

export interface DistillResult {
  /** The distilled decisions markdown */
  markdown: string;
  /** Character count of the output */
  charCount: number;
  /** How many source decisions were processed */
  sourceCount: number;
  /** How many decisions made it into output */
  retainedCount: number;
  /** Compression ratio (output/input) */
  ratio: number;
}

// Patterns that reference external files CCA can't access
const EXTERNAL_REF_PATTERNS = [
  /\*\*\[.*?archived in .*?\]\*\*/g,
  /\[.*?decisions-archive.*?\]/g,
  /See `\.squad\/.*?`/g,
  /\(see .*?\.md\)/gi,
  /Refer to `.*?\.md`/gi,
  /documented in `.*?`/gi,
];

// File path patterns that describe implementation changes (CCA can see the code)
const IMPL_DETAIL_PATTERNS = [
  /^\s*[-*]\s*(?:Created|Updated|Renamed|Added to|Moved|Deleted):?\s*$/m,
  /^\s*[-*]\s*`\.squad\/.*?`.*$/gm,
  /^\s*[-*]\s*`\.copilot\/.*?`.*$/gm,
  /^\s*[-*]\s*`\.github\/.*?`.*$/gm,
  /^\s*\d+\.\s*`\.squad\/.*$/gm,
];

/**
 * Parse raw decisions.md into individual decision entries.
 */
export function parseExportDecisions(raw: string): ExportDecision[] {
  const decisions: ExportDecision[] = [];

  // Split on ### headings (individual decisions)
  const sections = raw.split(/^### /m).slice(1);

  for (const section of sections) {
    const lines = section.split('\n');
    const titleLine = lines[0]?.trim() || '';

    // Extract the what/why fields
    let what = '';
    let why = '';

    for (const line of lines.slice(1)) {
      const whatMatch = line.match(/^\*\*What:\*\*\s*(.+)/);
      const whyMatch = line.match(/^\*\*Why:\*\*\s*(.+)/);
      const decisionMatch = line.match(/^\*\*Decision:\*\*\s*(.+)/);

      if (whatMatch?.[1]) what = whatMatch[1].trim();
      if (decisionMatch?.[1]) what = what || decisionMatch[1].trim();
      if (whyMatch?.[1]) why = whyMatch[1].trim();
    }

    // If no explicit What field, grab the first substantive paragraph
    if (!what) {
      // Filter out metadata lines and find prose content
      const metaPatterns = /^\*\*(By|Author|Requested|Scope|Date|Status|Timestamp|Changes Applied|Patterns Ported|Implemented Architecture|Rationale|Consequences|Key Points):/i;
      const bodyLines = lines.slice(1)
        .filter(l => {
          const trimmed = l.trim();
          if (!trimmed) return false;
          if (metaPatterns.test(trimmed)) return false;
          if (trimmed.startsWith('---')) return false;
          if (trimmed.startsWith('- `') || trimmed.startsWith('- `.squad')) return false;
          return true;
        })
        .slice(0, 3);

      // Look for **Decision:** in body
      const decisionSection = section.match(/\*\*Decision:\*\*\s*([\s\S]*?)(?=\n\*\*(?:Rationale|Consequences|Changes)|\n###|$)/);
      if (decisionSection?.[1]) {
        what = decisionSection[1].trim().split('\n').slice(0, 3).join(' ').trim();
      } else {
        what = bodyLines.join(' ').replace(/\*\*/g, '').trim();
      }
    }

    if (!what) continue;

    const category = categorize(titleLine, what);
    const priority = scorePriority(category, titleLine, what);

    decisions.push({ title: titleLine, what, why, category, priority });
  }

  return decisions;
}

/**
 * Categorize a decision by its domain.
 */
function categorize(title: string, what: string): DecisionCategory {
  const text = `${title} ${what}`.toLowerCase();

  if (text.includes('mission') || text.includes('foundational') || text.includes('purpose'))
    return 'mission';
  if (text.includes('architecture') || text.includes('deployment') || text.includes('infra') || text.includes('bicep') || text.includes('terraform'))
    return 'architecture';
  if (text.includes('deploy') || text.includes('azd') || text.includes('container app') || text.includes('aca'))
    return 'deployment';
  if (text.includes('workflow') || text.includes('assess') || text.includes('plan') || text.includes('implement') || text.includes('phase'))
    return 'workflow';
  if (text.includes('quality') || text.includes('review') || text.includes('gate') || text.includes('metric'))
    return 'quality';
  if (text.includes('naming') || text.includes('rename') || text.includes('prefix'))
    return 'naming';
  if (text.includes('directive') || title.includes('User directive'))
    return 'directive';

  return 'operational';
}

/**
 * Score priority (lower = more important).
 */
function scorePriority(category: DecisionCategory, title: string, what: string): number {
  const base: Record<DecisionCategory, number> = {
    mission: 1,
    architecture: 2,
    deployment: 3,
    workflow: 3,
    quality: 4,
    directive: 4,
    naming: 6,
    operational: 7,
  };

  let score = base[category];

  // Boost for explicit strategic language
  const text = `${title} ${what}`.toLowerCase();
  if (text.includes('non-negotiable') || text.includes('must') || text.includes('always'))
    score -= 0.5;
  if (text.includes('foundational') || text.includes('core'))
    score -= 0.5;

  return score;
}

/**
 * Strip external file references and implementation details.
 */
function stripNonSelfContainedContent(text: string): string {
  let result = text;

  // Remove external file references
  for (const pattern of EXTERNAL_REF_PATTERNS) {
    result = result.replace(pattern, '');
  }

  // Remove implementation detail lines (file changes CCA can see in code)
  for (const pattern of IMPL_DETAIL_PATTERNS) {
    result = result.replace(pattern, '');
  }

  // Clean up empty list sections
  result = result.replace(/\*\*Changes Applied:\*\*\s*\n(\s*\n)+/g, '');
  result = result.replace(/\*\*Patterns Ported:\*\*\s*\n(\s*\n)+/g, '');
  result = result.replace(/\*\*Implemented Architecture:\*\*\s*\n(\s*\n)+/g, '');

  // Collapse multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/**
 * Merge overlapping decisions in the same category into consolidated entries.
 */
function mergeOverlapping(decisions: ExportDecision[]): ExportDecision[] {
  const grouped = new Map<DecisionCategory, ExportDecision[]>();
  for (const d of decisions) {
    const arr = grouped.get(d.category) || [];
    arr.push(d);
    grouped.set(d.category, arr);
  }

  const merged: ExportDecision[] = [];
  for (const [category, group] of grouped) {
    if (group.length <= 2) {
      merged.push(...group);
      continue;
    }

    // For larger groups, keep the highest-priority ones and merge the rest
    const sorted = [...group].sort((a, b) => a.priority - b.priority);
    const keep = sorted.slice(0, 2);
    const rest = sorted.slice(2);

    merged.push(...keep);

    // Merge remaining into a summary entry
    if (rest.length > 0) {
      const summaryPoints = rest.map(d => extractCoreSentence(d.what));
      const consolidatedWhat = summaryPoints.join('. ');
      merged.push({
        title: `Additional ${category} decisions`,
        what: consolidatedWhat,
        category,
        priority: Math.max(...rest.map(d => d.priority)),
      });
    }
  }

  return merged;
}

/**
 * Extract the core actionable sentence from a decision's what field.
 */
function extractCoreSentence(what: string): string {
  // Take first sentence, cap at 150 chars
  const firstSentence = what.split(/\.\s/)[0] || what;
  if (firstSentence.length <= 150) return firstSentence;
  return firstSentence.slice(0, 147) + '...';
}

/**
 * Render decisions in compact indexed format, grouped by concern.
 */
function renderCompactIndex(decisions: ExportDecision[]): string {
  const grouped = new Map<DecisionCategory, ExportDecision[]>();
  for (const d of decisions) {
    const arr = grouped.get(d.category) || [];
    arr.push(d);
    grouped.set(d.category, arr);
  }

  // Render order: mission → architecture → deployment → workflow → quality → directive → naming → operational
  const order: DecisionCategory[] = ['mission', 'architecture', 'deployment', 'workflow', 'quality', 'directive', 'naming', 'operational'];
  const categoryLabels: Record<DecisionCategory, string> = {
    mission: 'Mission & Strategy',
    architecture: 'Architecture',
    deployment: 'Deployment',
    workflow: 'Workflow & Process',
    quality: 'Quality & Review',
    directive: 'Team Directives',
    naming: 'Naming & Identity',
    operational: 'Operational',
  };

  const sections: string[] = [];
  for (const cat of order) {
    const entries = grouped.get(cat);
    if (!entries?.length) continue;

    const sorted = [...entries].sort((a, b) => a.priority - b.priority);
    const lines = sorted.map(d => {
      const core = extractCoreSentence(d.what);
      return `- ${core}`;
    });

    sections.push(`**${categoryLabels[cat]}**\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Distill decisions to fit within a character budget.
 *
 * Strategy: parse → categorize → prioritize → merge → render compact → trim by priority
 * Runs iteratively, dropping lowest-priority content until under budget.
 */
export function distillDecisions(raw: string, options: DistillOptions): DistillResult {
  const { charBudget } = options;

  // Strip external references first (always)
  const cleaned = stripNonSelfContainedContent(raw);

  // If raw content already fits, just use cleaned version
  if (cleaned.length <= charBudget) {
    return {
      markdown: cleaned,
      charCount: cleaned.length,
      sourceCount: parseExportDecisions(raw).length,
      retainedCount: parseExportDecisions(raw).length,
      ratio: cleaned.length / raw.length,
    };
  }

  // Parse into structured decisions
  const parsed = parseExportDecisions(raw);
  if (parsed.length === 0) {
    // Fallback: just truncate
    const truncated = cleaned.slice(0, charBudget);
    return {
      markdown: truncated,
      charCount: truncated.length,
      sourceCount: 0,
      retainedCount: 0,
      ratio: truncated.length / raw.length,
    };
  }

  // Merge overlapping decisions
  let working = mergeOverlapping(parsed);

  // Sort by priority (ascending = most important first)
  working.sort((a, b) => a.priority - b.priority);

  // Iteratively render and trim until under budget
  let rendered = renderCompactIndex(working);
  let iterations = 0;

  while (rendered.length > charBudget && working.length > 1 && iterations < 20) {
    // Drop the lowest-priority entry
    working.pop();
    rendered = renderCompactIndex(working);
    iterations++;
  }

  // Final safety: hard truncate if still over (shouldn't happen)
  if (rendered.length > charBudget) {
    rendered = rendered.slice(0, charBudget - 3) + '...';
  }

  return {
    markdown: rendered,
    charCount: rendered.length,
    sourceCount: parsed.length,
    retainedCount: working.length,
    ratio: rendered.length / raw.length,
  };
}

/**
 * LLM-powered distillation prompt.
 * Used when algorithmic distillation still can't fit or when quality
 * can be significantly improved by semantic understanding.
 */
export function buildDistillationPrompt(decisionsRaw: string, charBudget: number): string {
  return `You are a technical writer compressing a squad's decisions for an AI coding agent.

CONSTRAINTS:
- Output MUST be ≤ ${charBudget} characters total
- Output MUST be completely self-contained — NO references to external files
- Output MUST NOT reference .squad/, decisions-archive.md, or any file paths the agent can't read
- Group by concern (not chronologically)
- Prioritize: mission-critical > architectural > workflow > cosmetic
- Use bullet points, not prose paragraphs
- Strip timestamps, "By:" fields, implementation file lists
- The AI agent already HAS the source code — don't repeat what's obvious from reading it
- Merge overlapping decisions into single consolidated points
- Every bullet must be actionable guidance, not historical record

FORMAT:
**[Category Name]**
- [Concise actionable directive]
- [Another directive]

**[Next Category]**
- ...

SOURCE DECISIONS:
${decisionsRaw}

Distill these into the most useful, compact, self-contained guidance possible within ${charBudget} characters.`;
}
