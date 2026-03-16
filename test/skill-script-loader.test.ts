/**
 * Tests for SkillScriptLoader and ToolRegistry.applySkillHandlers() (M3-3, Issue #141)
 * 
 * These tests validate the design spec for script-based skill handlers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SkillScriptLoader, resolveSkillPath } from '@bradygaster/squad-sdk/skills';
import type { LoadResult } from '@bradygaster/squad-sdk/skills';
import { ToolRegistry } from '@bradygaster/squad-sdk/tools';

// --- Test fixtures and helpers ---

function createTestDir(): string {
  const testDir = path.join('test-fixtures', `skill-loader-${randomUUID().slice(0, 8)}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

function createScriptsDir(baseDir: string): string {
  const scriptsDir = path.join(baseDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  return scriptsDir;
}

function writeValidScript(scriptsDir: string, scriptName: string, returnValue = 'ok'): void {
  fs.writeFileSync(
    path.join(scriptsDir, scriptName),
    `export default async function(args, config) { return { textResultForLlm: "${returnValue}", resultType: "success" }; }`,
    'utf-8',
  );
}

function writeInvalidScript(scriptsDir: string, scriptName: string, content: string): void {
  fs.writeFileSync(
    path.join(scriptsDir, scriptName),
    content,
    'utf-8',
  );
}

function writeLifecycleScript(scriptsDir: string, hasInit: boolean, hasDispose: boolean): void {
  let content = '';
  if (hasInit) {
    content += 'export async function init(config) { /* init logic */ }\n';
  }
  if (hasDispose) {
    content += 'export async function dispose() { /* dispose logic */ }\n';
  }
  fs.writeFileSync(path.join(scriptsDir, 'lifecycle.js'), content, 'utf-8');
}

const mockSchema = {
  description: 'Test tool',
  parameters: { type: 'object' as const, properties: {} },
};

const getSchemaForAll = (name: string) => mockSchema;
const getSchemaForNone = (name: string) => undefined;

// --- SkillScriptLoader Tests ---

