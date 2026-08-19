/**
 * Squad Configuration — Content Review Squad
 *
 * Defines a team of three specialist reviewers using the Squad SDK
 * builder pattern. Each agent reviews content from a different angle:
 * tone, technical accuracy, and copy editing.
 *
 * This is the SDK-First configuration — no markdown files needed.
 */

import {
  defineSquad,
  defineTeam,
  defineAgent,
  defineRouting,
} from '@bradygaster/squad-sdk/builders';
import type { SquadSDKConfig } from '@bradygaster/squad-sdk/builders';

// ── Agent Definitions ────────────────────────────────────────────────

const toneReviewer = defineAgent({
  name: 'tone-reviewer',
  role: 'Tone & Voice Analyst',
  description: 'Evaluates content for audience fit, tone consistency, and emotional resonance.',
  model: 'claude-sonnet-5',
  tools: ['grep', 'view'],
  capabilities: [
    { name: 'content-analysis', level: 'expert' },
    { name: 'audience-mapping', level: 'proficient' },
  ],
  status: 'active',
});

const technicalReviewer = defineAgent({
  name: 'technical-reviewer',
  role: 'Technical Accuracy Checker',
  description: 'Validates technical claims, code snippets, and factual accuracy.',
  model: 'claude-sonnet-5',
  tools: ['grep', 'view', 'powershell'],
  capabilities: [
    { name: 'code-review', level: 'expert' },
    { name: 'fact-checking', level: 'expert' },
  ],
  status: 'active',
});

const copyEditor = defineAgent({
  name: 'copy-editor',
  role: 'Copy Editor',
  description: 'Checks grammar, clarity, structure, and readability.',
  model: 'claude-sonnet-5',
  tools: ['grep', 'view'],
  capabilities: [
    { name: 'grammar-check', level: 'expert' },
    { name: 'readability-analysis', level: 'proficient' },
  ],
  status: 'active',
});

// ── Squad Config ─────────────────────────────────────────────────────

export const squadConfig: SquadSDKConfig = defineSquad({
  version: '1.0.0',

  team: defineTeam({
    name: 'Content Review Squad',
    description: 'A team of specialist reviewers that analyze content from multiple angles.',
    projectContext: 'HTTP-triggered content review pipeline. Receives text via POST, fans out to three reviewers, aggregates findings into a structured report.',
    members: ['tone-reviewer', 'technical-reviewer', 'copy-editor'],
  }),

  agents: [toneReviewer, technicalReviewer, copyEditor],

  routing: defineRouting({
    rules: [
      {
        pattern: 'tone-*',
        agents: ['tone-reviewer'],
        tier: 'direct',
        priority: 1,
        description: 'Tone and voice analysis tasks',
      },
      {
        pattern: 'technical-*',
        agents: ['technical-reviewer'],
        tier: 'standard',
        priority: 1,
        description: 'Technical accuracy validation',
      },
      {
        pattern: 'copy-*',
        agents: ['copy-editor'],
        tier: 'direct',
        priority: 1,
        description: 'Grammar and style editing',
      },
      {
        pattern: 'review-*',
        agents: ['tone-reviewer', 'technical-reviewer', 'copy-editor'],
        tier: 'full',
        priority: 0,
        description: 'Full content review — all agents collaborate',
      },
    ],
    defaultAgent: 'tone-reviewer',
    fallback: 'coordinator',
  }),
});
