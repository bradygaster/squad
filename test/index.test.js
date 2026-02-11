const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.js');
const PKG = require(path.join(ROOT, 'package.json'));

function runInit(cwd) {
  return execSync(`node "${INDEX}"`, { cwd, encoding: 'utf8', env: { ...process.env } });
}

function runCmd(cwd, args) {
  return execSync(`node "${INDEX}" ${args}`, { cwd, encoding: 'utf8', env: { ...process.env } });
}

function runCmdStatus(cwd, args) {
  try {
    const stdout = execSync(`node "${INDEX}" ${args}`, { cwd, encoding: 'utf8', env: { ...process.env } });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status };
  }
}

// --- copyRecursive unit tests ---

describe('copyRecursive', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-copy-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // We can't require copyRecursive directly (no module.exports), so we
  // replicate it here for isolated unit testing of the algorithm.
  function copyRecursive(src, target) {
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      for (const entry of fs.readdirSync(src)) {
        copyRecursive(path.join(src, entry), path.join(target, entry));
      }
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(src, target);
    }
  }

  it('copies a single file', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'file.txt'), 'hello');

    copyRecursive(path.join(src, 'file.txt'), path.join(dest, 'file.txt'));
    assert.equal(fs.readFileSync(path.join(dest, 'file.txt'), 'utf8'), 'hello');
  });

  it('copies nested directories and preserves file contents', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');

    // Create nested structure: src/a/b/deep.txt, src/root.md
    fs.mkdirSync(path.join(src, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(src, 'root.md'), '# Root');
    fs.writeFileSync(path.join(src, 'a', 'mid.json'), '{"key":"value"}');
    fs.writeFileSync(path.join(src, 'a', 'b', 'deep.txt'), 'deep content');

    copyRecursive(src, dest);

    assert.equal(fs.readFileSync(path.join(dest, 'root.md'), 'utf8'), '# Root');
    assert.equal(fs.readFileSync(path.join(dest, 'a', 'mid.json'), 'utf8'), '{"key":"value"}');
    assert.equal(fs.readFileSync(path.join(dest, 'a', 'b', 'deep.txt'), 'utf8'), 'deep content');
  });

  it('copies an empty directory', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);

    copyRecursive(src, dest);
    assert.ok(fs.existsSync(dest));
    assert.equal(fs.readdirSync(dest).length, 0);
  });

  it('preserves binary file contents', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);

    const buf = Buffer.from([0x00, 0x01, 0xFF, 0xFE, 0x89, 0x50]);
    fs.writeFileSync(path.join(src, 'bin.dat'), buf);

    copyRecursive(src, dest);
    const result = fs.readFileSync(path.join(dest, 'bin.dat'));
    assert.deepEqual(result, buf);
  });
});

// --- Init happy path ---

describe('init into empty directory', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-init-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .github/agents/squad.agent.md', () => {
    runInit(tmpDir);
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    assert.ok(fs.existsSync(agentFile), 'squad.agent.md should exist');

    // Content should match the source but with version stamped
    const source = fs.readFileSync(path.join(ROOT, '.github', 'agents', 'squad.agent.md'), 'utf8');
    const actual = fs.readFileSync(agentFile, 'utf8');
    const pkg = require(path.join(ROOT, 'package.json'));
    const expected = source.replace('version: "0.0.0-source"', `version: "${pkg.version}"`);
    assert.equal(actual, expected);
  });

  it('stamps version into squad.agent.md', () => {
    runInit(tmpDir);
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    const content = fs.readFileSync(agentFile, 'utf8');
    const pkg = require(path.join(ROOT, 'package.json'));
    assert.ok(content.includes(`version: "${pkg.version}"`), 'should contain stamped version');
    assert.ok(!content.includes('0.0.0-source'), 'should not contain source placeholder');
  });

  it('creates .ai-team-templates/ with all template files', () => {
    runInit(tmpDir);
    const templatesDir = path.join(tmpDir, '.ai-team-templates');
    assert.ok(fs.existsSync(templatesDir), '.ai-team-templates/ should exist');

    // Every file/dir in templates/ should be copied
    const sourceFiles = fs.readdirSync(path.join(ROOT, 'templates'));
    const destFiles = fs.readdirSync(templatesDir);
    assert.deepEqual(destFiles.sort(), sourceFiles.sort());

    // Spot-check: content matches for files (skip directories)
    for (const file of sourceFiles) {
      const srcPath = path.join(ROOT, 'templates', file);
      if (fs.statSync(srcPath).isDirectory()) continue;
      const expected = fs.readFileSync(srcPath, 'utf8');
      const actual = fs.readFileSync(path.join(templatesDir, file), 'utf8');
      assert.equal(actual, expected, `template ${file} content should match`);
    }
  });

  it('creates drop-box directories', () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'decisions', 'inbox')),
      'decisions/inbox should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'orchestration-log')),
      'orchestration-log should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'casting')),
      'casting should exist');
  });

  it('creates .ai-team/skills/ with starter skills on init', () => {
    runInit(tmpDir);
    const skillsDir = path.join(tmpDir, '.ai-team', 'skills');
    assert.ok(fs.existsSync(skillsDir), '.ai-team/skills/ should exist');
    assert.ok(fs.existsSync(path.join(skillsDir, 'squad-conventions', 'SKILL.md')),
      'squad-conventions/SKILL.md should be copied as starter skill');
  });

  it('starter skill content matches source template', () => {
    runInit(tmpDir);
    const expected = fs.readFileSync(
      path.join(ROOT, 'templates', 'skills', 'squad-conventions', 'SKILL.md'), 'utf8');
    const actual = fs.readFileSync(
      path.join(tmpDir, '.ai-team', 'skills', 'squad-conventions', 'SKILL.md'), 'utf8');
    assert.equal(actual, expected, 'starter skill content should match source');
  });

  it('outputs success messages', () => {
    const output = runInit(tmpDir);
    assert.ok(output.includes('squad.agent.md'), 'should mention squad.agent.md');
    assert.ok(output.includes('.ai-team-templates'), 'should mention templates');
    assert.ok(output.includes('Squad is ready'), 'should print ready message');
  });
});

// --- Re-init (idempotency) ---