describe('SkillScriptLoader', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // --- Null return (markdown fallback) ---

  describe('null return (markdown fallback)', () => {
    it('should return null when scripts/ directory does not exist', async () => {
      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});
      expect(result).toBeNull();
    });

    it('should return null when skill directory does not exist', async () => {
      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load('/nonexistent/path', {});
      expect(result).toBeNull();
    });
  });

  // --- Non-null return (empty-tools contract) ---

  describe('non-null return (empty-tools contract)', () => {
    // CONTRACT: non-null even when empty — callers must check tools.length, not null,
    // for markdown fallback logic. null is ONLY returned when scripts/ is absent.

    it('should return { tools: [] } (not null) when scripts/ exists but contains only .ts files', async () => {
      const scriptsDir = createScriptsDir(testDir);
      // .ts file present (developer forgot to compile) — no .js handler produced
      fs.writeFileSync(
        path.join(scriptsDir, 'create_issue.ts'),
        'export default async function(args: unknown, config: unknown) {}',
        'utf-8',
      );

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      // scripts/ is present so result is NOT null — callers must check tools.length for fallback
      expect(result).not.toBeNull();
      expect(result!.tools).toHaveLength(0);
    });

    it('should return { tools: [], lifecycle } (not null) when scripts/ contains only lifecycle.js', async () => {
      const scriptsDir = createScriptsDir(testDir);
      // lifecycle.js is excluded from handler scanning — no handler .js files present
      writeLifecycleScript(scriptsDir, true, true);

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      // scripts/ is present so result is NOT null — callers must check tools.length for fallback
      expect(result).not.toBeNull();
      expect(result!.tools).toHaveLength(0);
      // lifecycle is still defined since lifecycle.js was loaded
      expect(result!.lifecycle).toBeDefined();
    });

    it('should return { tools: [] } (not null) when scripts/ directory is completely empty', async () => {
      // Create scripts/ dir but write no files at all
      createScriptsDir(testDir);

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      // scripts/ is present so result is NOT null — callers must check tools.length for fallback
      expect(result).not.toBeNull();
      expect(result!.tools).toHaveLength(0);
    });
  });

  // --- Successful load ---

  describe('successful load', () => {
    it('should load a single script for a concern', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js', 'created');

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.tools).toHaveLength(1);
      expect(result!.tools[0].name).toBe('squad_create_issue');
      expect(result!.tools[0].description).toBe('Test tool');
    });

    it('should handle partial implementation (only some tools have scripts)', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js');
      writeValidScript(scriptsDir, 'close_issue.js');
      // list_issues.js and update_issue.js are missing

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.tools).toHaveLength(2);
      expect(result!.tools.map(t => t.name).sort()).toEqual([
        'squad_close_issue',
        'squad_create_issue',
      ]);
    });

    it('should load multiple scripts for same concern', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js', 'create_result');
      writeValidScript(scriptsDir, 'update_issue.js', 'update_result');
      writeValidScript(scriptsDir, 'list_issues.js', 'list_result');
      writeValidScript(scriptsDir, 'close_issue.js', 'close_result');

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.tools).toHaveLength(4);
    });

    it('should pass backendConfig through to handler when called', async () => {
      const scriptsDir = createScriptsDir(testDir);
      fs.writeFileSync(
        path.join(scriptsDir, 'create_issue.js'),
        `export default async function(args, config) { 
          return { 
            textResultForLlm: config.testKey, 
            resultType: "success" 
          }; 
        }`,
        'utf-8',
      );

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, { testKey: 'test-value' });

      expect(result).not.toBeNull();
      expect(result!.tools).toHaveLength(1);

      // Call the handler to verify config is passed
      const handler = result!.tools[0].handler;
      const output = await handler({ title: 'Test' }, { testKey: 'test-value' });
      expect(output.textResultForLlm).toBe('test-value');
    });

    it('should return tool name matching the full tool name (squad_* prefix)', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_decision.js');

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.tools[0].name).toBe('squad_create_decision');
    });

    it('should discover scripts for any tool naming convention', async () => {
      const scriptNames = ['create_issue.js', 'create_decision.js', 'create_memory.js', 'create_log.js'];

      for (const scriptName of scriptNames) {
        const scriptTestDir = createTestDir();
        const scriptsDir = createScriptsDir(scriptTestDir);
        writeValidScript(scriptsDir, scriptName);

        const loader = new SkillScriptLoader(getSchemaForAll);
        const result = await loader.load(scriptTestDir, {});

        expect(result).not.toBeNull();
        expect(result!.tools.length).toBeGreaterThan(0);

        fs.rmSync(scriptTestDir, { recursive: true, force: true });
      }
    });
  });

  // --- lifecycle.js ---

  describe('lifecycle.js', () => {
    it('should populate lifecycle when lifecycle.js exists', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js');
      writeLifecycleScript(scriptsDir, true, true);

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.lifecycle).toBeDefined();
      expect(result!.lifecycle!.init).toBeDefined();
      expect(result!.lifecycle!.dispose).toBeDefined();
    });

    it('should handle lifecycle.js with only init', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js');
      writeLifecycleScript(scriptsDir, true, false);

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.lifecycle).toBeDefined();
      expect(result!.lifecycle!.init).toBeDefined();
      expect(result!.lifecycle!.dispose).toBeUndefined();
    });

    it('should handle lifecycle.js with only dispose', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js');
      writeLifecycleScript(scriptsDir, false, true);

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.lifecycle).toBeDefined();
      expect(result!.lifecycle!.init).toBeUndefined();
      expect(result!.lifecycle!.dispose).toBeDefined();
    });

    it('should have undefined lifecycle when no lifecycle.js exists', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js');

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.lifecycle).toBeUndefined();
    });

    it('should call init with backendConfig', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js');

      // Use a temp file to capture config across the ESM module boundary.
      // Module-level variables won't work because Node caches the module between
      // test runs; writing to disk is the reliable cross-process capture pattern.
      const capturePath = path.join(testDir, `init-capture-${randomUUID()}.json`);

      fs.writeFileSync(
        path.join(scriptsDir, 'lifecycle.js'),
        `import { writeFileSync } from 'node:fs';
export async function init(config) {
  writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify(config), 'utf-8');
}`,
        'utf-8',
      );

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.lifecycle).toBeDefined();
      expect(result!.lifecycle!.init).toBeDefined();

      // Call init and verify the config was actually received
      await result!.lifecycle!.init!({ testKey: 'test-value-123' });

      const captured = JSON.parse(fs.readFileSync(capturePath, 'utf-8'));
      expect(captured).toEqual({ testKey: 'test-value-123' });
    });

    it('should call dispose on teardown', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js');
      writeLifecycleScript(scriptsDir, false, true);

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.lifecycle!.dispose).toBeDefined();

      // Should not throw when called
      await expect(result!.lifecycle!.dispose!()).resolves.not.toThrow();
    });
  });

  // --- Error cases ---

  describe('error cases', () => {
    it('should throw when script exports a non-function default', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeInvalidScript(scriptsDir, 'create_issue.js', 'export default "not a function";');

      const loader = new SkillScriptLoader(getSchemaForAll);
      
      await expect(loader.load(testDir, {})).rejects.toThrow();
    });

    it('should throw when script has no default export', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeInvalidScript(scriptsDir, 'create_issue.js', 'export const notDefault = () => {};');

      const loader = new SkillScriptLoader(getSchemaForAll);
      
      await expect(loader.load(testDir, {})).rejects.toThrow();
    });

    it('should throw when script has syntax error', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeInvalidScript(scriptsDir, 'create_issue.js', 'export default function( { // syntax error');

      const loader = new SkillScriptLoader(getSchemaForAll);
      
      await expect(loader.load(testDir, {})).rejects.toThrow();
    });
  });

  // --- Schema lookup ---

  describe('schema lookup', () => {
    it('should skip tool when getToolSchema returns undefined', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js');
      writeValidScript(scriptsDir, 'update_issue.js');

      const loader = new SkillScriptLoader(getSchemaForNone);
      const result = await loader.load(testDir, {});

      // No tools should be loaded since all schemas are undefined
      expect(result).not.toBeNull();
      expect(result!.tools).toHaveLength(0);
    });

    it('should include all tools when all have schemas', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js');
      writeValidScript(scriptsDir, 'update_issue.js');
      writeValidScript(scriptsDir, 'list_issues.js');

      const loader = new SkillScriptLoader(getSchemaForAll);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.tools).toHaveLength(3);
    });

    it('should skip only tools without schemas', async () => {
      const scriptsDir = createScriptsDir(testDir);
      writeValidScript(scriptsDir, 'create_issue.js');
      writeValidScript(scriptsDir, 'update_issue.js');

      // Only return schema for create_issue
      const selectiveSchema = (name: string) => 
        name === 'squad_create_issue' ? mockSchema : undefined;

      const loader = new SkillScriptLoader(selectiveSchema);
      const result = await loader.load(testDir, {});

      expect(result).not.toBeNull();
      expect(result!.tools).toHaveLength(1);
      expect(result!.tools[0].name).toBe('squad_create_issue');
    });
  });
});

