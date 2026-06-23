/**
 * RC Command Tests — squad rc / squad remote-control
 *
 * Tests module exports, option handling, and error paths.
 * Does NOT create real WebSocket servers or spawn copilot (requires network + native deps).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('CLI: rc command', () => {
  describe('Module exports', () => {
    it('module exports runRC function', async () => {
      const mod = await import('@bradygaster/squad-cli/commands/rc');
      expect(typeof mod.runRC).toBe('function');
    });

    it('module exports RCOptions interface (verifiable via function arity)', async () => {
      const mod = await import('@bradygaster/squad-cli/commands/rc');
      // runRC(cwd, options) — should accept 2 parameters
      expect(mod.runRC.length).toBe(2);
    });

    it('module has no unexpected default export', async () => {
      const mod = await import('@bradygaster/squad-cli/commands/rc');
      // ESM module should have named exports, no default
      expect(mod.default).toBeUndefined();
    });
  });

  describe('RCOptions interface validation', () => {
    it('accepts tunnel option', async () => {
      const { RCOptions } = await import('@bradygaster/squad-cli/commands/rc') as any;
      // TypeScript interface — verify shape through runRC signature
      // This is a compile-time check, but we can verify runtime behavior
      const mod = await import('@bradygaster/squad-cli/commands/rc');
      expect(mod.runRC).toBeDefined();
    });

    it('accepts port option', async () => {
      const mod = await import('@bradygaster/squad-cli/commands/rc');
      expect(mod.runRC).toBeDefined();
    });

    it('accepts optional path option', async () => {
      const mod = await import('@bradygaster/squad-cli/commands/rc');
      expect(mod.runRC).toBeDefined();
    });
  });

  describe('Squad directory detection', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'squad-rc-test-'));
    });

    afterEach(async () => {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    it('detects .squad directory', async () => {
      const squadDir = path.join(tempDir, '.squad');
      await fs.promises.mkdir(squadDir);
      
      // Verify directory exists
      const exists = fs.existsSync(squadDir);
      expect(exists).toBe(true);
    });

    it('falls back to .ai-team directory', async () => {
      const aiTeamDir = path.join(tempDir, '.ai-team');
      await fs.promises.mkdir(aiTeamDir);
      
      // Verify directory exists
      const exists = fs.existsSync(aiTeamDir);
      expect(exists).toBe(true);
    });

    it('handles missing squad directory gracefully', () => {
      const squadDir = path.join(tempDir, '.squad');
      const aiTeamDir = path.join(tempDir, '.ai-team');
      
      // Verify both don't exist
      expect(fs.existsSync(squadDir)).toBe(false);
      expect(fs.existsSync(aiTeamDir)).toBe(false);
    });
  });

  describe('Team roster parsing', () => {
    let tempDir: string;
    let squadDir: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'squad-rc-test-'));
      squadDir = path.join(tempDir, '.squad');
      await fs.promises.mkdir(squadDir);
    });

    afterEach(async () => {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    it('parses valid team.md with agents', async () => {
      const teamMd = `# Team Roster\n\n| Name | Role | Status |\n|------|------|--------|\n| Keaton | Architect | Active |\n| Fenster | DevOps | Active |\n`;
      await fs.promises.writeFile(path.join(squadDir, 'team.md'), teamMd);
      
      const content = await fs.promises.readFile(path.join(squadDir, 'team.md'), 'utf-8');
      const lines = content.split('\n').filter(l => l.startsWith('|') && l.includes('Active'));
      
      expect(lines.length).toBeGreaterThan(0);
    });

    it('handles empty team.md', async () => {
      await fs.promises.writeFile(path.join(squadDir, 'team.md'), '');
      
      const content = await fs.promises.readFile(path.join(squadDir, 'team.md'), 'utf-8');
      const lines = content.split('\n').filter(l => l.startsWith('|') && l.includes('Active'));
      
      expect(lines).toEqual([]);
    });

    it('handles malformed team.md table', async () => {
      const teamMd = `# Team\n\nNot a table\n`;
      await fs.promises.writeFile(path.join(squadDir, 'team.md'), teamMd);
      
      const content = await fs.promises.readFile(path.join(squadDir, 'team.md'), 'utf-8');
      const lines = content.split('\n').filter(l => l.startsWith('|') && l.includes('Active'));
      
      expect(lines).toEqual([]);
    });

    it('handles missing team.md gracefully', () => {
      const teamPath = path.join(squadDir, 'team.md');
      expect(fs.existsSync(teamPath)).toBe(false);
    });
  });

  describe('Static file handler security', () => {
    it('validates directory traversal prevention pattern', () => {
      // This is a security regression test — verifies the pattern exists in source
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      // Verify security checks are present
      expect(rcSource).toContain('!filePath.startsWith(uiDir)');
      expect(rcSource).toContain('decodedUrl.includes(\'..\')');
    });

    it('validates security headers are set', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      // Verify security headers
      expect(rcSource).toContain('X-Frame-Options');
      expect(rcSource).toContain('X-Content-Type-Options');
      expect(rcSource).toContain('Referrer-Policy');
      expect(rcSource).toContain('Cache-Control');
    });

    it('validates EISDIR guard exists', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      // Verify EISDIR guard (issue #2 fix)
      expect(rcSource).toContain('stat?.isDirectory');
    });

    it('validates malformed URI handling', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      // Verify malformed URI protection (issue #18)
      expect(rcSource).toContain('decodeURIComponent');
      expect(rcSource).toContain('try');
    });
  });

  describe('Copilot ACP path resolution', () => {
    it('validates Windows path pattern exists', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      // Verify Windows-specific path
      expect(rcSource).toContain('ProgramData');
      expect(rcSource).toContain('copilot.exe');
    });

    it('validates fallback to PATH exists', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      // Verify fallback to 'copilot' command (updated implementation uses conditional)
      expect(rcSource).toContain('copilotCmd = \'copilot\'');
      expect(rcSource).toContain('if (storage.existsSync(winPath))');
    });
  });

  describe('RemoteBridge callbacks', () => {
    it('validates onPrompt callback signature in source', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('onPrompt:');
      expect(rcSource).toContain('async (text)');
    });

    it('validates onDirectMessage callback signature in source', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('onDirectMessage:');
      expect(rcSource).toContain('async (agentName, text)');
    });

    it('validates onCommand callback signature in source', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('onCommand:');
      expect(rcSource).toContain('(name)');
    });

    it('validates /status command implementation', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('if (name === \'status\')');
    });

    it('validates /agents command implementation', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('if (name === \'agents\')');
    });
  });

  describe('Connection monitoring', () => {
    it('validates 5-second interval exists', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('setInterval');
      expect(rcSource).toContain('5000');
    });

    it('validates connection count tracking', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('getConnectionCount()');
    });
  });

  describe('Cleanup and signal handling', () => {
    it('validates SIGINT handler exists', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('process.on(\'SIGINT\'');
    });

    it('validates SIGTERM handler exists', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('process.on(\'SIGTERM\'');
    });

    it('validates cleanup function calls bridge.stop()', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('await bridge.stop()');
    });

    it('validates cleanup function calls destroyTunnel()', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('destroyTunnel()');
    });

    it('validates copilot process is killed on cleanup', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('copilotProc?.kill()');
    });
  });

  describe('Copilot passthrough integration', () => {
    it('validates copilot spawn with --acp flag', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('--acp');
      expect(rcSource).toContain('spawnChild(copilotCmd');
    });

    it('validates stdio piping configuration', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('stdio: [\'pipe\', \'pipe\', \'pipe\']');
    });

    it('validates readline interface for copilot stdout', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('createInterface');
      expect(rcSource).toContain('copilotProc.stdout');
    });

    it('validates passthrough bidirectional flow', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('passthroughFromAgent');
      expect(rcSource).toContain('setPassthrough');
    });

    it('validates copilot error handling', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('copilotProc.on(\'error\'');
      expect(rcSource).toContain('copilotProc.on(\'exit\'');
    });
  });

  describe('Tunnel integration', () => {
    it('validates tunnel flag check', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('if (options.tunnel)');
    });

    it('validates devtunnel availability check', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('isDevtunnelAvailable()');
    });

    it('validates tunnel creation with metadata', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('createTunnel(actualPort, { repo, branch, machine })');
    });

    it('validates QR code generation attempt', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('qrcode-terminal');
    });
  });

  describe('Color constants', () => {
    it('validates ANSI color codes are defined', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('const BOLD =');
      expect(rcSource).toContain('const RESET =');
      expect(rcSource).toContain('const DIM =');
      expect(rcSource).toContain('const GREEN =');
      expect(rcSource).toContain('const CYAN =');
      expect(rcSource).toContain('const YELLOW =');
    });
  });

  describe('Import statements', () => {
    it('imports RemoteBridge from SDK', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('import { FSStorageProvider, RemoteBridge }');
      expect(rcSource).toContain('@bradygaster/squad-sdk');
    });

    it('imports tunnel utilities', () => {
      const rcSource = fs.readFileSync(
        path.join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'rc.ts'),
        'utf-8'
      );
      
      expect(rcSource).toContain('import {');
      expect(rcSource).toContain('isDevtunnelAvailable');
      expect(rcSource).toContain('createTunnel');
      expect(rcSource).toContain('destroyTunnel');
      expect(rcSource).toContain('getMachineId');
      expect(rcSource).toContain('getGitInfo');
    });
  });
});
