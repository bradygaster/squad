/**
 * Tests for Secret Leak Mitigation (Issue #267)
 * 
 * Testing comprehensive hooks to prevent .env reads and secret leaks in commits.
 * These tests define expected behavior for the secret protection system.
 * 
 * IMPLEMENTATION STATUS: TDD - Tests written first, hooks to be implemented
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HookPipeline,
  PolicyConfig,
  PreToolUseContext,
  PostToolUseContext,
} from '@bradygaster/squad-sdk/hooks';

describe('Secret Leak Mitigation (Issue #267)', () => {
  describe('A. .env File Read Blocking (PreToolUseHook)', () => {
    let pipeline: HookPipeline;

    beforeEach(() => {
      const config: PolicyConfig = {
        scrubSecrets: true, // New config flag to enable secret protection
      };
      pipeline = new HookPipeline(config);
    });

    it('should block view tool calls targeting .env', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('.env');
      expect(result.reason?.toLowerCase()).toMatch(/secret|sensitive|blocked/);
    });

    it('should block view tool calls targeting .env.local', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env.local' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should block view tool calls targeting .env.production', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env.production' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should block view tool calls targeting .env.staging', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env.staging' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should block view tool calls targeting .env.development', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env.development' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should block view tool calls targeting .env.test', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env.test' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should ALLOW view tool calls targeting .env.example', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env.example' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('should ALLOW view tool calls targeting .env.sample', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env.sample' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('should ALLOW view tool calls targeting .env.template', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env.template' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('should block shell commands that cat .env', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'powershell',
        arguments: { command: 'cat .env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('.env');
    });

    it('should block shell commands that type .env (Windows)', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'powershell',
        arguments: { command: 'type .env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should block shell commands with Get-Content .env', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'powershell',
        arguments: { command: 'Get-Content .env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should block grep targeting .env files', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'grep',
        arguments: { pattern: 'DATABASE', path: '.env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should block .env reads even with path traversal (../../.env)', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '../../.env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should block .env reads with absolute paths', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '/home/user/project/.env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should block .env reads with Windows absolute paths', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: 'C:\\Users\\user\\project\\.env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should NOT block reads of files with .env in the name but safe extensions', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: 'docs/env-setup.md' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('should NOT block if scrubSecrets is disabled (backward compat)', async () => {
      const config: PolicyConfig = {
        scrubSecrets: false, // Explicitly disabled
      };
      const disabledPipeline = new HookPipeline(config);

      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await disabledPipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('should NOT block if scrubSecrets is undefined (default backward compat)', async () => {
      const config: PolicyConfig = {}; // No scrubSecrets specified
      const defaultPipeline = new HookPipeline(config);

      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await defaultPipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });
  });

  describe('B. Secret Content Scrubbing (PostToolUseHook)', () => {
    let pipeline: HookPipeline;

    beforeEach(() => {
      const config: PolicyConfig = {
        scrubSecrets: true,
      };
      pipeline = new HookPipeline(config);
    });

    it('should redact MongoDB connection strings', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'Connection: mongodb://admin:password123@localhost:27017/mydb',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('password123');
      expect(result.result).not.toContain('mongodb://admin:password123@');
    });

    it('should redact PostgreSQL connection strings', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'postgres://user:secret@db.example.com:5432/production',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('secret');
    });

    it('should redact MySQL connection strings', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'mysql://root:rootpass@mysql.local:3306/database',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('rootpass');
    });

    it('should redact Redis connection strings', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'redis://:mypassword@redis.example.com:6379',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('mypassword');
    });

    it('should redact GitHub personal access tokens (ghp_)', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('ghp_1234567890');
    });

    it('should redact GitHub OAuth tokens (gho_)', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'OAuth: gho_abcdefghijklmnopqrstuvwxyz123456',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('gho_abcd');
    });

    it('should redact GitHub fine-grained tokens (github_pat_)', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'PAT: github_pat_11ABCDEFG1234567890_aBcDeFgHiJkLmNoPqRsTuVwXyZ',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('github_pat_11A');
    });

    it('should redact OpenAI API keys (sk-)', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'API Key: sk-proj-1234567890abcdefghijklmnopqrstuvwxyz',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('sk-proj-123');
    });

    it('should redact AWS access keys (AKIA*)', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('AKIAIOSF');
    });

    it('should redact bearer tokens', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('eyJhbGci');
    });

    it('should redact password= patterns', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'DB_PASSWORD=supersecret123',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('supersecret123');
    });

    it('should redact secret= patterns', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'API_SECRET=my-secret-key-value',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('my-secret-key-value');
    });

    it('should NOT redact non-secret content', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'const apiUrl = "https://api.example.com/v1/users";',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toBe('const apiUrl = "https://api.example.com/v1/users";');
    });

    it('should NOT redact URLs without credentials', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'Visit https://github.com/bradygaster/squad for docs',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toBe('Visit https://github.com/bradygaster/squad for docs');
    });

    it('should redact secrets in nested objects', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: {
          config: {
            database: {
              url: 'postgres://admin:secret123@db.local:5432/app',
            },
          },
        },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      const scrubbed = result.result as any;
      expect(scrubbed.config.database.url).toContain('[REDACTED');
      expect(scrubbed.config.database.url).not.toContain('secret123');
    });

    it('should redact secrets in arrays', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: {
          tokens: [
            'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
            'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
          ],
        },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      const scrubbed = result.result as any;
      expect(scrubbed.tokens[0]).toContain('[REDACTED');
      expect(scrubbed.tokens[1]).toContain('[REDACTED');
      expect(scrubbed.tokens[0]).not.toContain('ghp_123');
      expect(scrubbed.tokens[1]).not.toContain('sk-proj');
    });

    it('should redact multiple secrets in one string', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'DB: postgres://user:pass@host:5432/db and API: ghp_abc123def456ghi789jkl',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('pass');
      expect(result.result).not.toContain('ghp_abc');
    });

    it('should NOT scrub when scrubSecrets is disabled', async () => {
      const config: PolicyConfig = {
        scrubSecrets: false,
      };
      const disabledPipeline = new HookPipeline(config);

      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await disabledPipeline.runPostToolHooks(ctx);
      expect(result.result).toBe('Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz');
    });
  });

  describe('C. Pre-Commit Secret Scanner', () => {
    // TODO: Implement scanFileForSecrets() utility function
    // Expected signature: scanFileForSecrets(filePath: string): Promise<SecretMatch[]>
    // SecretMatch: { line: number, column: number, type: string, preview: string }

    it.todo('should detect secrets in markdown files');
    it.todo('should detect connection strings in .md files');
    it.todo('should detect API keys in .md files');
    it.todo('should return clean for files with no secrets');
    it.todo('should handle empty files gracefully');
    it.todo('should scan recursively through .squad/ directory structure');

    // Placeholder test to document expected API
    it('should export scanFileForSecrets utility', () => {
      // TODO: Uncomment when implemented
      // const { scanFileForSecrets } = await import('@bradygaster/squad-sdk/hooks');
      // expect(typeof scanFileForSecrets).toBe('function');
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('D. Integration Tests', () => {
    it('should block .env read and prevent data in output (full pipeline)', async () => {
      const config: PolicyConfig = {
        scrubSecrets: true,
      };
      const pipeline = new HookPipeline(config);

      // Agent attempts to read .env
      const preCtx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env' },
        agentName: 'scribe',
        sessionId: 'session-1',
      };

      const preResult = await pipeline.runPreToolHooks(preCtx);
      
      // Hook should block the read
      expect(preResult.action).toBe('block');
      expect(preResult.reason).toContain('.env');
      
      // No output should contain sensitive data because read was blocked
      expect(preResult.reason).not.toContain('mongodb://');
      expect(preResult.reason).not.toContain('ghp_');
    });

    it('should scrub secret from output if it somehow gets through (defense in depth)', async () => {
      const config: PolicyConfig = {
        scrubSecrets: true,
      };
      const pipeline = new HookPipeline(config);

      // Simulate a tool result that contains a secret (shouldn't happen with pre-hook, but defense in depth)
      const postCtx: PostToolUseContext = {
        toolName: 'view',
        arguments: { path: 'config.ts' },
        result: 'Database config:\nDB_URL=postgres://admin:secret@localhost:5432/prod\nDB_POOL_SIZE=10',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const postResult = await pipeline.runPostToolHooks(postCtx);
      
      // Secret should be redacted
      expect(postResult.result).toContain('[REDACTED');
      expect(postResult.result).not.toContain('secret');
      expect(postResult.result).not.toContain('postgres://admin:secret@');
      
      // Non-sensitive content should remain
      expect(postResult.result).toContain('DB_POOL_SIZE=10');
    });

    it('should enable secret hooks when scrubSecrets is true', async () => {
      const config: PolicyConfig = {
        scrubSecrets: true,
      };
      const pipeline = new HookPipeline(config);

      // Test that .env blocking is active
      const envReadCtx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const envResult = await pipeline.runPreToolHooks(envReadCtx);
      expect(envResult.action).toBe('block');

      // Test that secret scrubbing is active
      const secretCtx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const secretResult = await pipeline.runPostToolHooks(secretCtx);
      expect(secretResult.result).toContain('[REDACTED');
    });

    it('should disable secret hooks when scrubSecrets is false (backward compat)', async () => {
      const config: PolicyConfig = {
        scrubSecrets: false,
      };
      const pipeline = new HookPipeline(config);

      // .env reads should be allowed
      const envReadCtx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const envResult = await pipeline.runPreToolHooks(envReadCtx);
      expect(envResult.action).toBe('allow');

      // Secrets should not be scrubbed
      const secretCtx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const secretResult = await pipeline.runPostToolHooks(secretCtx);
      expect(secretResult.result).toBe('ghp_1234567890abcdefghijklmnopqrstuvwxyz');
    });

    it('should disable secret hooks by default (backward compat)', async () => {
      const config: PolicyConfig = {}; // No scrubSecrets specified
      const pipeline = new HookPipeline(config);

      const envReadCtx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.env' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(envReadCtx);
      expect(result.action).toBe('allow');
    });

    it('should work with other hooks (no interference)', async () => {
      const config: PolicyConfig = {
        scrubSecrets: true,
        scrubPii: true, // Both enabled
      };
      const pipeline = new HookPipeline(config);

      // Test email scrubbing still works
      const emailCtx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'Contact: admin@example.com',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const emailResult = await pipeline.runPostToolHooks(emailCtx);
      expect(emailResult.result).toContain('[EMAIL_REDACTED]');

      // Test secret scrubbing works
      const secretCtx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'Token: ghp_abc123',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const secretResult = await pipeline.runPostToolHooks(secretCtx);
      expect(secretResult.result).toContain('[REDACTED');
    });

    it('should scrub both PII and secrets in same content', async () => {
      const config: PolicyConfig = {
        scrubSecrets: true,
        scrubPii: true,
      };
      const pipeline = new HookPipeline(config);

      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'Contact john@example.com for token ghp_abc123def456',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toContain('[EMAIL_REDACTED]');
      expect(result.result).toContain('[REDACTED');
      expect(result.result).not.toContain('john@example.com');
      expect(result.result).not.toContain('ghp_abc123');
    });
  });

  describe('Edge Cases and Robustness', () => {
    let pipeline: HookPipeline;

    beforeEach(() => {
      const config: PolicyConfig = {
        scrubSecrets: true,
      };
      pipeline = new HookPipeline(config);
    });

    it('should handle null result gracefully', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: null,
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toBe(null);
    });

    it('should handle undefined result gracefully', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: undefined,
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toBe(undefined);
    });

    it('should handle empty string result', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: '',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toBe('');
    });

    it('should handle result with only whitespace', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: '   \n\t  ',
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toBe('   \n\t  ');
    });

    it('should handle case-insensitive .ENV filename', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.ENV' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should handle mixed case .Env.LOCAL', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'view',
        arguments: { path: '.Env.LOCAL' },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });

    it('should handle deeply nested secrets in objects', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: {
          level1: {
            level2: {
              level3: {
                level4: {
                  apiKey: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
                },
              },
            },
          },
        },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      const scrubbed = result.result as any;
      expect(scrubbed.level1.level2.level3.level4.apiKey).toContain('[REDACTED');
    });

    it('should preserve non-string types in objects', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: {
          count: 42,
          active: true,
          score: 3.14,
          nullable: null,
          secret: 'ghp_abc123',
        },
        agentName: 'test-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      const scrubbed = result.result as any;
      expect(scrubbed.count).toBe(42);
      expect(scrubbed.active).toBe(true);
      expect(scrubbed.score).toBe(3.14);
      expect(scrubbed.nullable).toBe(null);
      expect(scrubbed.secret).toContain('[REDACTED');
    });
  });
});