// --- ToolRegistry.applySkillHandlers() ---

describe('ToolRegistry.applySkillHandlers()', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should replace an existing tool handler', async () => {
    // ToolRegistry pre-registers squad_route tool
    const originalTool = registry.getTool('squad_route');
    expect(originalTool).toBeDefined();

    // Create a replacement handler
    const replacementHandler = async (args: any, invocation: any) => ({
      textResultForLlm: 'replaced',
      resultType: 'success' as const,
    });

    registry.applySkillHandlers([{
      name: 'squad_route',
      description: 'Test tool',
      parameters: { type: 'object', properties: {} },
      handler: replacementHandler,
    }]);

    // Verify the replacement handler is used
    const tool = registry.getTool('squad_route');
    expect(tool).toBeDefined();
    
    const result = await tool!.handler({ targetAgent: 'test', task: 'test' }, {} as any);
    expect(result.textResultForLlm).toBe('replaced');
  });

  it('should silently ignore unknown tool names', () => {
    const handler = async (args: any, invocation: any) => ({ 
      textResultForLlm: 'test', 
      resultType: 'success' as const 
    });

    const beforeCount = registry.getTools().length;

    // Should not throw
    expect(() => {
      registry.applySkillHandlers([{
        name: 'nonexistent_tool',
        description: 'Test',
        parameters: { type: 'object', properties: {} },
        handler,
      }]);
    }).not.toThrow();

    // Tool count should not change
    expect(registry.getTools().length).toBe(beforeCount);
  });

  it('should handle empty array as no-op', () => {
    const beforeCount = registry.getTools().length;
    registry.applySkillHandlers([]);
    expect(registry.getTools().length).toBe(beforeCount);
  });

  it('should replace multiple tools in one call', async () => {
    // Use existing squad tools: squad_route and squad_decide
    const originalRoute = registry.getTool('squad_route');
    const originalDecide = registry.getTool('squad_decide');
    expect(originalRoute).toBeDefined();
    expect(originalDecide).toBeDefined();

    // Replace both
    registry.applySkillHandlers([
      {
        name: 'squad_route',
        description: 'Squad Route',
        parameters: { type: 'object', properties: {} },
        handler: async (args: any, invocation: any) => ({ 
          textResultForLlm: 'route_replaced', 
          resultType: 'success' as const 
        }),
      },
      {
        name: 'squad_decide',
        description: 'Squad Decide',
        parameters: { type: 'object', properties: {} },
        handler: async (args: any, invocation: any) => ({ 
          textResultForLlm: 'decide_replaced', 
          resultType: 'success' as const 
        }),
      },
    ]);

    // Verify both are replaced
    const toolRoute = registry.getTool('squad_route');
    const toolDecide = registry.getTool('squad_decide');

    const resultRoute = await toolRoute!.handler({ targetAgent: 'test', task: 'test' }, {} as any);
    const resultDecide = await toolDecide!.handler({ author: 'test', summary: 'test', body: 'test' }, {} as any);

    expect(resultRoute.textResultForLlm).toBe('route_replaced');
    expect(resultDecide.textResultForLlm).toBe('decide_replaced');
  });

  it('should only replace tools that exist in registry', async () => {
    const beforeCount = registry.getTools().length;

    registry.applySkillHandlers([
      {
        name: 'squad_route',
        description: 'Existing',
        parameters: { type: 'object', properties: {} },
        handler: async (args: any, invocation: any) => ({ 
          textResultForLlm: 'replaced', 
          resultType: 'success' as const 
        }),
      },
      {
        name: 'nonexistent_tool',
        description: 'New',
        parameters: { type: 'object', properties: {} },
        handler: async (args: any, invocation: any) => ({ 
          textResultForLlm: 'new', 
          resultType: 'success' as const 
        }),
      },
    ]);

    // Count should not increase (nonexistent_tool ignored)
    expect(registry.getTools().length).toBe(beforeCount);

    // squad_route should be replaced
    const tool = registry.getTool('squad_route');
    const result = await tool!.handler({ targetAgent: 'test', task: 'test' }, {} as any);
    expect(result.textResultForLlm).toBe('replaced');
  });
});

