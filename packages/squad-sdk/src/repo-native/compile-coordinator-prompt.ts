/**
 * Coordinator prompt compiler — transforms the export context IR
 * into a coordinator prompt markdown string within character budget.
 *
 * v007: Character-based budgeting, self-containment enforcement,
 * intelligent decision distillation, and "Export IS the Product" philosophy.
 */

import type {
  SquadExportContext,
  CompileCoordinatorPromptOptions,
  CompiledCoordinatorPrompt,
  SquadMemberSummary,
} from './types.js';
import { distillDecisions } from './distill-decisions.js';

const LAZY_LOAD_MEMBER_THRESHOLD = 8;
const LAZY_LOAD_ROSTER_TOKEN_THRESHOLD = 3000;

/**
 * Default CCA limits. These are overridable via CompileCoordinatorPromptOptions
 * to support future increases beyond 30K.
 */
const DEFAULT_CCA_CHAR_HARD_LIMIT = 30_000;
const DEFAULT_CCA_CHAR_TARGET = 29_000;

/**
 * Approximate token count using char/4 heuristic.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function measureSections(markdown: string): Array<{ name: string; tokens: number }> {
  const sections: Array<{ name: string; tokens: number }> = [];
  const parts = markdown.split(/^## /m);

  // First part is preamble (identity/comments)
  if (parts[0]) {
    sections.push({ name: 'preamble', tokens: estimateTokens(parts[0]) });
  }

  for (const part of parts.slice(1)) {
    const nameMatch = part.match(/^(.+)\n/);
    const name = nameMatch?.[1]?.trim() ?? 'unknown';
    sections.push({ name, tokens: estimateTokens(part) });
  }

  return sections;
}

/**
 * Strip content that wastes characters or violates self-containment.
 * - Image placeholders (e.g., [📷 copilot-image-abc123.png])
 * - External file references CCA cannot access
 * - Archive references
 * - Blank lines left behind after stripping
 */
function sanitizeExportContent(text: string): string {
  return text
    .replace(/\[📷[^\]]*\]/g, '')
    .replace(/!\[copilot-image[^\]]*\]\([^)]*\)/g, '')
    // Strip archive/external file references (self-containment)
    .replace(/\*\*\[.*?archived in .*?\]\*\*/g, '')
    .replace(/\[.*?decisions-archive.*?\]/g, '')
    .replace(/See `\.squad\/.*?`/g, '')
    .replace(/\(see .*?\.md\)/gi, '')
    .replace(/Refer to `.*?\.md`/gi, '')
    .replace(/documented in `.*?`/gi, '')
    .replace(/\n{3,}/g, '\n\n');
}

function renderRosterFull(members: SquadMemberSummary[]): string {
  return members.map(m => {
    const summary = m.charterSummary ? ` ${m.charterSummary}` : '';
    return `- **${m.displayName}** (\`${m.slug}\`) — ${m.role}.${summary ? ` Use for${summary.startsWith(' ') ? summary : ' ' + summary}.` : ''}`;
  }).join('\n');
}

function renderRosterCompact(members: SquadMemberSummary[]): string {
  return members.map(m =>
    `- **${m.displayName}** (\`${m.slug}\`) — ${m.role}.`
  ).join('\n');
}

function renderRosterLazyLoad(members: SquadMemberSummary[]): string {
  const roster = members.map(m =>
    `- **${m.displayName}** (\`${m.slug}\`) — ${m.role}. Charter: \`${m.charterPath}\``
  ).join('\n');

  return roster + '\n\n> **Note:** Before dispatching any specialist, read their charter file for detailed scope and boundaries.';
}

/**
 * Resolve a routeTo value against team members. Matches by slug or displayName,
 * returning the member's slug. Falls back to slugifying the raw value.
 */