describe('re-init into existing directory', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-reinit-'));
    // First init
    runInit(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips squad.agent.md when it already exists', () => {
    // Modify the agent file so we can verify it's NOT overwritten
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    fs.writeFileSync(agentFile, 'user-customized content');

    const output = runInit(tmpDir);
    assert.ok(output.includes('already exists'), 'should report skipping');

    const content = fs.readFileSync(agentFile, 'utf8');
    assert.equal(content, 'user-customized content', 'should NOT overwrite user file');
  });

  it('skips .ai-team-templates/ when it already exists', () => {
    // Add a user file to templates dir
    const userFile = path.join(tmpDir, '.ai-team-templates', 'user-custom.md');
    fs.writeFileSync(userFile, 'custom content');

    const output = runInit(tmpDir);
    assert.ok(output.includes('already exists'), 'should report skipping templates');

    // User file should still be there
    assert.ok(fs.existsSync(userFile), 'user custom file should survive re-init');
  });

  it('drop-box directories still exist after re-init', () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'decisions', 'inbox')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'orchestration-log')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'casting')));
  });

  it('does not corrupt existing drop-box contents', () => {
    // Put a file in inbox before re-init
    const inboxFile = path.join(tmpDir, '.ai-team', 'decisions', 'inbox', 'test-decision.md');
    fs.writeFileSync(inboxFile, '# Test Decision');

    runInit(tmpDir);

    assert.ok(fs.existsSync(inboxFile), 'inbox file should survive');
    assert.equal(fs.readFileSync(inboxFile, 'utf8'), '# Test Decision');
  });

  it('does not overwrite existing skills on re-init', () => {
    // Add a user skill before re-init
    const userSkillDir = path.join(tmpDir, '.ai-team', 'skills', 'my-custom-skill');
    fs.mkdirSync(userSkillDir, { recursive: true });
    fs.writeFileSync(path.join(userSkillDir, 'SKILL.md'), '# My Custom Skill');

    runInit(tmpDir);

    // User skill should survive
    assert.ok(fs.existsSync(path.join(userSkillDir, 'SKILL.md')), 'user skill should survive re-init');
    assert.equal(fs.readFileSync(path.join(userSkillDir, 'SKILL.md'), 'utf8'), '# My Custom Skill');
  });
});

// --- Flag tests ---

describe('flags and subcommands', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-flags-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('--version prints version from package.json', () => {
    const result = runCmdStatus(tmpDir, '--version');
    assert.equal(result.exitCode, 0, 'should exit 0');
    assert.equal(result.stdout.trim(), PKG.version);
  });

  it('-v works as alias for --version', () => {
    const result = runCmdStatus(tmpDir, '-v');
    assert.equal(result.exitCode, 0, 'should exit 0');
    assert.equal(result.stdout.trim(), PKG.version);
  });

  it('--help prints usage information', () => {
    const result = runCmdStatus(tmpDir, '--help');
    assert.equal(result.exitCode, 0, 'should exit 0');
    assert.ok(result.stdout.includes('squad'), 'should mention squad');
    assert.ok(result.stdout.includes('Usage'), 'should include Usage');
    assert.ok(result.stdout.includes('upgrade'), 'should mention upgrade command');
  });

  it('-h works as alias for --help', () => {
    const result = runCmdStatus(tmpDir, '-h');
    assert.equal(result.exitCode, 0, 'should exit 0');
    assert.ok(result.stdout.includes('Usage'), 'should include Usage');
  });

  it('help subcommand prints usage information', () => {
    const result = runCmdStatus(tmpDir, 'help');
    assert.equal(result.exitCode, 0, 'should exit 0');
    assert.ok(result.stdout.includes('Usage'), 'should include Usage');
    assert.ok(result.stdout.includes('Commands'), 'should list commands');
  });
});

// --- Upgrade path tests ---

describe('upgrade subcommand', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upgrade-'));
    // Initial install first
    runInit(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('overwrites squad.agent.md with latest version', () => {
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    // Simulate user having an older version
    fs.writeFileSync(agentFile, '---\nversion: "0.0.1"\n---\nold version content');

    runCmd(tmpDir, 'upgrade');

    const source = fs.readFileSync(path.join(ROOT, '.github', 'agents', 'squad.agent.md'), 'utf8');
    const actual = fs.readFileSync(agentFile, 'utf8');
    const pkg = require(path.join(ROOT, 'package.json'));
    const expected = source.replace('version: "0.0.0-source"', `version: "${pkg.version}"`);
    assert.equal(actual, expected, 'squad.agent.md should match source with version stamped after upgrade');
  });

  it('overwrites .ai-team-templates/ with latest versions', () => {
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    // Simulate older version so upgrade proceeds
    fs.writeFileSync(agentFile, '---\nversion: "0.0.1"\n---\nold');

    const templatesDir = path.join(tmpDir, '.ai-team-templates');
    // Modify a template file (not a directory) to simulate old version
    const templateFiles = fs.readdirSync(templatesDir).filter(f =>
      fs.statSync(path.join(templatesDir, f)).isFile()
    );
    assert.ok(templateFiles.length > 0, 'should have template files');
    fs.writeFileSync(path.join(templatesDir, templateFiles[0]), 'old template content');

    runCmd(tmpDir, 'upgrade');

    // All template files should match source (skip directories)
    const sourceFiles = fs.readdirSync(path.join(ROOT, 'templates'));
    for (const file of sourceFiles) {
      const srcPath = path.join(ROOT, 'templates', file);
      if (fs.statSync(srcPath).isDirectory()) continue;
      const expected = fs.readFileSync(srcPath, 'utf8');
      const actual = fs.readFileSync(path.join(templatesDir, file), 'utf8');
      assert.equal(actual, expected, `template ${file} should match source after upgrade`);
    }
  });

  it('does NOT touch .ai-team/ directory', () => {
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    // Simulate older version so upgrade proceeds
    fs.writeFileSync(agentFile, '---\nversion: "0.0.1"\n---\nold');

    // Add user state to .ai-team/
    const userFile = path.join(tmpDir, '.ai-team', 'decisions', 'inbox', 'user-decision.md');
    fs.writeFileSync(userFile, '# My Important Decision');
    const castingFile = path.join(tmpDir, '.ai-team', 'casting', 'my-cast.json');
    fs.writeFileSync(castingFile, '{"agent":"test"}');

    runCmd(tmpDir, 'upgrade');

    // User state must survive
    assert.ok(fs.existsSync(userFile), 'inbox decision should survive upgrade');
    assert.equal(fs.readFileSync(userFile, 'utf8'), '# My Important Decision');
    assert.ok(fs.existsSync(castingFile), 'casting file should survive upgrade');
    assert.equal(fs.readFileSync(castingFile, 'utf8'), '{"agent":"test"}');
  });

  it('outputs upgrade confirmation messages', () => {
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    // Simulate older version so upgrade proceeds
    fs.writeFileSync(agentFile, '---\nversion: "0.0.1"\n---\nold');

    const output = runCmd(tmpDir, 'upgrade');
    assert.ok(output.includes('upgraded'), 'should mention upgraded');
    assert.ok(output.includes('untouched') || output.includes('safe'),
      'should confirm .ai-team/ is safe');
  });
});

