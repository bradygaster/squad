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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-version-test-'));
}

function cleanDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function initSquad(dir) {
  const result = runSquad([], dir);
  assert.equal(result.exitCode, 0, `init should succeed: ${result.stdout}`);
  return result;
}

function getPackageVersion() {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.version;
}

describe('Version stamping in squad.agent.md', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('init replaces {version} placeholder with actual version', () => {
    initSquad(tmpDir);
    const agentPath = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    const content = fs.readFileSync(agentPath, 'utf8');
    
    // Should NOT contain the literal placeholder
    assert.ok(
      !content.includes('{version}'),
      'squad.agent.md should not contain literal {version} placeholder after init'
    );
  });

  it('init stamps version in greeting instruction', () => {
    const currentVersion = getPackageVersion();
    initSquad(tmpDir);
    const agentPath = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    const content = fs.readFileSync(agentPath, 'utf8');
    
    // Should contain the actual version in the greeting instruction
    const expectedGreeting = `\`Squad v${currentVersion}\``;
    assert.ok(
      content.includes(expectedGreeting),
      `squad.agent.md should contain greeting with version: ${expectedGreeting}`
    );
  });

  it('init stamps version in HTML comment', () => {
    const currentVersion = getPackageVersion();
    initSquad(tmpDir);
    const agentPath = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    const content = fs.readFileSync(agentPath, 'utf8');
    
    // Should contain version in HTML comment
    const commentMatch = content.match(/<!-- version: ([0-9.]+(?:-[a-z]+)?) -->/);
    assert.ok(commentMatch, 'squad.agent.md should contain version HTML comment');
    assert.equal(
      commentMatch[1],
      currentVersion,
      `HTML comment version should match package.json version (${currentVersion})`
    );
  });

  it('init stamps version in Identity section', () => {
    const currentVersion = getPackageVersion();
    initSquad(tmpDir);
    const agentPath = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    const content = fs.readFileSync(agentPath, 'utf8');
    
    // Should contain version in the Identity section's Version line
    const versionMatch = content.match(/- \*\*Version:\*\* ([0-9.]+(?:-[a-z]+)?)/);
    assert.ok(versionMatch, 'squad.agent.md should contain Version field in Identity section');
    assert.equal(
      versionMatch[1],
      currentVersion,
      `Identity Version field should match package.json version (${currentVersion})`
    );
  });

  it('upgrade replaces {version} placeholder', () => {
    // First init
    initSquad(tmpDir);
    
    // Simulate an old installation with {version} placeholder still present
    const agentPath = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    let content = fs.readFileSync(agentPath, 'utf8');
    
    // Revert to old version with placeholder
    content = content.replace(/<!-- version: [^>]+ -->/, '<!-- version: 0.4.0 -->');
    content = content.replace(/- \*\*Version:\*\* [0-9.]+(?:-[a-z]+)?/, '- **Version:** 0.4.0');
    content = content.replace(/`Squad v[0-9.]+(?:-[a-z]+)?`/g, '`Squad v{version}`');
    fs.writeFileSync(agentPath, content);
    
    // Verify placeholder is there
    content = fs.readFileSync(agentPath, 'utf8');
    assert.ok(content.includes('{version}'), 'Setup: placeholder should be present before upgrade');
    
    // Run upgrade
    const result = runSquad(['upgrade'], tmpDir);
    assert.equal(result.exitCode, 0, `upgrade should succeed: ${result.stdout}`);
    
    // Verify placeholder was replaced
    content = fs.readFileSync(agentPath, 'utf8');
    assert.ok(
      !content.includes('{version}'),
      'upgrade should replace {version} placeholder'
    );
    
    const currentVersion = getPackageVersion();
    const expectedGreeting = `\`Squad v${currentVersion}\``;
    assert.ok(
      content.includes(expectedGreeting),
      `upgrade should stamp actual version: ${expectedGreeting}`
    );
  });
});

