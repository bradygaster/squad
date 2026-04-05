/**
 * M4-9: CI/CD pipeline for distribution
 * Generates GitHub Actions workflow YAML for build, test, and release pipelines.
 */

export interface CIPipelineStep {
  name: string;
  command: string;
  condition?: string;
  env?: Record<string, string>;
}

export interface CIPipelineTrigger {
  event: 'push' | 'pull_request' | 'release' | 'workflow_dispatch' | 'schedule';
  branches?: string[];
  tags?: string[];
  cron?: string;
}

export interface CIPipelineArtifact {
  name: string;
  path: string;
  retention?: number;
}

export interface CIPipelineConfig {
  name: string;
  steps: CIPipelineStep[];
  triggers: CIPipelineTrigger[];
  artifacts: CIPipelineArtifact[];
  environment: Record<string, string>;
  nodeVersion?: string;
}

export interface PipelineValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const DEFAULT_STEPS: CIPipelineStep[] = [
  { name: 'Lint', command: 'npm run lint' },
  { name: 'Build', command: 'npm run build' },
  { name: 'Test', command: 'npm test' },
  { name: 'Bundle', command: 'esbuild src/index.ts --bundle --format=esm --outdir=dist' },
];

const PUBLISH_STEP: CIPipelineStep = {
  name: 'Publish',
  command: 'npm publish --access public',
  env: { NODE_AUTH_TOKEN: '${{ secrets.NPM_TOKEN }}' },
};

const TAG_STEP: CIPipelineStep = {
  name: 'Tag',
  command: 'git tag v${{ github.event.release.tag_name }}',
};

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map(l => l.length > 0 ? pad + l : l).join('\n');
}

function yamlEnv(env: Record<string, string>, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return Object.entries(env).map(([k, v]) => `${pad}${k}: ${v}`).join('\n');
}

/**
 * Generate a GitHub Actions CI workflow YAML string.
 */
export function generateGitHubActionsWorkflow(config: CIPipelineConfig): string {
  const nodeVersion = config.nodeVersion ?? '20';
  const lines: string[] = [];

  lines.push(`name: ${config.name}`);
  lines.push('');
  lines.push('on:');
  for (const trigger of config.triggers) {
    if (trigger.event === 'schedule' && trigger.cron) {
      lines.push('  schedule:');
      lines.push(`    - cron: '${trigger.cron}'`);
    } else if (trigger.event === 'workflow_dispatch') {
      lines.push('  workflow_dispatch:');
    } else if (trigger.event === 'push') {
      lines.push('  push:');
      if (trigger.branches?.length) {
        lines.push('    branches:');
        for (const b of trigger.branches) lines.push(`      - ${b}`);
      }
      if (trigger.tags?.length) {
        lines.push('    tags:');
        for (const t of trigger.tags) lines.push(`      - ${t}`);
      }
    } else if (trigger.event === 'pull_request') {
      lines.push('  pull_request:');
      if (trigger.branches?.length) {
        lines.push('    branches:');
        for (const b of trigger.branches) lines.push(`      - ${b}`);
      }
    } else if (trigger.event === 'release') {
      lines.push('  release:');
      lines.push('    types: [published]');
    }
  }

  lines.push('');
  if (Object.keys(config.environment).length > 0) {
    lines.push('env:');
    for (const [k, v] of Object.entries(config.environment)) {
      lines.push(`  ${k}: ${v}`);
    }
    lines.push('');
  }

  lines.push('jobs:');
  lines.push('  build:');
  lines.push('    runs-on: ubuntu-latest');
  lines.push('    steps:');
  lines.push('      - uses: actions/checkout@v4');
  lines.push('      - uses: actions/setup-node@v4');
  lines.push('        with:');
  lines.push(`          node-version: '${nodeVersion}'`);
  lines.push('          cache: npm');
  lines.push('      - run: npm ci');

  for (const step of config.steps) {
    lines.push(`      - name: ${step.name}`);
    lines.push(`        run: ${step.command}`);
    if (step.condition) {
      lines.push(`        if: ${step.condition}`);
    }
    if (step.env && Object.keys(step.env).length > 0) {
      lines.push('        env:');
      for (const [k, v] of Object.entries(step.env)) {
        lines.push(`          ${k}: ${v}`);
      }
    }
  }

  for (const artifact of config.artifacts) {
    lines.push('      - uses: actions/upload-artifact@v4');
    lines.push(`        name: Upload ${artifact.name}`);
    lines.push('        with:');
    lines.push(`          name: ${artifact.name}`);
    lines.push(`          path: ${artifact.path}`);
    if (artifact.retention) {
      lines.push(`          retention-days: ${artifact.retention}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Generate a release workflow YAML string.
 */
export function generateReleaseWorkflow(config: CIPipelineConfig): string {
  const releaseConfig: CIPipelineConfig = {
    ...config,
    name: `${config.name} — Release`,
    triggers: [{ event: 'release', tags: ['v*'] }],
    steps: [
      ...config.steps,
      PUBLISH_STEP,
      TAG_STEP,
    ],
  };

  return generateGitHubActionsWorkflow(releaseConfig);
}

/**
 * Validate a CI pipeline configuration for completeness and correctness.
 */
export function validatePipelineConfig(config: CIPipelineConfig): PipelineValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.name || typeof config.name !== 'string' || config.name.trim().length === 0) {
    errors.push('Pipeline name is required');
  }

  if (!config.steps || config.steps.length === 0) {
    errors.push('Pipeline must have at least one step');
  } else {
    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i]!;
      if (!step.name) errors.push(`Step ${i} missing name`);
      if (!step.command) errors.push(`Step ${i} missing command`);
    }
  }

  if (!config.triggers || config.triggers.length === 0) {
    errors.push('Pipeline must have at least one trigger');
  } else {
    for (const trigger of config.triggers) {
      if (trigger.event === 'schedule' && !trigger.cron) {
        errors.push('Schedule trigger requires a cron expression');
      }
    }
  }

  if (!config.artifacts) {
    warnings.push('No artifacts configured');
  }

  const stepNames = config.steps?.map(s => s.name) ?? [];
  if (!stepNames.some(n => n.toLowerCase().includes('test'))) {
    warnings.push('Pipeline has no test step');
  }
  if (!stepNames.some(n => n.toLowerCase().includes('lint'))) {
    warnings.push('Pipeline has no lint step');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Get the default CI pipeline steps.
 */
export function getDefaultSteps(): CIPipelineStep[] {
  return DEFAULT_STEPS.map(s => ({ ...s, env: s.env ? { ...s.env } : undefined }));
}