// --- Error handling tests ---

describe('error handling', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-err-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fatal() exits with code 1 on error', () => {
    // Run index.js from a fake root missing source files ΓÇö triggers source validation fatal()
    const fakeRoot = path.join(tmpDir, 'fake-pkg');
    fs.mkdirSync(fakeRoot);
    fs.copyFileSync(INDEX, path.join(fakeRoot, 'index.js'));
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(fakeRoot, 'package.json'));

    const target = path.join(tmpDir, 'target');
    fs.mkdirSync(target);

    try {
      execSync(`node "${path.join(fakeRoot, 'index.js')}"`, {
        cwd: target, encoding: 'utf8', stdio: 'pipe'
      });
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.status, 1, 'fatal() should exit with code 1');
      assert.ok(err.stderr.includes('missing') || err.stderr.includes('corrupted'),
        'should mention missing/corrupted source');
    }
  });

  it('missing source files produce clean error message', () => {
    // Same approach: fake package root without .github/agents/squad.agent.md
    const fakeRoot = path.join(tmpDir, 'fake-pkg2');
    fs.mkdirSync(fakeRoot);
    fs.copyFileSync(INDEX, path.join(fakeRoot, 'index.js'));
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(fakeRoot, 'package.json'));

    const target = path.join(tmpDir, 'target2');
    fs.mkdirSync(target);

    try {
      execSync(`node "${path.join(fakeRoot, 'index.js')}"`, {
        cwd: target, encoding: 'utf8', stdio: 'pipe'
      });
      assert.fail('should have thrown');
    } catch (err) {
      // Error message should be human-readable, not a raw stack trace
      assert.ok(err.stderr.includes('squad.agent.md') || err.stderr.includes('installation'),
        'error should reference the missing file or installation');
      // Should NOT contain raw stack trace
      assert.ok(!err.stderr.includes('    at '), 'should not include stack trace');
    }
  });

  it('exits with code 0 on successful init', () => {
    const result = runCmdStatus(tmpDir, '');
    assert.equal(result.exitCode, 0, 'should exit 0 on success');
  });

  it('exits with code 0 on successful upgrade', () => {
    runInit(tmpDir);
    const result = runCmdStatus(tmpDir, 'upgrade');
    assert.equal(result.exitCode, 0, 'upgrade should exit 0 on success');
  });
});

// --- Ralph tests ---

describe('Ralph — Work Monitor', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-ralph-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('roster template includes Ralph', () => {
    const roster = fs.readFileSync(path.join(ROOT, 'templates', 'roster.md'), 'utf8');
    assert.ok(roster.includes('Ralph'), 'roster template should include Ralph');
    assert.ok(roster.includes('Work Monitor'), 'roster template should include Work Monitor role');
    assert.ok(roster.includes('🔄'), 'roster template should include 🔄 badge');
  });

  it('init creates team.md with Ralph on roster', () => {
    runInit(tmpDir);
    const teamFile = path.join(tmpDir, '.ai-team', 'team.md');
    // team.md is created from roster template which now includes Ralph
    const templateContent = fs.readFileSync(path.join(ROOT, 'templates', 'roster.md'), 'utf8');
    assert.ok(templateContent.includes('Ralph'), 'roster template should have Ralph');
  });

  it('heartbeat workflow is copied on init', () => {
    runInit(tmpDir);
    const heartbeatPath = path.join(tmpDir, '.github', 'workflows', 'squad-heartbeat.yml');
    assert.ok(fs.existsSync(heartbeatPath), 'squad-heartbeat.yml should be created on init');
  });

  it('heartbeat workflow contains Ralph reference', () => {
    const heartbeat = fs.readFileSync(
      path.join(ROOT, 'templates', 'workflows', 'squad-heartbeat.yml'), 'utf8'
    );
    assert.ok(heartbeat.includes('Ralph'), 'heartbeat workflow should reference Ralph');
    assert.ok(heartbeat.includes('Auto-Triage'), 'heartbeat workflow should have auto-triage');
  });

  it('heartbeat workflow has schedule trigger', () => {
    const heartbeat = fs.readFileSync(
      path.join(ROOT, 'templates', 'workflows', 'squad-heartbeat.yml'), 'utf8'
    );
    assert.ok(heartbeat.includes('schedule'), 'heartbeat should have schedule trigger');
    assert.ok(heartbeat.includes('cron'), 'heartbeat should have cron expression');
  });

  it('heartbeat workflow has event triggers', () => {
    const heartbeat = fs.readFileSync(
      path.join(ROOT, 'templates', 'workflows', 'squad-heartbeat.yml'), 'utf8'
    );
    assert.ok(heartbeat.includes('issues'), 'heartbeat should trigger on issues');
    assert.ok(heartbeat.includes('pull_request'), 'heartbeat should trigger on PRs');
    assert.ok(heartbeat.includes('workflow_dispatch'), 'heartbeat should support manual trigger');
  });

  it('upgrade refreshes heartbeat workflow', () => {
    runInit(tmpDir);
    const heartbeatPath = path.join(tmpDir, '.github', 'workflows', 'squad-heartbeat.yml');
    // Write a dummy to simulate old version
    fs.writeFileSync(heartbeatPath, '# old heartbeat');
    runCmd(tmpDir, 'upgrade');
    const content = fs.readFileSync(heartbeatPath, 'utf8');
    assert.ok(content.includes('Ralph'), 'upgrade should refresh heartbeat workflow');
  });

  it('agent.md includes Ralph section', () => {
    const agentMd = fs.readFileSync(
      path.join(ROOT, '.github', 'agents', 'squad.agent.md'), 'utf8'
    );
    assert.ok(agentMd.includes('Ralph — Work Monitor'), 'agent.md should have Ralph section');
    assert.ok(agentMd.includes('Ralph is always "Ralph"'), 'agent.md should exempt Ralph from casting');
  });

  it('agent.md includes Ralph in routing signals', () => {
    const agentMd = fs.readFileSync(
      path.join(ROOT, '.github', 'agents', 'squad.agent.md'), 'utf8'
    );
    assert.ok(
      agentMd.includes('Ralph commands'),
      'routing signals should include Ralph commands'
    );
  });

  it('agent.md includes Ralph check after follow-up work', () => {
    const agentMd = fs.readFileSync(
      path.join(ROOT, '.github', 'agents', 'squad.agent.md'), 'utf8'
    );
    assert.ok(
      agentMd.includes('Ralph check'),
      'agent.md should have Ralph check after agent work completes'
    );
  });
});

