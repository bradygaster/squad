/**
 * Coordinator-as-Agent export types.
 * Typed intermediate representation (IR) for compiling .squad/ state
 * into a repository-native custom agent at .github/agents/squad.md.
 */

export interface SquadExportContext {
  repoRoot: string;
  squadRoot: string;
  outputPath: string;
  generatedAt: string;
  coordinator: CoordinatorMeta;
  team: TeamMeta;
  routing: RoutingMeta;
  ceremonies: CeremonySummary[];
  decisions?: string;
  memoryBootstrap: MemoryBootstrapPlan;
  dispatch: DispatchPlan;
  sourceFiles: string[];
}

export interface CoordinatorMeta {
  displayName: string;
  description: string;
  model?: string;
  tools: '*' | string[];
  skills: string[];
}

export interface TeamMeta {
  name: string;
  mission?: string;
  user?: string;
  members: SquadMemberSummary[];
}

export interface SquadMemberSummary {
  slug: string;
  displayName: string;
  role: string;
  charterPath: string;
  charterSummary: string;
  inlineMode: 'full-summary' | 'compact-summary' | 'name-role-only';
}

export interface RoutingMeta {
  rules: RoutingRuleSummary[];
  fallback?: string;
  principles: string[];
}

export interface RoutingRuleSummary {
  workType: string;
  routeTo: string;
  examples?: string;
}

export interface CeremonySummary {
  name: string;
  trigger: string;
  facilitator?: string;
  participants?: string[];
}

export interface MemoryBootstrapPlan {
  steps: string[];
}

export interface DispatchPlan {
  protocol: string[];
}

export interface CoordinatorExportOptions {
  outPath: string;
  model?: string;
  description?: string;
  skills: 'baseline' | 'all' | 'none' | string[];
  check: boolean;
  watch: boolean;
  dryRun: boolean;
  force: boolean;
  cleanLegacyAgent: boolean;
  maxPromptTokens: number;
  compact: boolean;
  /** Configurable character limit for the output (default: 30000) */
  charLimit: number;
}

export interface CompileCoordinatorPromptOptions {
  softLimit: number;
  hardLimit: number;
  compact: boolean;
  /** Override default CCA character hard limit (default: 30000) */
  charHardLimit?: number;
  /** Override default CCA character target (default: 29000) */
  charTarget?: number;
}

export interface CompiledCoordinatorPrompt {
  markdown: string;
  estimatedTokens: number;
  /** Actual character count of the compiled markdown */
  charCount: number;
  appliedCompactions: string[];
  sectionSizes: Array<{ name: string; tokens: number }>;
  mode: 'full' | 'compact' | 'lazy-load';
}

export interface LoadExportContextOptions {
  outputPath: string;
  generatedAt: string;
  modelOverride?: string;
  descriptionOverride?: string;
  skillMode: 'baseline' | 'all' | 'none' | string[];
}
