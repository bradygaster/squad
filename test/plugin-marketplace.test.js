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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-plugin-test-'));
}

function cleanDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function initSquad(dir) {
  const result = runSquad([], dir);
  assert.equal(result.exitCode, 0, `init should succeed: ${result.stdout}`);
}

// Detect if the plugin subcommand falls through to default init (not implemented)
function isNotImplemented(result) {
  return result.stdout.includes('Squad is ready') ||
    result.stdout.includes('Squad is upgraded') ||
    result.stdout.includes('already exists');
}

function skipIfNotImplemented(t, result) {
  if (isNotImplemented(result)) {
    t.skip('plugin marketplace subcommand not yet implemented');
    return true;
  }
  return false;
}

describe('Plugin marketplace subcommands (#29)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    initSquad(tmpDir);
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  describe('squad plugin marketplace list', () => {
    it('returns empty when no marketplaces configured', (t) => {
      const result = runSquad(['plugin', 'marketplace', 'list'], tmpDir);
      if (skipIfNotImplemented(t, result)) return;
      assert.equal(result.exitCode, 0, `list should exit 0: ${result.stdout}`);
      assert.ok(
        result.stdout.trim() === '' ||
        result.stdout.toLowerCase().includes('no marketplace') ||
        result.stdout.toLowerCase().includes('none') ||
        result.stdout.toLowerCase().includes('empty') ||
        result.stdout.toLowerCase().includes('registered'),
        `list with no marketplaces should indicate empty state: "${result.stdout.trim()}"`
      );
    });
  });

  describe('squad plugin marketplace add', () => {
    it('registers a marketplace from github source', (t) => {
      const result = runSquad(['plugin', 'marketplace', 'add', 'github/awesome-copilot'], tmpDir);
      if (skipIfNotImplemented(t, result)) return;
      assert.equal(result.exitCode, 0, `add should succeed: ${result.stdout}`);
    });

    it('fails with error on invalid source (no slash)', (t) => {
      const result = runSquad(['plugin', 'marketplace', 'add', 'invalid-source'], tmpDir);
      if (skipIfNotImplemented(t, result)) return;
      assert.ok(
        result.exitCode !== 0 || result.stdout.toLowerCase().includes('invalid') || result.stdout.toLowerCase().includes('error'),
        `should reject invalid marketplace source: "${result.stdout.trim()}"`
      );
    });

    it('fails with error when no source argument provided', (t) => {
      const result = runSquad(['plugin', 'marketplace', 'add'], tmpDir);
      if (skipIfNotImplemented(t, result)) return;
      assert.notEqual(result.exitCode, 0, 'add with no source should fail');
    });
  });

  describe('full marketplace lifecycle: add, list, remove, list', () => {
    it('add, list, remove, list lifecycle works end-to-end', (t) => {
      const addResult = runSquad(['plugin', 'marketplace', 'add', 'github/awesome-copilot'], tmpDir);
      if (skipIfNotImplemented(t, addResult)) return;
      assert.equal(addResult.exitCode, 0, `add should succeed: ${addResult.stdout}`);

      const listResult = runSquad(['plugin', 'marketplace', 'list'], tmpDir);
      assert.equal(listResult.exitCode, 0, `list should succeed: ${listResult.stdout}`);
      assert.ok(
        listResult.stdout.includes('awesome-copilot'),
        `list should show registered marketplace: "${listResult.stdout.trim()}"`
      );

      const removeResult = runSquad(['plugin', 'marketplace', 'remove', 'awesome-copilot'], tmpDir);
      assert.equal(removeResult.exitCode, 0, `remove should succeed: ${removeResult.stdout}`);

      const listAfterRemove = runSquad(['plugin', 'marketplace', 'list'], tmpDir);
      assert.equal(listAfterRemove.exitCode, 0, `list should succeed: ${listAfterRemove.stdout}`);
      assert.ok(
        !listAfterRemove.stdout.includes('awesome-copilot'),
        `list should not show removed marketplace: "${listAfterRemove.stdout.trim()}"`
      );
    });
  });

  describe('squad plugin marketplace remove', () => {
    it('fails when removing nonexistent marketplace', (t) => {
      const result = runSquad(['plugin', 'marketplace', 'remove', 'nonexistent'], tmpDir);
      if (skipIfNotImplemented(t, result)) return;
      assert.ok(
        result.exitCode !== 0 ||
        result.stdout.toLowerCase().includes('not found') ||
        result.stdout.toLowerCase().includes('not registered') ||
        result.stdout.toLowerCase().includes('does not exist'),
        `should fail when removing nonexistent marketplace: "${result.stdout.trim()}"`
      );
    });

    it('fails when no marketplace name provided', (t) => {
      const result = runSquad(['plugin', 'marketplace', 'remove'], tmpDir);
      if (skipIfNotImplemented(t, result)) return;
      assert.notEqual(result.exitCode, 0, 'remove with no name should fail');
    });
  });

  describe('marketplace state persistence', () => {
    it('marketplace state persists in .ai-team/plugins/marketplaces.json', (t) => {
      const addResult = runSquad(['plugin', 'marketplace', 'add', 'github/awesome-copilot'], tmpDir);
      if (skipIfNotImplemented(t, addResult)) return;
      assert.equal(addResult.exitCode, 0);

      const stateFile = path.join(tmpDir, '.ai-team', 'plugins', 'marketplaces.json');
      assert.ok(fs.existsSync(stateFile), 'marketplaces.json should be created after add');

      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.ok(typeof state === 'object', 'marketplaces.json should contain a valid JSON object');

      const stateStr = JSON.stringify(state);
      assert.ok(
        stateStr.includes('awesome-copilot'),
        `state should contain the added marketplace: ${stateStr}`
      );
    });

    it('marketplace state file is valid JSON after add and remove', (t) => {
      const addResult = runSquad(['plugin', 'marketplace', 'add', 'github/awesome-copilot'], tmpDir);
      if (skipIfNotImplemented(t, addResult)) return;

      runSquad(['plugin', 'marketplace', 'remove', 'awesome-copilot'], tmpDir);

      const stateFile = path.join(tmpDir, '.ai-team', 'plugins', 'marketplaces.json');
      if (fs.existsSync(stateFile)) {
        assert.doesNotThrow(() => {
          JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        }, 'marketplaces.json should remain valid JSON after remove');
      }
    });
  });

  describe('marketplace browse', () => {
    it('fails when browsing nonexistent marketplace', (t) => {
      const result = runSquad(['plugin', 'marketplace', 'browse', 'nonexistent'], tmpDir);
      if (skipIfNotImplemented(t, result)) return;
      assert.ok(
        result.exitCode !== 0 ||
        result.stdout.toLowerCase().includes('not found') ||
        result.stdout.toLowerCase().includes('not registered'),
        `should fail when browsing nonexistent marketplace: "${result.stdout.trim()}"`
      );
    });
  });

  describe('plugin subcommand without marketplace', () => {
    it('squad plugin with no subcommand shows help or usage', (t) => {
      const result = runSquad(['plugin'], tmpDir);
      if (isNotImplemented(result)) {
        t.skip('plugin subcommand not yet implemented');
        return;
      }
      if (result.exitCode === 0) {
        assert.ok(
          result.stdout.toLowerCase().includes('plugin') ||
          result.stdout.toLowerCase().includes('marketplace') ||
          result.stdout.toLowerCase().includes('usage'),
          `plugin with no subcommand should show help: "${result.stdout.trim()}"`
        );
      }
    });
  });

  describe('multiple marketplace management', () => {
    it('can add multiple marketplaces', (t) => {
      const add1 = runSquad(['plugin', 'marketplace', 'add', 'github/awesome-copilot'], tmpDir);
      if (skipIfNotImplemented(t, add1)) return;
      assert.equal(add1.exitCode, 0);

      const add2 = runSquad(['plugin', 'marketplace', 'add', 'anthropics/skills'], tmpDir);
      assert.equal(add2.exitCode, 0, `second add should succeed: ${add2.stdout}`);

      const listResult = runSquad(['plugin', 'marketplace', 'list'], tmpDir);
      assert.equal(listResult.exitCode, 0);
      assert.ok(listResult.stdout.includes('awesome-copilot'), 'should show first marketplace');
      assert.ok(listResult.stdout.includes('anthropic'), 'should show second marketplace');
    });

    it('adding duplicate marketplace is handled gracefully', (t) => {
      const add1 = runSquad(['plugin', 'marketplace', 'add', 'github/awesome-copilot'], tmpDir);
      if (skipIfNotImplemented(t, add1)) return;

      const add2 = runSquad(['plugin', 'marketplace', 'add', 'github/awesome-copilot'], tmpDir);
      assert.ok(
        add2.exitCode === 0 ||
        add2.stdout.toLowerCase().includes('already') ||
        add2.stdout.toLowerCase().includes('exists'),
        `duplicate add should be handled gracefully: "${add2.stdout.trim()}"`
      );
    });
  });
});