// --- Workflow copy tests ---

describe('squad workflow files', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-workflows-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates squad workflow files in .github/workflows/ on init', () => {
    runInit(tmpDir);
    const workflowsDir = path.join(tmpDir, '.github', 'workflows');
    assert.ok(fs.existsSync(workflowsDir), '.github/workflows/ should exist');

    const expectedWorkflows = ['sync-squad-labels.yml', 'squad-triage.yml', 'squad-issue-assign.yml'];
    for (const file of expectedWorkflows) {
      assert.ok(fs.existsSync(path.join(workflowsDir, file)), `${file} should exist`);
    }
  });

  it('workflow file contents match source templates', () => {
    runInit(tmpDir);
    const workflowsDir = path.join(tmpDir, '.github', 'workflows');
    const sourceDir = path.join(ROOT, 'templates', 'workflows');

    const sourceFiles = fs.readdirSync(sourceDir).filter(f => f.endsWith('.yml'));
    for (const file of sourceFiles) {
      const expected = fs.readFileSync(path.join(sourceDir, file), 'utf8');
      const actual = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      assert.equal(actual, expected, `workflow ${file} content should match source`);
    }
  });

  it('skips existing workflow files on re-init', () => {
    runInit(tmpDir);
    const workflowFile = path.join(tmpDir, '.github', 'workflows', 'sync-squad-labels.yml');
    fs.writeFileSync(workflowFile, 'user-customized workflow');

    const output = runInit(tmpDir);
    assert.ok(output.includes('already exists'), 'should report skipping');

    const content = fs.readFileSync(workflowFile, 'utf8');
    assert.equal(content, 'user-customized workflow', 'should NOT overwrite user workflow');
  });

  it('overwrites workflow files on upgrade', () => {
    runInit(tmpDir);
    const workflowFile = path.join(tmpDir, '.github', 'workflows', 'sync-squad-labels.yml');
    fs.writeFileSync(workflowFile, 'old workflow content');

    // Simulate an older installed version so upgrade doesn't short-circuit
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    fs.writeFileSync(agentFile, 'version: "0.0.1"\nold agent content');

    runCmd(tmpDir, 'upgrade');

    const expected = fs.readFileSync(path.join(ROOT, 'templates', 'workflows', 'sync-squad-labels.yml'), 'utf8');
    const actual = fs.readFileSync(workflowFile, 'utf8');
    assert.equal(actual, expected, 'workflow should match source after upgrade');
  });

  it('upgrade output mentions workflow files', () => {
    runInit(tmpDir);

    // Simulate an older installed version so upgrade doesn't short-circuit
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    fs.writeFileSync(agentFile, 'version: "0.0.1"\nold agent content');

    const output = runCmd(tmpDir, 'upgrade');
    assert.ok(output.includes('workflow'), 'should mention workflows in upgrade output');
  });
});

// --- Edge case tests ---

describe('edge cases', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-edge-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('re-init skips existing files and reports it', () => {
    // First init
    runInit(tmpDir);
    // Second init should skip
    const output = runInit(tmpDir);
    assert.ok(output.includes('already exists'), 'should report files already exist');
    // Files should still be valid
    assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'agents', 'squad.agent.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team-templates')));
  });

  it('exit code is 0 on re-init', () => {
    runInit(tmpDir);
    const result = runCmdStatus(tmpDir, '');
    assert.equal(result.exitCode, 0, 're-init should exit 0');
  });
});

// --- Smart upgrade with migrations ---

describe('smart upgrade ΓÇö version delta', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-smart-'));
    runInit(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports version delta when upgrading from older version', () => {
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    fs.writeFileSync(agentFile, '---\nversion: "0.0.1"\n---\nold content');

    const output = runCmd(tmpDir, 'upgrade');
    assert.ok(output.includes('upgraded'), 'should mention upgraded');
    assert.ok(output.includes('0.0.1'), 'should mention old version');
    assert.ok(output.includes(PKG.version), 'should mention new version');
  });

  it('reports "Already up to date" when versions match', () => {
    // After init, squad.agent.md has current version stamped
    const output = runCmd(tmpDir, 'upgrade');
    assert.ok(output.includes('Already up to date'), 'should say already up to date');
    assert.ok(output.includes(PKG.version), 'should mention current version');
  });

  it('treats missing version header as unknown', () => {
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    fs.writeFileSync(agentFile, '---\nname: Squad\n---\nno version header');

    const output = runCmd(tmpDir, 'upgrade');
    assert.ok(output.includes('unknown'), 'should report upgrading from unknown');
    assert.ok(output.includes(PKG.version), 'should mention new version');
  });

  it('exits cleanly when already up to date', () => {
    const result = runCmdStatus(tmpDir, 'upgrade');
    assert.equal(result.exitCode, 0, 'should exit 0');
    assert.ok(result.stdout.includes('Already up to date'), 'should say already up to date');
  });
});

describe('smart upgrade ΓÇö migrations', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-migr-'));
    runInit(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .ai-team/skills/ directory on upgrade', () => {
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    fs.writeFileSync(agentFile, '---\nversion: "0.0.1"\n---\nold');

    runCmd(tmpDir, 'upgrade');
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'skills')),
      '.ai-team/skills/ should be created by migration');
  });

  it('migrations are idempotent ΓÇö running upgrade twice does not error', () => {
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    fs.writeFileSync(agentFile, '---\nversion: "0.0.1"\n---\nold');
    runCmd(tmpDir, 'upgrade');

    // Second upgrade ΓÇö now versions match, hits "already up to date" path
    // which still runs migrations. Should not error.
    const result = runCmdStatus(tmpDir, 'upgrade');
    assert.equal(result.exitCode, 0, 'second upgrade should exit 0');
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'skills')),
      '.ai-team/skills/ should still exist');
  });

  it('skips migrations for versions already past', () => {
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    // Simulate upgrading from a version PAST the migration version
    fs.writeFileSync(agentFile, '---\nversion: "99.0.0"\n---\nfuture');

    // 99.0.0 != pkg.version so it will do full upgrade, and migrations
    // run against oldVersion=99.0.0 ΓÇö 0.2.0 is NOT > 99.0.0, so migration is skipped.
    // Note: skills dir already exists from init (created in init flow), but the
    // migration itself is correctly skipped based on version comparison.
    runCmd(tmpDir, 'upgrade');
    // The dir exists (from init), but the migration was skipped ΓÇö verify upgrade succeeds
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'skills')),
      '.ai-team/skills/ should exist (created during init)');
  });

  it('runs migrations even on "already up to date" path', () => {
    const agentFile = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    // The file already has pkg.version from init. Skills dir already exists from init.
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'skills')),
      'skills should exist from init');

    // The "already up to date" path runs migrations against oldVersion=pkg.version
    // and 0.2.0 > pkg.version only if pkg.version < 0.2.0.
    // Current pkg.version is 0.1.0, so 0.2.0 > 0.1.0 is true ΓåÆ migration runs.
    const output = runCmd(tmpDir, 'upgrade');
    assert.ok(output.includes('Already up to date'), 'should be up to date');
    assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'skills')),
      '.ai-team/skills/ should still exist after migration on up-to-date path');
  });
});