describe('compareSemver pre-release handling', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('upgrade detects older version and proceeds (0.4.0 → current)', () => {
    // Init with current version
    initSquad(tmpDir);
    
    // Simulate an old installation
    const agentPath = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    let content = fs.readFileSync(agentPath, 'utf8');
    content = content.replace(/<!-- version: [^>]+ -->/, '<!-- version: 0.4.0 -->');
    content = content.replace(/- \*\*Version:\*\* [0-9.]+(?:-[a-z]+)?/, '- **Version:** 0.4.0');
    fs.writeFileSync(agentPath, content);
    
    // Run upgrade
    const result = runSquad(['upgrade'], tmpDir);
    assert.equal(result.exitCode, 0, `upgrade should succeed: ${result.stdout}`);
    
    // Should NOT say "Already up to date" (meaning compareSemver detected older version)
    assert.ok(
      !result.stdout.includes('Already up to date'),
      'upgrade should proceed when installed version (0.4.0) is older than current'
    );
    
    // Verify version was updated
    content = fs.readFileSync(agentPath, 'utf8');
    const currentVersion = getPackageVersion();
    const commentMatch = content.match(/<!-- version: ([0-9.]+(?:-[a-z]+)?) -->/);
    assert.ok(commentMatch, 'squad.agent.md should have version comment after upgrade');
    assert.equal(
      commentMatch[1],
      currentVersion,
      `Version should be updated to current (${currentVersion})`
    );
  });

  it('upgrade detects same version and reports already up to date', () => {
    // Init with current version
    initSquad(tmpDir);
    
    // Version is already current — run upgrade
    const result = runSquad(['upgrade'], tmpDir);
    assert.equal(result.exitCode, 0, `upgrade should succeed: ${result.stdout}`);
    
    // Should say "Already up to date" (compareSemver detected same version)
    assert.ok(
      result.stdout.includes('Already up to date'),
      'upgrade should report "Already up to date" when versions match'
    );
  });

  it('upgrade handles pre-release versions correctly (0.5.2 vs 0.5.3-insiders)', () => {
    // This test verifies that compareSemver correctly handles pre-release suffixes
    // According to semver rules: 0.5.3-insiders < 0.5.3 (pre-release is less than release)
    // But 0.5.3-insiders > 0.5.2 (higher base version wins)
    
    // Init with current version
    initSquad(tmpDir);
    
    // Simulate installed version 0.5.2
    const agentPath = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    let content = fs.readFileSync(agentPath, 'utf8');
    content = content.replace(/<!-- version: [^>]+ -->/, '<!-- version: 0.5.2 -->');
    content = content.replace(/- \*\*Version:\*\* [0-9.]+(?:-[a-z]+)?/, '- **Version:** 0.5.2');
    fs.writeFileSync(agentPath, content);
    
    // Run upgrade (current package might be 0.5.2, 0.5.3, or 0.5.3-insiders)
    const result = runSquad(['upgrade'], tmpDir);
    assert.equal(result.exitCode, 0, `upgrade should succeed: ${result.stdout}`);
    
    // If current version is higher than 0.5.2, upgrade should proceed
    const currentVersion = getPackageVersion();
    if (currentVersion !== '0.5.2') {
      assert.ok(
        !result.stdout.includes('Already up to date'),
        `upgrade should proceed when upgrading from 0.5.2 to ${currentVersion}`
      );
    }
  });

  it('upgrade recognizes pre-release as less than release version', () => {
    // Test the specific case: if installed is 0.5.3-insiders and package is 0.5.3,
    // upgrade should proceed (pre-release < release)
    
    initSquad(tmpDir);
    
    // Simulate installed version 0.5.3-insiders
    const agentPath = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    let content = fs.readFileSync(agentPath, 'utf8');
    content = content.replace(/<!-- version: [^>]+ -->/, '<!-- version: 0.5.3-insiders -->');
    content = content.replace(/- \*\*Version:\*\* [0-9.]+(?:-[a-z]+)?/, '- **Version:** 0.5.3-insiders');
    fs.writeFileSync(agentPath, content);
    
    // Run upgrade
    const result = runSquad(['upgrade'], tmpDir);
    assert.equal(result.exitCode, 0, `upgrade should succeed: ${result.stdout}`);
    
    // If current version is 0.5.3 (without suffix), upgrade should proceed
    // If current version is also a pre-release or different, behavior may vary
    const currentVersion = getPackageVersion();
    
    // Only assert "not already up to date" if current is a release version higher/equal to base
    const currentBase = currentVersion.split('-')[0];
    if (currentVersion === '0.5.3' || currentBase === '0.5.3') {
      // Pre-release should be considered less than release
      assert.ok(
        !result.stdout.includes('Already up to date'),
        'upgrade should proceed when upgrading from 0.5.3-insiders to 0.5.3 release'
      );
    }
  });
});
