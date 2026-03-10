import { describe, it, expect } from 'vitest';

describe('Consumer-perspective imports', () => {
  describe('main barrel exports', () => {
    it('exports key parser functions', async () => {
      const { parseTeamMarkdown, parseDecisionsMarkdown, parseRoutingMarkdown } =
        await import('@bradygaster/squad-sdk');
      expect(typeof parseTeamMarkdown).toBe('function');
      expect(typeof parseDecisionsMarkdown).toBe('function');
      expect(typeof parseRoutingMarkdown).toBe('function');
    });

    it('exports CLI functions', async () => {
      const { runInit, runExport, runImport, scrubEmails } =
        await import('@bradygaster/squad-cli');
      expect(typeof runInit).toBe('function');
      expect(typeof runExport).toBe('function');
      expect(typeof runImport).toBe('function');
      expect(typeof scrubEmails).toBe('function');
    });

    it('exports VERSION as a string', async () => {
      const { VERSION } = await import('@bradygaster/squad-sdk');
      expect(typeof VERSION).toBe('string');
      expect(VERSION.length).toBeGreaterThan(0);
    });
  });

  describe('parsers barrel exports', () => {
    it('exports parser functions from parsers barrel', async () => {
      const { parseTeamMarkdown, parseCharterMarkdown } =
        await import('@bradygaster/squad-sdk/parsers');
      expect(typeof parseTeamMarkdown).toBe('function');
      expect(typeof parseCharterMarkdown).toBe('function');
    });
  });

  describe('types barrel', () => {
    it('has zero runtime exports (pure type re-exports)', async () => {
      const types = await import('@bradygaster/squad-sdk/types');
      // type-only re-exports produce no runtime values
      expect(Object.keys(types).length).toBe(0);
    });
  });

  describe('side-effect-free import', () => {
    it('importing the barrel does NOT trigger CLI behavior', async () => {
      const argvBefore = [...process.argv];
      await import('@bradygaster/squad-sdk');
      // process.argv unchanged — no CLI side effects
      expect(process.argv).toEqual(argvBefore);
      // The test completing without hanging or exiting proves the import is clean
    });
  });

  describe('skills barrel exports', () => {
    it('exports SkillScriptLoader, resolveSkillPath, and defineHandler from skills barrel', async () => {
      const { SkillScriptLoader, resolveSkillPath, defineHandler } =
        await import('@bradygaster/squad-sdk/skills');
      expect(typeof SkillScriptLoader).toBe('function');
      expect(typeof resolveSkillPath).toBe('function');
      expect(typeof defineHandler).toBe('function');
    });
  });
});