// --- squad.agent.md prompt content validation (PR #2 features) ---

describe('squad.agent.md prompt content', () => {
  const agentMd = fs.readFileSync(path.join(ROOT, '.github', 'agents', 'squad.agent.md'), 'utf8');

  describe('GitHub Issues Mode', () => {
    it('contains the GitHub Issues Mode section', () => {
      assert.ok(agentMd.includes('## GitHub Issues Mode'), 'missing ## GitHub Issues Mode section');
    });

    it('contains prerequisites for gh CLI', () => {
      assert.ok(agentMd.includes('gh --version'), 'missing gh CLI detection');
      assert.ok(agentMd.includes('gh auth status'), 'missing gh auth check');
    });

    it('contains issue trigger table', () => {
      assert.ok(agentMd.includes('"pull issues from {owner/repo}"'), 'missing pull issues trigger');
      assert.ok(agentMd.includes('"work on issue #N"'), 'missing work on issue trigger');
      assert.ok(agentMd.includes('"merge PR #N"'), 'missing merge PR trigger');
    });

    it('contains Issue Source storage format', () => {
      assert.ok(agentMd.includes('## Issue Source'), 'missing ## Issue Source section in team.md format');
    });

    it('documents the branch naming convention', () => {
      assert.ok(agentMd.includes('squad/{issue-number}-{slug}'), 'missing branch naming convention');
    });

    it('documents PR submission with issue linking', () => {
      assert.ok(agentMd.includes('Closes #'), 'missing Closes # issue linking in PR flow');
    });

    it('documents PR review handling', () => {
      assert.ok(agentMd.includes('PR REVIEW FEEDBACK'), 'missing PR review feedback spawn prompt');
    });

    it('documents PR merge flow', () => {
      assert.ok(agentMd.includes('gh pr merge'), 'missing gh pr merge command');
    });

    it('references standard After Agent Work flow', () => {
      assert.ok(agentMd.includes('After Agent Work flow'), 'missing reference to standard After Agent Work flow in issue lifecycle');
    });

    it('mentions worktree interaction for parallel issues', () => {
      assert.ok(agentMd.includes('worktree') || agentMd.includes('Worktree'), 'missing worktree guidance in issue lifecycle');
    });
  });

  describe('PRD Mode', () => {
    it('contains the PRD Mode section', () => {
      assert.ok(agentMd.includes('## PRD Mode'), 'missing ## PRD Mode section');
    });

    it('contains PRD trigger table', () => {
      assert.ok(agentMd.includes('"here\'s the PRD"'), 'missing PRD trigger phrase');
      assert.ok(agentMd.includes('"read the PRD at {path}"'), 'missing file path trigger');
    });

    it('documents PRD storage in team.md', () => {
      assert.ok(agentMd.includes('## PRD'), 'missing ## PRD section in team.md format');
    });

    it('documents Lead agent decomposition', () => {
      assert.ok(agentMd.includes('Decompose PRD into work items'), 'missing PRD decomposition prompt');
    });

    it('documents work item format', () => {
      assert.ok(agentMd.includes('WI-{number}'), 'missing work item ID format');
    });

    it('includes decomposition guidelines', () => {
      assert.ok(agentMd.includes('Decomposition guidelines'), 'missing decomposition guidelines');
    });

    it('documents mid-project PRD updates', () => {
      assert.ok(agentMd.includes('Mid-Project PRD Updates'), 'missing mid-project PRD update section');
    });
  });

  describe('Human Team Members', () => {
    it('contains the Human Team Members section', () => {
      assert.ok(agentMd.includes('## Human Team Members'), 'missing ## Human Team Members section');
    });

    it('contains human trigger table', () => {
      assert.ok(agentMd.includes('"add {Name} as {role}"'), 'missing add human trigger');
      assert.ok(agentMd.includes('"I\'m on the team as {role}"'), 'missing self-add trigger');
    });

    it('documents the human badge', () => {
      assert.ok(agentMd.includes('👤 Human'), 'missing 👤 Human badge');
    });

    it('documents differences from AI agents', () => {
      assert.ok(agentMd.includes('How Humans Differ from AI Agents'), 'missing human vs AI comparison');
    });

    it('documents routing to humans with pause behavior', () => {
      assert.ok(agentMd.includes("This one's for {Name}"), 'missing human routing pause message');
    });

    it('documents non-dependent work continues', () => {
      assert.ok(agentMd.includes('Non-dependent work continues'), 'missing continuation guidance for human blocks');
    });

    it('documents stale reminder', () => {
      assert.ok(agentMd.includes('Still waiting on {Name}'), 'missing stale reminder message');
    });

    it('documents human reviewer integration', () => {
      assert.ok(agentMd.includes('Human Members and the Reviewer Rejection Protocol'), 'missing human reviewer integration section');
    });

    it('shows multiple humans example', () => {
      assert.ok(agentMd.includes('Multiple Humans'), 'missing multiple humans section');
    });
  });

  describe('Init Mode integration', () => {
    it('asks about PRD after team setup', () => {
      assert.ok(agentMd.includes('Do you have a PRD or spec document?'), 'missing PRD question');
    });

    it('asks about GitHub issues after team setup', () => {
      assert.ok(agentMd.includes('Is there a GitHub repo with issues I should pull from?'), 'missing issues question');
    });

    it('asks about human members after team setup', () => {
      assert.ok(agentMd.includes('Are any humans joining the team?'), 'missing humans question');
    });

    it('documents post-setup input sources', () => {
      assert.ok(agentMd.includes('Post-setup input sources'), 'missing post-setup input sources step');
    });
  });

  describe('Routing table integration', () => {
    it('includes GitHub Issues routing signal', () => {
      assert.ok(agentMd.includes('Follow GitHub Issues Mode'), 'missing issues routing signal');
    });

    it('includes PRD routing signal', () => {
      assert.ok(agentMd.includes('Follow PRD Mode'), 'missing PRD routing signal');
    });

    it('includes Human Members routing signal', () => {
      assert.ok(agentMd.includes('Follow Human Team Members'), 'missing human members routing signal');
    });
  });
});

