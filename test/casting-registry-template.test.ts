import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAgentProvenanceRegistry } from '@bradygaster/squad-sdk/casting';

const LOCATIONS = [
  '.squad-templates/casting-registry.json',
  'templates/casting-registry.json',
  'packages/squad-cli/templates/casting-registry.json',
  'packages/squad-sdk/templates/casting-registry.json',
] as const;

describe('casting-registry.json template mirrors', () => {
  const canonicalBytes = readFileSync(resolve(LOCATIONS[0]));

  for (const location of LOCATIONS) {
    it(`${location} is byte-identical to the canonical registry template`, () => {
      expect(readFileSync(resolve(location))).toEqual(canonicalBytes);
    });
  }

  it('the canonical empty registry is a complete v1 producer root', () => {
    expect(parseAgentProvenanceRegistry(JSON.parse(canonicalBytes.toString('utf-8'))))
      .toMatchObject({
        completeness: 'complete',
        registry: {
          schema: 'squad-agent-provenance/v1',
          schema_version: 1,
          revision: 1,
          agents: {},
        },
      });
  });
});
