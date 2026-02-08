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

    // Every file in templates/ should be copied
    const sourceFiles = fs.readdirSync(path.join(ROOT, 'templates'));
    const destFiles = fs.readdirSync(templatesDir);
    assert.deepEqual(destFiles.sort(), sourceFiles.sort());

    // Spot-check: content matches for first template
    for (const file of sourceFiles) {
      const expected = fs.readFileSync(path.join(ROOT, 'templates', file), 'utf8');
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
    fs.writeFileSync(agentFile, 'old version content');

    runCmd(tmpDir, 'upgrade');

    const source = fs.readFileSync(path.join(ROOT, '.github', 'agents', 'squad.agent.md'), 'utf8');
    const actual = fs.readFileSync(agentFile, 'utf8');
    const pkg = require(path.join(ROOT, 'package.json'));
    const expected = source.replace('version: "0.0.0-source"', `version: "${pkg.version}"`);
    assert.equal(actual, expected, 'squad.agent.md should match source with version stamped after upgrade');
  });

  it('overwrites .ai-team-templates/ with latest versions', () => {
    const templatesDir = path.join(tmpDir, '.ai-team-templates');
    // Modify a template to simulate old version
    const templateFiles = fs.readdirSync(templatesDir);
    assert.ok(templateFiles.length > 0, 'should have template files');
    fs.writeFileSync(path.join(templatesDir, templateFiles[0]), 'old template content');

    runCmd(tmpDir, 'upgrade');

    // All templates should match source
    const sourceFiles = fs.readdirSync(path.join(ROOT, 'templates'));
    for (const file of sourceFiles) {
      const expected = fs.readFileSync(path.join(ROOT, 'templates', file), 'utf8');
      const actual = fs.readFileSync(path.join(templatesDir, file), 'utf8');
      assert.equal(actual, expected, `template ${file} should match source after upgrade`);
    }
  });

  it('does NOT touch .ai-team/ directory', () => {
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
    // Run index.js from a fake root missing source files — triggers source validation fatal()
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