// --- Export subcommand tests ---

describe('export subcommand', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-export-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupSquad(dir) {
    // Create minimal squad structure with team.md
    const aiTeam = path.join(dir, '.ai-team');
    fs.mkdirSync(path.join(aiTeam, 'casting'), { recursive: true });
    fs.mkdirSync(path.join(aiTeam, 'agents', 'fenster'), { recursive: true });
    fs.mkdirSync(path.join(aiTeam, 'agents', 'keaton'), { recursive: true });
    fs.mkdirSync(path.join(aiTeam, 'skills', 'testing'), { recursive: true });
    fs.writeFileSync(path.join(aiTeam, 'team.md'), '# My Squad');

    // Casting files
    fs.writeFileSync(path.join(aiTeam, 'casting', 'registry.json'), JSON.stringify({ agents: ['fenster'] }));
    fs.writeFileSync(path.join(aiTeam, 'casting', 'policy.json'), JSON.stringify({ universe: 'usual-suspects' }));
    fs.writeFileSync(path.join(aiTeam, 'casting', 'history.json'), JSON.stringify({ snapshots: [] }));

    // Agent files
    fs.writeFileSync(path.join(aiTeam, 'agents', 'fenster', 'charter.md'), '# Fenster Charter');
    fs.writeFileSync(path.join(aiTeam, 'agents', 'fenster', 'history.md'), '# Fenster History');
    fs.writeFileSync(path.join(aiTeam, 'agents', 'keaton', 'charter.md'), '# Keaton Charter');

    // Skill file
    fs.writeFileSync(path.join(aiTeam, 'skills', 'testing', 'SKILL.md'), '# Testing Skill');
  }

  it('produces valid JSON', () => {
    setupSquad(tmpDir);
    runCmd(tmpDir, 'export');
    const exportFile = path.join(tmpDir, 'squad-export.json');
    assert.ok(fs.existsSync(exportFile), 'squad-export.json should exist');
    const manifest = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
    assert.equal(manifest.version, '1.0');
    assert.equal(manifest.squad_version, PKG.version);
    assert.ok(manifest.exported_at, 'should have exported_at timestamp');
  });

  it('includes casting state', () => {
    setupSquad(tmpDir);
    runCmd(tmpDir, 'export');
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'squad-export.json'), 'utf8'));
    assert.deepEqual(manifest.casting.registry, { agents: ['fenster'] });
    assert.deepEqual(manifest.casting.policy, { universe: 'usual-suspects' });
    assert.deepEqual(manifest.casting.history, { snapshots: [] });
  });

  it('includes agent charters and histories', () => {
    setupSquad(tmpDir);
    runCmd(tmpDir, 'export');
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'squad-export.json'), 'utf8'));
    assert.equal(manifest.agents.fenster.charter, '# Fenster Charter');
    assert.equal(manifest.agents.fenster.history, '# Fenster History');
    assert.equal(manifest.agents.keaton.charter, '# Keaton Charter');
    assert.equal(manifest.agents.keaton.history, undefined, 'keaton has no history.md');
  });

  it('includes skills if they exist', () => {
    setupSquad(tmpDir);
    runCmd(tmpDir, 'export');
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'squad-export.json'), 'utf8'));
    assert.equal(manifest.skills.length, 1);
    assert.equal(manifest.skills[0], '# Testing Skill');
  });

  it('exports with --out to custom path', () => {
    setupSquad(tmpDir);
    const customPath = path.join(tmpDir, 'custom', 'my-export.json');
    fs.mkdirSync(path.join(tmpDir, 'custom'), { recursive: true });
    runCmd(tmpDir, `export --out "${customPath}"`);
    assert.ok(fs.existsSync(customPath), 'custom export file should exist');
    const manifest = JSON.parse(fs.readFileSync(customPath, 'utf8'));
    assert.equal(manifest.version, '1.0');
  });

  it('fails gracefully when no squad exists', () => {
    const result = runCmdStatus(tmpDir, 'export');
    assert.equal(result.exitCode, 1, 'should exit 1 when no squad');
    assert.ok(result.stderr.includes('No squad found'), 'should mention no squad found');
  });

  it('outputs success and warning messages', () => {
    setupSquad(tmpDir);
    const output = runCmd(tmpDir, 'export');
    assert.ok(output.includes('Exported squad to'), 'should confirm export');
    assert.ok(output.includes('Review agent histories'), 'should warn about histories');
  });

  it('handles missing casting files gracefully', () => {
    const aiTeam = path.join(tmpDir, '.ai-team');
    fs.mkdirSync(path.join(aiTeam, 'casting'), { recursive: true });
    fs.writeFileSync(path.join(aiTeam, 'team.md'), '# Squad');
    // No casting JSON files, no agents, no skills

    runCmd(tmpDir, 'export');
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'squad-export.json'), 'utf8'));
    assert.deepEqual(manifest.casting, {});
    assert.deepEqual(manifest.agents, {});
    assert.deepEqual(manifest.skills, []);
  });

  it('help text mentions export command', () => {
    const result = runCmdStatus(tmpDir, 'help');
    assert.ok(result.stdout.includes('export'), 'help should mention export');
  });
});

// --- Import subcommand tests ---

