import { describe, it, expect } from 'vitest';

describe('SDK package exports', () => {
  it('exports VERSION from root', async () => {
    const sdk = await import('@bradygaster/squad-sdk');
    expect(sdk.VERSION).toBeDefined();
    expect(typeof sdk.VERSION).toBe('string');
  });

  it('exports from /config subpath', async () => {
    const config = await import('@bradygaster/squad-sdk/config');
    expect(config).toBeDefined();
    // config barrel re-exports schema, routing, models, etc.
    expect(config.DEFAULT_CONFIG).toBeDefined();
  });

  it('exports from /resolution subpath', async () => {
    const resolution = await import('@bradygaster/squad-sdk/resolution');
    expect(resolution.resolveSquadInDir).toBeDefined();
  });

  it('exports from /parsers subpath', async () => {
    const parsers = await import('@bradygaster/squad-sdk/parsers');
    expect(parsers).toBeDefined();
    expect(parsers.parseTeamMarkdown).toBeDefined();
  });

  it('exports from /types subpath', async () => {
    // types subpath uses export type only — no runtime values
    // just verify the module resolves without error
    const types = await import('@bradygaster/squad-sdk/types');
    expect(types).toBeDefined();
  });

  it('exports from /agents subpath', async () => {
    const agents = await import('@bradygaster/squad-sdk/agents');
    expect(agents).toBeDefined();
  });

  it('exports from /skills subpath', async () => {
    const skills = await import('@bradygaster/squad-sdk/skills');
    expect(skills).toBeDefined();
  });

  it('exports from /tools subpath', async () => {
    const tools = await import('@bradygaster/squad-sdk/tools');
    expect(tools).toBeDefined();
  });
});