function resolveRouteTarget(routeTo: string, members: SquadMemberSummary[]): string {
  const normalized = routeTo.trim().toLowerCase();
  const bySlug = members.find(m => m.slug === normalized);
  if (bySlug) return bySlug.slug;
  const byName = members.find(m => m.displayName.toLowerCase() === normalized);
  if (byName) return byName.slug;
  // Fallback: slugify the routeTo value using the same logic as member slug generation
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function renderDispatchRules(context: SquadExportContext): string {
  const lines: string[] = [];
  const rules = context.routing.rules;

  // v008: Distill dispatch rules for large rule sets
  // If >20 rules, group by target to reduce repetition
  if (rules.length > 20) {
    const grouped = new Map<string, string[]>();
    for (const rule of rules) {
      const target = resolveRouteTarget(rule.routeTo, context.team.members);
      if (!grouped.has(target)) grouped.set(target, []);
      grouped.get(target)!.push(rule.workType.toLowerCase());
    }
    for (const [target, workTypes] of grouped) {
      if (workTypes.length === 1) {
        lines.push(`- If the request is mainly about ${workTypes[0]}, route to \`${target}\`.`);
      } else {
        lines.push(`- Route to \`${target}\` for: ${workTypes.join(', ')}.`);
      }
    }
  } else {
    for (const rule of rules) {
      const target = resolveRouteTarget(rule.routeTo, context.team.members);
      lines.push(`- If the request is mainly about ${rule.workType.toLowerCase()}, route to \`${target}\`.`);
    }
  }

  if (context.routing.fallback) {
    lines.push(`- For ambiguous or multi-domain requests, ${context.routing.fallback}.`);
  } else if (context.team.members.length > 0) {
    // Default fallback to first member (typically the lead)
    const lead = context.team.members[0]!;
    lines.push(`- If the request is multi-domain, ambiguous, or strategic, route through \`${lead.slug}\` first.`);
  }

  // Add principles as dispatch hints (limit to top 5 for budget)
  const principles = context.routing.principles.slice(0, 5);
  for (const principle of principles) {
    lines.push(`- ${principle}`);
  }

  return lines.join('\n');
}

function renderCeremonies(context: SquadExportContext): string {
  if (context.ceremonies.length === 0) return '';

  const lines = context.ceremonies.map(c => {
    let desc = `- **${c.name}** — trigger ${c.trigger.toLowerCase().startsWith('when') ? '' : 'when '}${c.trigger.toLowerCase()}.`;
    return desc;
  });

  return lines.join('\n');
}

function renderDispatchProtocol(context: SquadExportContext): string {
  return context.dispatch.protocol
    .map((step, i) => `${i + 1}. ${step}`)
    .join('\n');
}

function renderFullPrompt(context: SquadExportContext): string {
  const sections: string[] = [];

  // Provenance marker (used by CLI for collision detection — do not remove)
  sections.push([
    `<!-- generated by squad export: do not edit by hand -->`,
    '',
    `You are **Squad (Coordinator)** — the exported coordinator for this repository.`,
  ].join('\n'));

  // Mission
  sections.push([
    '## Mission',
    '',
    '- Represent the project\'s Squad roster inside Copilot custom-agent surfaces.',
    '- Coordinate specialists using the repository\'s `.squad/` configuration.',
    '- Preserve routing, ceremony triggers, and validation behavior during delegation.',
    '- Produce assembled results for the user after delegated work completes.',
  ].join('\n'));

  // Operating mode
  sections.push([
    '## Operating mode',
    '',
    '- You are a **dispatcher first**.',
    '- Prefer specialist delegation over doing domain work inline.',
    '- Use direct answers only for trivial factual questions that do not benefit from dispatch.',
    '- Launch parallel work when tasks are independent.',
    '- Preserve validation and fact-check gates for recommendations and externally visible documents.',
  ].join('\n'));

  // Team roster
  const rosterContent = renderRosterFull(context.team.members);
  sections.push([
    '## Team roster',
    '',
    rosterContent,
  ].join('\n'));

  // Dispatch rules
  const dispatchRules = renderDispatchRules(context);
  if (dispatchRules) {
    sections.push([
      '## Dispatch rules',
      '',
      dispatchRules,
    ].join('\n'));
  }

  // Ceremony triggers
  const ceremonies = renderCeremonies(context);
  if (ceremonies) {
    sections.push([
      '## Ceremony triggers',
      '',
      ceremonies,
    ].join('\n'));
  }

  // Decisions snapshot — distilled for self-containment and budget
  if (context.decisions) {
    // Calculate remaining budget for decisions
    // (We'll refine this in the compile pass, but give distiller a generous initial budget)
    const decisionsDistilled = distillDecisions(context.decisions, {
      charBudget: 8000, // Initial generous budget; compile pass will tighten if needed
    });
    sections.push([
      '## Decisions',
      '',
      decisionsDistilled.markdown,
    ].join('\n'));
  }

  // Dispatch protocol
  sections.push([
    '## Dispatch protocol',
    '',
    'When delegating:',
    '',
    renderDispatchProtocol(context),
  ].join('\n'));

  // Output rules
  sections.push([
    '## Output rules',
    '',
    '- Acknowledge work in human terms before launching specialists.',
    '- Say who is working on what.',
    '- Preserve fact-check and review gates when the task includes recommendations or externally visible artifacts.',
    '- Present final answers as assembled outcomes, not raw delegated fragments.',
  ].join('\n'));

  return sections.join('\n\n');
}

function renderCompactPrompt(context: SquadExportContext): string {
  // Same structure but with compact roster
  const sections: string[] = [];

  sections.push([
    `<!-- generated by squad export: do not edit by hand -->`,
    '',
    `You are **Squad (Coordinator)** — the exported coordinator for this repository.`,
  ].join('\n'));

  sections.push([
    '## Mission',
    '',
    '- Coordinate specialists using the repository\'s `.squad/` configuration.',
    '- Route work to the right specialist. Preserve ceremonies and reviewer gates.',
  ].join('\n'));

  sections.push([
    '## Operating mode',
    '',
    '- Dispatcher first. Prefer delegation over inline work.',
    '- Launch parallel work when tasks are independent.',
  ].join('\n'));

  const rosterContent = renderRosterCompact(context.team.members);
  sections.push([
    '## Team roster',
    '',
    rosterContent,
  ].join('\n'));

  const dispatchRules = renderDispatchRules(context);
  if (dispatchRules) {
    sections.push(['## Dispatch rules', '', dispatchRules].join('\n'));
  }

  const ceremonies = renderCeremonies(context);
  if (ceremonies) {
    sections.push(['## Ceremony triggers', '', ceremonies].join('\n'));
  }

  if (context.decisions) {
    const decisionsDistilled = distillDecisions(context.decisions, {
      charBudget: 5000, // Tighter budget in compact mode
    });
    sections.push(['## Decisions', '', decisionsDistilled.markdown].join('\n'));
  }

  sections.push([
    '## Dispatch protocol',
    '',
    'When delegating:',
    '',
    renderDispatchProtocol(context),
  ].join('\n'));

  sections.push([
    '## Output rules',
    '',
    '- Acknowledge work before dispatching. Say who is working on what.',
    '- Preserve review gates. Present final assembled outcomes.',
  ].join('\n'));

  return sections.join('\n\n');
}

function renderLazyLoadPrompt(context: SquadExportContext): string {
  const sections: string[] = [];

  sections.push([
    `<!-- generated by squad export: do not edit by hand -->`,
    '',
    `You are **Squad (Coordinator)** — the exported coordinator for this repository.`,
  ].join('\n'));

  sections.push([
    '## Mission',
    '',
    '- Coordinate specialists using the repository\'s `.squad/` configuration.',
    '- Route work to the right specialist. Preserve ceremonies and reviewer gates.',
  ].join('\n'));

  sections.push([
    '## Operating mode',
    '',
    '- Dispatcher first. Prefer delegation over inline work.',
    '- Before dispatching, read the target agent\'s charter from `.squad/agents/<slug>/charter.md`.',
    '- Launch parallel work when tasks are independent.',
  ].join('\n'));

  const rosterContent = renderRosterLazyLoad(context.team.members);
  sections.push(['## Team roster', '', rosterContent].join('\n'));

  const dispatchRules = renderDispatchRules(context);
  if (dispatchRules) {
    sections.push(['## Dispatch rules', '', dispatchRules].join('\n'));
  }

  const ceremonies = renderCeremonies(context);
  if (ceremonies) {
    sections.push(['## Ceremony triggers', '', ceremonies].join('\n'));
  }

  if (context.decisions) {
    const decisionsDistilled = distillDecisions(context.decisions, {
      charBudget: 4000, // Tightest budget in lazy-load mode
    });
    sections.push(['## Decisions', '', decisionsDistilled.markdown].join('\n'));
  }

  sections.push([
    '## Dispatch protocol',
    '',
    'When delegating:',
    '',
    '1. Read the target agent\'s charter file for scope and boundaries.',
    '2. Pass the user\'s goal, repository context, and relevant findings.',
    '3. Ask for concrete deliverables.',
    '4. Launch independent work in parallel.',
    '5. Synthesize the returned work into one response for the user.',
  ].join('\n'));

  sections.push([
    '## Output rules',
    '',
    '- Acknowledge work before dispatching. Say who is working on what.',
    '- Preserve review gates. Present final assembled outcomes.',
  ].join('\n'));

  return sections.join('\n\n');
}

function shouldUseLazyLoad(context: SquadExportContext): boolean {
  if (context.team.members.length > LAZY_LOAD_MEMBER_THRESHOLD) return true;
  const rosterText = renderRosterFull(context.team.members);
  return estimateTokens(rosterText) > LAZY_LOAD_ROSTER_TOKEN_THRESHOLD;
}

function buildBudgetFailureMessage(
  charCount: number,
  hardLimit: number,
  sections: Array<{ name: string; tokens: number }>,
  appliedCompactions: string[],
): string {
  const top5 = [...sections].sort((a, b) => b.tokens - a.tokens).slice(0, 5);
  const topList = top5.map(s => `  - ${s.name}: ~${s.tokens * 4} chars`).join('\n');
  const compactList = appliedCompactions.length > 0
    ? `Compaction passes applied: ${appliedCompactions.join(', ')}`
    : 'No compaction passes applied.';

  return [
    `Export aborted: generated coordinator prompt is ${charCount} chars (hard cap: ${hardLimit}).`,
    `Largest sections:`,
    topList,
    compactList,
    `Try: --compact, --skills none, or split this team into multiple exported coordinators.`,
  ].join('\n');
}

/**
 * Compile the coordinator prompt from export context.
 *
 * v007 strategy: "Greedy fill, then smart shrink"
 * 1. Render full prompt with distilled decisions
 * 2. If over char budget, progressively compact (compact mode → lazy-load → tighter decisions)
 * 3. Sanitize for self-containment (strip external refs)
 * 4. Final character validation — hard fail if still over
 *
 * Budget is CHARACTER-based (CCA limit = 30,000 chars), not token-based.
 */
export function compileCoordinatorPrompt(
  context: SquadExportContext,
  options: CompileCoordinatorPromptOptions,
): CompiledCoordinatorPrompt {
  const appliedCompactions: string[] = [];
  let draft: string;

  // Use character limit: prefer configurable options, fall back to defaults
  const charTarget = options.charTarget ?? Math.min(options.softLimit * 4, DEFAULT_CCA_CHAR_TARGET);
  const charHardLimit = options.charHardLimit ?? Math.min(options.hardLimit * 4, DEFAULT_CCA_CHAR_HARD_LIMIT);

  if (options.compact) {
    draft = renderCompactPrompt(context);
    appliedCompactions.push('forced-compact');
  } else {
    draft = renderFullPrompt(context);
  }

  // Sanitize early for accurate measurement
  draft = sanitizeExportContent(draft);
  let charCount = draft.length;

  // Compaction pass 1: switch to compact mode
  if (charCount > charTarget && !options.compact) {
    draft = sanitizeExportContent(renderCompactPrompt(context));
    appliedCompactions.push('compact-charters');
    charCount = draft.length;
  }

  // Compaction pass 2: lazy-load mode for large teams
  if (charCount > charTarget && shouldUseLazyLoad(context)) {
    draft = sanitizeExportContent(renderLazyLoadPrompt(context));
    appliedCompactions.push('lazy-load-roster');
    charCount = draft.length;
  }

  // Compaction pass 3: re-distill decisions with tighter budget
  if (charCount > charTarget && context.decisions) {
    const overage = charCount - charTarget;
    // Find the decisions section and measure it
    const decisionsMatch = draft.match(/## Decisions\n\n([\s\S]*?)(?=\n## |\n*$)/);
    if (decisionsMatch?.[1]) {
      const currentDecisionsLen = decisionsMatch[1].length;
      const newBudget = Math.max(1000, currentDecisionsLen - overage - 500);

      const tighterDistill = distillDecisions(context.decisions, {
        charBudget: newBudget,
      });

      draft = draft.replace(decisionsMatch[1], tighterDistill.markdown);
      appliedCompactions.push(`decisions-retightened(${newBudget})`);
      charCount = draft.length;
    }
  }

  // Compaction pass 4: if STILL over, aggressively trim decisions to minimum
  if (charCount > charTarget && context.decisions) {
    const decisionsMatch = draft.match(/## Decisions\n\n([\s\S]*?)(?=\n## |\n*$)/);
    if (decisionsMatch?.[1]) {
      const minDistill = distillDecisions(context.decisions, {
        charBudget: 800,
      });
      draft = draft.replace(decisionsMatch[1], minDistill.markdown);
      appliedCompactions.push('decisions-minimized');
      charCount = draft.length;
    }
  }

  // Compaction pass 5: nuclear option — drop decisions entirely
  if (charCount > charHardLimit) {
    draft = draft.replace(/## Decisions\n\n[\s\S]*?(?=\n## |\n*$)/, '');
    appliedCompactions.push('decisions-dropped');
    charCount = draft.length;
  }

  // Hard fail — even without decisions we're over
  if (charCount > charHardLimit) {
    const sections = measureSections(draft);
    throw new Error(buildBudgetFailureMessage(charCount, charHardLimit, sections, appliedCompactions));
  }

  const estimate = estimateTokens(draft);
  const mode = appliedCompactions.includes('lazy-load-roster')
    ? 'lazy-load' as const
    : appliedCompactions.includes('compact-charters') || appliedCompactions.includes('forced-compact')
      ? 'compact' as const
      : 'full' as const;

  return {
    markdown: draft,
    estimatedTokens: estimate,
    charCount,
    appliedCompactions,
    sectionSizes: measureSections(draft),
    mode,
  };
}