// --- resolveSkillPath() ---

describe('resolveSkillPath()', () => {
  // Use real project root for containment validation
  const projectRoot = path.resolve('D:\\project');
  const teamRoot = path.resolve('D:\\project\\.squad');

  it('should return absolute path within projectRoot as-is', () => {
    const absolute = path.resolve(projectRoot, 'skills', 'my-skill');
    const result = resolveSkillPath(absolute, projectRoot);
    expect(result).toBe(absolute);
  });

  it('should resolve relative path from projectRoot', () => {
    const relative = path.join('skills', 'my-skill');
    const result = resolveSkillPath(relative, projectRoot);
    expect(result).toBe(path.resolve(projectRoot, 'skills', 'my-skill'));
  });

  it('should resolve relative path from teamRoot when provided', () => {
    const relative = path.join('skills', 'my-skill');
    const result = resolveSkillPath(relative, projectRoot, teamRoot);
    expect(result).toBe(path.resolve(teamRoot, 'skills', 'my-skill'));
  });

  it('should resolve .copilot/ prefix from projectRoot when teamRoot is provided', () => {
    const relative = '.copilot/skills/my-skill';
    const result = resolveSkillPath(relative, projectRoot, teamRoot);
    expect(result).toBe(path.resolve(projectRoot, '.copilot', 'skills', 'my-skill'));
  });

  it('should strip legacy .squad/ prefix when teamRoot is provided', () => {
    const relative = '.squad/skills/my-skill';
    const result = resolveSkillPath(relative, projectRoot, teamRoot);
    expect(result).toBe(path.resolve(teamRoot, 'skills', 'my-skill'));
  });

  it('should throw when path with .. escapes projectRoot', () => {
    const escaping = path.join('..', '..', 'outside');
    expect(() => {
      resolveSkillPath(escaping, projectRoot);
    }).toThrow(/escapes containment/);
  });

  it('should throw when path with .. escapes teamRoot', () => {
    const escaping = path.join('..', '..', 'outside');
    expect(() => {
      resolveSkillPath(escaping, projectRoot, teamRoot);
    }).toThrow(/escapes containment/);
  });

  it('should allow .. within bounds', () => {
    const withinBounds = path.join('skills', 'subdir', '..', 'my-skill');
    const result = resolveSkillPath(withinBounds, projectRoot);
    expect(result).toBe(path.resolve(projectRoot, 'skills', 'my-skill'));
  });

  it('should normalize path separators consistently', () => {
    const forward = 'skills/my-skill';
    const result = resolveSkillPath(forward, projectRoot);
    expect(result).toBe(path.resolve(projectRoot, 'skills', 'my-skill'));
  });
});

