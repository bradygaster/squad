const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const CLI = path.join(__dirname, '..', 'index.js');

function runSquad(args, cwd) {
  try {
    const result = execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { stdout: result, exitCode: 0 };
  } catch (err) {
    return {
      stdout: (err.stdout || '') + (err.stderr || ''),
      exitCode: err.status ?? 1,
    };
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-mcp-test-'));
}

function cleanDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

describe('MCP config handling (#11)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  describe('squad init with MCP config', () => {
    it('squad init succeeds when .copilot/ directory does not exist', () => {
      assert.ok(!fs.existsSync(path.join(tmpDir, '.copilot')));
      const result = runSquad([], tmpDir);
      assert.equal(result.exitCode, 0, `init should succeed without .copilot/: ${result.stdout}`);
    });

    it('squad init succeeds when .copilot/ directory already exists', () => {
      fs.mkdirSync(path.join(tmpDir, '.copilot'), { recursive: true });
      const result = runSquad([], tmpDir);
      assert.equal(result.exitCode, 0, `init should succeed with existing .copilot/: ${result.stdout}`);
    });

    it('squad init succeeds when .copilot/mcp-config.json already exists', () => {
      const copilotDir = path.join(tmpDir, '.copilot');
      fs.mkdirSync(copilotDir, { recursive: true });
      const userConfig = { mcpServers: { trello: { command: 'npx', args: ['trello-mcp'] } } };
      fs.writeFileSync(path.join(copilotDir, 'mcp-config.json'), JSON.stringify(userConfig));

      const result = runSquad([], tmpDir);
      assert.equal(result.exitCode, 0, `init should succeed with existing mcp config: ${result.stdout}`);

      // Verify existing config was not clobbered
      const preserved = JSON.parse(fs.readFileSync(path.join(copilotDir, 'mcp-config.json'), 'utf8'));
      assert.deepEqual(preserved.mcpServers.trello, userConfig.mcpServers.trello,
        'User MCP config should not be overwritten by init');
    });

    it('if init creates mcp-config.json sample, it must be valid JSON', () => {
      const result = runSquad([], tmpDir);
      assert.equal(result.exitCode, 0);

      const mcpConfigPath = path.join(tmpDir, '.copilot', 'mcp-config.json');
      if (fs.existsSync(mcpConfigPath)) {
        assert.doesNotThrow(() => {
          JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
        }, 'mcp-config.json created by init must be valid JSON');
      }
    });
  });

  describe('MCP config validation', () => {
    it('squad runs correctly when .copilot/mcp-config.json has valid config', () => {
      runSquad([], tmpDir);

      const copilotDir = path.join(tmpDir, '.copilot');
      fs.mkdirSync(copilotDir, { recursive: true });
      const validConfig = {
        mcpServers: {
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'test-token' }
          }
        }
      };
      fs.writeFileSync(path.join(copilotDir, 'mcp-config.json'), JSON.stringify(validConfig, null, 2));

      const result = runSquad(['upgrade'], tmpDir);
      assert.equal(result.exitCode, 0, `upgrade should work with MCP config present: ${result.stdout}`);
    });

    it('squad runs correctly when .copilot/mcp-config.json is empty object', () => {
      runSquad([], tmpDir);

      const copilotDir = path.join(tmpDir, '.copilot');
      fs.mkdirSync(copilotDir, { recursive: true });
      fs.writeFileSync(path.join(copilotDir, 'mcp-config.json'), '{}');

      const result = runSquad(['upgrade'], tmpDir);
      assert.equal(result.exitCode, 0, `upgrade should work with empty MCP config: ${result.stdout}`);
    });

    it('squad does not crash when .copilot/ contains non-JSON files', () => {
      runSquad([], tmpDir);

      const copilotDir = path.join(tmpDir, '.copilot');
      fs.mkdirSync(copilotDir, { recursive: true });
      fs.writeFileSync(path.join(copilotDir, 'mcp-config.json'), 'not valid json {{{');

      const result = runSquad(['upgrade'], tmpDir);
      assert.equal(result.exitCode, 0, `upgrade should not crash on invalid mcp-config.json: ${result.stdout}`);
    });
  });

  describe('MCP config directory edge cases', () => {
    it('gracefully handles read-only .copilot/ directory', () => {
      runSquad([], tmpDir);
      const result = runSquad(['--version'], tmpDir);
      assert.equal(result.exitCode, 0);
    });

    it('squad help works regardless of MCP config presence', () => {
      const result = runSquad(['help'], tmpDir);
      assert.equal(result.exitCode, 0);
      assert.ok(result.stdout.includes('squad'), 'help should display squad info');
    });

    it('squad --version works regardless of MCP config presence', () => {
      const result = runSquad(['--version'], tmpDir);
      assert.equal(result.exitCode, 0);
      assert.match(result.stdout.trim(), /^Package: \d+\.\d+\.\d+/, 'should output package version');
    });
  });
});
