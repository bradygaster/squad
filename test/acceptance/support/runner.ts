import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFeature, GherkinStep } from './gherkin.js';

export type StepDefinition = (
  stepText: string,
  context: TestContext
) => Promise<void> | void;

export interface StepDefinitions {
  Given: Map<string | RegExp, StepDefinition>;
  When: Map<string | RegExp, StepDefinition>;
  Then: Map<string | RegExp, StepDefinition>;
}

export interface TestContext {
  [key: string]: unknown;
}

export function registerStep(
  keyword: 'Given' | 'When' | 'Then',
  pattern: string | RegExp,
  fn: StepDefinition,
  registry: StepDefinitions
): void {
  registry[keyword].set(pattern, fn);
}

async function executeStep(
  step: GherkinStep,
  context: TestContext,
  registry: StepDefinitions
): Promise<void> {
  const stepMap = registry[step.keyword];

  for (const [pattern, fn] of stepMap.entries()) {
    if (typeof pattern === 'string') {
      if (step.text === pattern) {
        await fn(step.text, context);
        return;
      }
    } else {
      const match = step.text.match(pattern);
      if (match) {
        await fn(step.text, context);
        return;
      }
    }
  }

  throw new Error(`No step definition found for: ${step.keyword} ${step.text}`);
}

export function runFeature(
  featureFilePath: string,
  registry: StepDefinitions
): void {
  const content = readFileSync(featureFilePath, 'utf-8');
  const feature = parseFeature(content);

  describe(feature.name, () => {
    for (const scenario of feature.scenarios) {
      it(scenario.name, async () => {
        const context: TestContext = {};

        for (const step of scenario.steps) {
          await executeStep(step, context, registry);
        }
      }, 30_000);
    }
  });
}

export function createRegistry(): StepDefinitions {
  return {
    Given: new Map(),
    When: new Map(),
    Then: new Map(),
  };
}