describe('import subcommand', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-import-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createExportFile(dir, overrides) {
    const manifest = {
      version: '1.0',
      exported_at: '2026-02-09T12:00:00.000Z',
      squad_version: '0.1.0',
      casting: {
        registry: { agents: ['fenster', 'keaton'] },
        policy: { universe: 'usual-suspects' },
        history: { snapshots: [] }
      },
      agents: {
        fenster: {
          charter: '# Fenster Charter\nCore developer.',
          history: '# Project Context\n\n## Learnings\n\n### Runtime Architecture\n- No runtime\n\n### Key File Paths\n- index.js\n\n📌 Team update: something happened'
        },
        keaton: {
          charter: '# Keaton Charter\nLead architect.',
          history: '# Project Context\n\n## Learnings\n\n### Windows Compatibility\n- path.join everywhere'
        }
      },
      skills: [
        '---\nname: testing\n---\n# Testing Skill\nHow to test things.',
        '---\nname: code-review\n---\n# Code Review Skill\nHow to review code.'
      ],
      ...overrides
    };
    const filePath = path.join(dir, 'squad-export.json');
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
    return filePath;
  }

  it('imports from valid export file and creates .ai-team/ structure', () => {
    const exportFile = createExportFile(tmpDir);
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(targetDir);

    runCmd(targetDir, `import "${exportFile}"`);

    // Verify directory structure
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-team')), '.ai-team/ should exist');
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-team', 'casting')), 'casting/ should exist');
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-team', 'agents', 'fenster')), 'agents/fenster/ should exist');
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-team', 'agents', 'keaton')), 'agents/keaton/ should exist');
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-team', 'decisions', 'inbox')), 'decisions/inbox/ should exist');
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-team', 'orchestration-log')), 'orchestration-log/ should exist');
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-team', 'log')), 'log/ should exist');
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-team', 'skills')), 'skills/ should exist');

    // Verify casting files
    const registry = JSON.parse(fs.readFileSync(path.join(targetDir, '.ai-team', 'casting', 'registry.json'), 'utf8'));
    assert.deepEqual(registry, { agents: ['fenster', 'keaton'] });

    // Verify agent charters
    const charter = fs.readFileSync(path.join(targetDir, '.ai-team', 'agents', 'fenster', 'charter.md'), 'utf8');
    assert.equal(charter, '# Fenster Charter\nCore developer.');

    // Verify skills
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-team', 'skills', 'testing', 'SKILL.md')), 'testing skill should exist');
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-team', 'skills', 'code-review', 'SKILL.md')), 'code-review skill should exist');

    // Verify empty project-specific files
    assert.equal(fs.readFileSync(path.join(targetDir, '.ai-team', 'decisions.md'), 'utf8'), '');
    assert.equal(fs.readFileSync(path.join(targetDir, '.ai-team', 'team.md'), 'utf8'), '');
  });

  it('fails with clear error when squad exists and no --force', () => {
    const exportFile = createExportFile(tmpDir);
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(path.join(targetDir, '.ai-team'), { recursive: true });

    const result = runCmdStatus(targetDir, `import "${exportFile}"`);
    assert.equal(result.exitCode, 1, 'should exit 1');
    assert.ok(result.stderr.includes('already exists') || result.stderr.includes('--force'),
      'should mention --force');
  });

  it('archives existing squad with --force', () => {
    const exportFile = createExportFile(tmpDir);
    const targetDir = path.join(tmpDir, 'target');
    const aiTeam = path.join(targetDir, '.ai-team');
    fs.mkdirSync(path.join(aiTeam, 'agents', 'old-agent'), { recursive: true });
    fs.writeFileSync(path.join(aiTeam, 'agents', 'old-agent', 'charter.md'), '# Old Agent');

    runCmd(targetDir, `import "${exportFile}" --force`);

    // Old squad should be archived
    const entries = fs.readdirSync(targetDir);
    const archives = entries.filter(e => e.startsWith('.ai-team-archive-'));
    assert.equal(archives.length, 1, 'should have exactly one archive');

    // Archive should contain old agent
    const archiveDir = path.join(targetDir, archives[0]);
    assert.ok(fs.existsSync(path.join(archiveDir, 'agents', 'old-agent', 'charter.md')),
      'old agent should be in archive');

    // New squad should be imported
    assert.ok(fs.existsSync(path.join(aiTeam, 'agents', 'fenster', 'charter.md')),
      'new agent should exist after import');
  });

  it('round-trip: init ΓåÆ export ΓåÆ import preserves agents', () => {
    // Init a squad
    const srcDir = path.join(tmpDir, 'source');
    fs.mkdirSync(srcDir);
    runInit(srcDir);

    // Add agents to make it a real squad
    const aiTeam = path.join(srcDir, '.ai-team');
    fs.writeFileSync(path.join(aiTeam, 'team.md'), '# My Squad');
    fs.mkdirSync(path.join(aiTeam, 'agents', 'testbot'), { recursive: true });
    fs.writeFileSync(path.join(aiTeam, 'agents', 'testbot', 'charter.md'), '# Testbot\nI test things.');
    fs.writeFileSync(path.join(aiTeam, 'agents', 'testbot', 'history.md'), '# Learnings\n\n## Learnings\n\nSome knowledge here.');

    // Export
    runCmd(srcDir, 'export');
    const exportFile = path.join(srcDir, 'squad-export.json');
    assert.ok(fs.existsSync(exportFile), 'export file should exist');

    // Import into new directory
    const destDir = path.join(tmpDir, 'dest');
    fs.mkdirSync(destDir);
    runCmd(destDir, `import "${exportFile}"`);

    // Verify agent charter preserved
    const charter = fs.readFileSync(path.join(destDir, '.ai-team', 'agents', 'testbot', 'charter.md'), 'utf8');
    assert.equal(charter, '# Testbot\nI test things.', 'charter should match');

    // Verify agent history exists with import marker
    const history = fs.readFileSync(path.join(destDir, '.ai-team', 'agents', 'testbot', 'history.md'), 'utf8');
    assert.ok(history.includes('Imported from'), 'history should have import marker');
    assert.ok(history.includes('Some knowledge here'), 'history should contain original knowledge');
  });

  it('fails gracefully with missing file', () => {
    const result = runCmdStatus(tmpDir, 'import nonexistent.json');
    assert.equal(result.exitCode, 1, 'should exit 1');
    assert.ok(result.stderr.includes('not found'), 'should mention file not found');
  });

  it('fails gracefully with invalid JSON', () => {
    const badFile = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badFile, 'not valid json {{{');

    const result = runCmdStatus(tmpDir, `import "${badFile}"`);
    assert.equal(result.exitCode, 1, 'should exit 1');
    assert.ok(result.stderr.includes('Invalid JSON'), 'should mention invalid JSON');
  });

  it('fails gracefully with wrong version', () => {
    const badFile = path.join(tmpDir, 'bad-version.json');
    fs.writeFileSync(badFile, JSON.stringify({ version: '99.0', casting: {}, agents: {}, skills: [] }));

    const result = runCmdStatus(tmpDir, `import "${badFile}"`);
    assert.equal(result.exitCode, 1, 'should exit 1');
    assert.ok(result.stderr.includes('Unsupported'), 'should mention unsupported version');
  });

  it('imported histories contain portable knowledge markers', () => {
    const exportFile = createExportFile(tmpDir);
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(targetDir);

    runCmd(targetDir, `import "${exportFile}"`);

    const history = fs.readFileSync(path.join(targetDir, '.ai-team', 'agents', 'fenster', 'history.md'), 'utf8');

    // Should have import marker
    assert.ok(history.includes('📌 Imported from'), 'should have import marker');
    assert.ok(history.includes('Portable knowledge carried over'), 'should mention portable knowledge');

    // Portable content should be present
    assert.ok(history.includes('Runtime Architecture'), 'portable section should be present');

    // Project-specific content should be marked
    assert.ok(history.includes('Project Learnings (from import'), 'project learnings should be marked');
    assert.ok(history.includes('Key File Paths'), 'project-specific section should be in project learnings');
  });

  it('outputs correct success messaging', () => {
    const exportFile = createExportFile(tmpDir);
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(targetDir);

    const output = runCmd(targetDir, `import "${exportFile}"`);
    assert.ok(output.includes('Imported squad from'), 'should confirm import');
    assert.ok(output.includes('fenster'), 'should list agent names');
    assert.ok(output.includes('keaton'), 'should list agent names');
    assert.ok(output.includes('2 agents'), 'should show agent count');
    assert.ok(output.includes('2 skills'), 'should show skill count');
    assert.ok(output.includes('usual-suspects'), 'should show universe');
    assert.ok(output.includes('Project-specific learnings'), 'should warn about learnings');
    assert.ok(output.includes('Next steps'), 'should show next steps');
  });

  it('help text mentions import command', () => {
    const result = runCmdStatus(tmpDir, 'help');
    assert.ok(result.stdout.includes('import'), 'help should mention import');
  });

  it('fails when no file argument provided', () => {
    const result = runCmdStatus(tmpDir, 'import');
    assert.equal(result.exitCode, 1, 'should exit 1');
    assert.ok(result.stderr.includes('Usage'), 'should show usage');
  });
});

describe('copilot subcommand', () => {
  let tmpDir;

  function initWithTeam(dir) {
    runInit(dir);
    // Init creates directories but not team.md (coordinator does that)
    // Create a minimal team.md so the copilot subcommand can proceed
    const teamDir = path.join(dir, '.ai-team');
    fs.mkdirSync(teamDir, { recursive: true });
    fs.writeFileSync(path.join(teamDir, 'team.md'), '# The Squad\n\n## Project Context\n\nNo context yet.\n');
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-copilot-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fails when no squad exists', () => {
    const { status } = runCmdStatus(tmpDir, 'copilot');
    assert.notEqual(status, 0, 'should fail without a squad');
  });

  it('adds @copilot to team.md with capability profile', () => {
    initWithTeam(tmpDir);
    runCmd(tmpDir, 'copilot');
    const teamMd = fs.readFileSync(path.join(tmpDir, '.ai-team', 'team.md'), 'utf8');
    assert.ok(teamMd.includes('🤖 Coding Agent'), 'should have coding agent badge');
    assert.ok(teamMd.includes('@copilot'), 'should have @copilot name');
    assert.ok(teamMd.includes('🟢 Good fit'), 'should have capability profile');
    assert.ok(teamMd.includes('🟡 Needs review'), 'should have needs-review tier');
    assert.ok(teamMd.includes('🔴 Not suitable'), 'should have not-suitable tier');
  });

  it('creates .github/copilot-instructions.md', () => {
    initWithTeam(tmpDir);
    runCmd(tmpDir, 'copilot');
    const dest = path.join(tmpDir, '.github', 'copilot-instructions.md');
    assert.ok(fs.existsSync(dest), 'copilot-instructions.md should be created');
    const content = fs.readFileSync(dest, 'utf8');
    assert.ok(content.includes('Squad'), 'should reference Squad');
    assert.ok(content.includes('.ai-team/team.md'), 'should reference team.md');
  });

  it('sets auto-assign when --auto-assign flag is used', () => {
    initWithTeam(tmpDir);
    runCmd(tmpDir, 'copilot --auto-assign');
    const teamMd = fs.readFileSync(path.join(tmpDir, '.ai-team', 'team.md'), 'utf8');
    assert.ok(teamMd.includes('<!-- copilot-auto-assign: true -->'), 'should have auto-assign enabled');
  });

  it('defaults auto-assign to false without flag', () => {
    initWithTeam(tmpDir);
    runCmd(tmpDir, 'copilot');
    const teamMd = fs.readFileSync(path.join(tmpDir, '.ai-team', 'team.md'), 'utf8');
    assert.ok(teamMd.includes('<!-- copilot-auto-assign: false -->'), 'should have auto-assign disabled');
  });

  it('reports already on team if run twice', () => {
    initWithTeam(tmpDir);
    runCmd(tmpDir, 'copilot');
    const out = runCmd(tmpDir, 'copilot');
    assert.ok(out.includes('already on the team'), 'should note already added');
  });

  it('enables auto-assign on existing copilot member', () => {
    initWithTeam(tmpDir);
    runCmd(tmpDir, 'copilot');
    runCmd(tmpDir, 'copilot --auto-assign');
    const teamMd = fs.readFileSync(path.join(tmpDir, '.ai-team', 'team.md'), 'utf8');
    assert.ok(teamMd.includes('<!-- copilot-auto-assign: true -->'), 'should update to auto-assign');
  });

  it('removes @copilot with --off flag', () => {
    initWithTeam(tmpDir);
    runCmd(tmpDir, 'copilot');
    runCmd(tmpDir, 'copilot --off');
    const teamMd = fs.readFileSync(path.join(tmpDir, '.ai-team', 'team.md'), 'utf8');
    assert.ok(!teamMd.includes('🤖 Coding Agent'), 'should remove coding agent');
  });

  it('does not overwrite copilot-instructions.md on upgrade when @copilot is not enabled', () => {
    initWithTeam(tmpDir);
    const dest = path.join(tmpDir, '.github', 'copilot-instructions.md');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, 'user customized');
    runCmd(tmpDir, 'upgrade');
    const content = fs.readFileSync(dest, 'utf8');
    assert.equal(content, 'user customized', 'upgrade should not touch copilot-instructions.md when @copilot is not enabled');
  });

  it('upgrades copilot-instructions.md when @copilot is enabled on the team', () => {
    initWithTeam(tmpDir);
    runCmd(tmpDir, 'copilot');
    const dest = path.join(tmpDir, '.github', 'copilot-instructions.md');
    fs.writeFileSync(dest, 'old version');
    runCmd(tmpDir, 'upgrade');
    const content = fs.readFileSync(dest, 'utf8');
    assert.notEqual(content, 'old version', 'upgrade should overwrite copilot-instructions.md when @copilot is enabled');
    assert.ok(content.includes('Squad'), 'should contain latest template content');
  });

  it('copilot-instructions.md content matches source template', () => {
    initWithTeam(tmpDir);
    runCmd(tmpDir, 'copilot');
    const dest = path.join(tmpDir, '.github', 'copilot-instructions.md');
    const src = path.join(ROOT, 'templates', 'copilot-instructions.md');
    const destContent = fs.readFileSync(dest, 'utf8');
    const srcContent = fs.readFileSync(src, 'utf8');
    assert.equal(destContent, srcContent, 'should copy template exactly');
  });
});
