const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const CLI = path.join(__dirname, '..', 'index.js');
const pkg = require('../package.json');

function runSquad(args, cwd) {
  try {
    const result = execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-migrate-test-'));
}

function cleanDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// Creates a fake old-style squadified repo (uses .ai-team/, squad v0.3.0)
function makeOldSquadRepo(dir, options = {}) {
  const version = options.version || '0.3.0';

  // .ai-team/ structure
  const aiTeamDir = path.join(dir, '.ai-team');
  fs.mkdirSync(path.join(aiTeamDir, 'decisions', 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(aiTeamDir, 'orchestration-log'), { recursive: true });
  fs.mkdirSync(path.join(aiTeamDir, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(aiTeamDir, 'team.md'), '# Team\n');

  // squad.agent.md with old version
  const agentDir = path.join(dir, '.github', 'agents');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentDir, 'squad.agent.md'),
    `<!-- version: ${version} -->\n\n- **Version:** ${version}\n`
  );

  // .gitattributes with .ai-team/ rules
  fs.writeFileSync(
    path.join(dir, '.gitattributes'),
    '.ai-team/decisions.md merge=union\n.ai-team/agents/*/history.md merge=union\n'
  );

  // Optional project type markers
  if (options.useSlnx) fs.writeFileSync(path.join(dir, 'MyApp.slnx'), '');
  if (options.useFsproj) fs.writeFileSync(path.join(dir, 'MyApp.fsproj'), '');
  if (options.useVbproj) fs.writeFileSync(path.join(dir, 'MyApp.vbproj'), '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: --migrate-directory renames .ai-team/ → .squad/
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade --migrate-directory: directory rename', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); makeOldSquadRepo(tmpDir); });
  afterEach(() => cleanDir(tmpDir));

  it('renames .ai-team/ to .squad/', () => {
    const result = runSquad(['upgrade', '--migrate-directory'], tmpDir);
    assert.equal(result.exitCode, 0, `expected exit 0: ${result.stdout}`);
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.squad')),
      '.squad/ should exist after migration'
    );
  });

  it('.ai-team/ no longer exists after migration', () => {
    runSquad(['upgrade', '--migrate-directory'], tmpDir);
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.ai-team')),
      '.ai-team/ should be gone after migration'
    );
  });

  it('updates .gitattributes to use .squad/ instead of .ai-team/', () => {
    runSquad(['upgrade', '--migrate-directory'], tmpDir);
    const gitattributes = fs.readFileSync(path.join(tmpDir, '.gitattributes'), 'utf8');
    assert.ok(
      gitattributes.includes('.squad/decisions.md merge=union'),
      '.gitattributes should reference .squad/ after migration'
    );
    assert.ok(
      !gitattributes.includes('.ai-team/decisions.md merge=union'),
      '.gitattributes should not reference .ai-team/ after migration'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: --migrate-directory does NOT exit early — full upgrade runs
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade --migrate-directory: full upgrade runs (no early exit)', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); makeOldSquadRepo(tmpDir); });
  afterEach(() => cleanDir(tmpDir));

  it('squad.agent.md is upgraded to current version', () => {
    const result = runSquad(['upgrade', '--migrate-directory'], tmpDir);
    assert.equal(result.exitCode, 0, `expected exit 0: ${result.stdout}`);

    const agentPath = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    const content = fs.readFileSync(agentPath, 'utf8');
    assert.ok(
      content.includes(`<!-- version: ${pkg.version} -->`),
      `squad.agent.md should be stamped with v${pkg.version} after migrate+upgrade`
    );
  });

  it('workflow files are written after migration', () => {
    runSquad(['upgrade', '--migrate-directory'], tmpDir);
    const workflowsDir = path.join(tmpDir, '.github', 'workflows');
    assert.ok(
      fs.existsSync(workflowsDir),
      '.github/workflows/ should exist after migrate+upgrade'
    );
    const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml'));
    assert.ok(files.length > 0, 'workflow files should be written after migrate+upgrade');
  });

  it('.ai-team-templates/ is created/updated after migration', () => {
    runSquad(['upgrade', '--migrate-directory'], tmpDir);
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.ai-team-templates')),
      '.ai-team-templates/ should exist after migrate+upgrade'
    );
  });

  it('output mentions both migration and upgrade steps', () => {
    const result = runSquad(['upgrade', '--migrate-directory'], tmpDir);
    assert.ok(
      result.stdout.includes('Renamed .ai-team/') || result.stdout.includes('Migrating .ai-team/'),
      'output should mention directory rename'
    );
    assert.ok(
      result.stdout.includes('upgraded') || result.stdout.includes('coordinator'),
      'output should mention the upgrade step'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: error cases
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade --migrate-directory: error cases', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => cleanDir(tmpDir));

  it('fails with non-zero exit if no .ai-team/ exists', () => {
    // Fresh dir — no .ai-team/, no .squad/
    const agentDir = path.join(tmpDir, '.github', 'agents');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'squad.agent.md'), '<!-- version: 0.3.0 -->\n');

    const result = runSquad(['upgrade', '--migrate-directory'], tmpDir);
    assert.notEqual(result.exitCode, 0, 'should fail if no .ai-team/ to migrate');
    assert.ok(
      result.stdout.includes('No .ai-team/') || result.stdout.includes('nothing to migrate'),
      `should mention missing .ai-team/: ${result.stdout}`
    );
  });

  it('fails with non-zero exit if .squad/ already exists', () => {
    makeOldSquadRepo(tmpDir);
    // Also create .squad/ to simulate already-migrated state
    fs.mkdirSync(path.join(tmpDir, '.squad'), { recursive: true });

    const result = runSquad(['upgrade', '--migrate-directory'], tmpDir);
    assert.notEqual(result.exitCode, 0, 'should fail if .squad/ already exists');
    assert.ok(
      result.stdout.includes('.squad/') && result.stdout.includes('already exists'),
      `should mention .squad/ already exists: ${result.stdout}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4: no recreation of .ai-team/ after migration
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade --migrate-directory: .ai-team/ not recreated', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); makeOldSquadRepo(tmpDir); });
  afterEach(() => cleanDir(tmpDir));

  it('.ai-team/ is not recreated by migrations or upgrade flow', () => {
    runSquad(['upgrade', '--migrate-directory'], tmpDir);
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.ai-team')),
      '.ai-team/ should not be recreated after migration'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 5: .gitattributes has .squad/ rules after migrate+upgrade
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade --migrate-directory: .gitattributes correctness', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); makeOldSquadRepo(tmpDir); });
  afterEach(() => cleanDir(tmpDir));

  it('.gitattributes has .squad/ merge=union rules (not .ai-team/) after migrate+upgrade', () => {
    runSquad(['upgrade', '--migrate-directory'], tmpDir);
    const gitattributes = fs.readFileSync(path.join(tmpDir, '.gitattributes'), 'utf8');
    assert.ok(
      gitattributes.includes('.squad/'),
      '.gitattributes should reference .squad/ after migrate+upgrade'
    );
    // The upgrade step should not re-add .ai-team/ rules
    assert.ok(
      !gitattributes.includes('.ai-team/decisions.md merge=union'),
      'upgrade should not re-add .ai-team/ merge rules after migration'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 6: .slnx / .fsproj / .vbproj project type detection
// ─────────────────────────────────────────────────────────────────────────────

describe('detectProjectType: .NET extensions (.slnx, .fsproj, .vbproj)', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => cleanDir(tmpDir));

  it('init in a dir with .slnx generates a dotnet stub CI workflow', () => {
    fs.writeFileSync(path.join(tmpDir, 'MyApp.slnx'), '');
    const result = runSquad([], tmpDir);
    assert.equal(result.exitCode, 0, `init should succeed: ${result.stdout}`);

    const ciPath = path.join(tmpDir, '.github', 'workflows', 'squad-ci.yml');
    assert.ok(fs.existsSync(ciPath), 'squad-ci.yml should be created');
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    assert.ok(
      ciContent.includes('dotnet') || ciContent.toLowerCase().includes('dotnet'),
      `squad-ci.yml should reference dotnet for a .slnx project: ${ciContent.slice(0, 400)}`
    );
    // Should NOT be the npm workflow
    assert.ok(
      !ciContent.includes('npm ci') && !ciContent.includes('npm test'),
      'squad-ci.yml should not contain npm commands for a dotnet project'
    );
  });

  it('init in a dir with .fsproj generates a dotnet stub CI workflow', () => {
    fs.writeFileSync(path.join(tmpDir, 'MyLib.fsproj'), '');
    const result = runSquad([], tmpDir);
    assert.equal(result.exitCode, 0, `init should succeed: ${result.stdout}`);

    const ciPath = path.join(tmpDir, '.github', 'workflows', 'squad-ci.yml');
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    assert.ok(
      ciContent.includes('dotnet') || ciContent.toLowerCase().includes('dotnet'),
      `.fsproj project should generate dotnet stub: ${ciContent.slice(0, 400)}`
    );
  });

  it('init in a dir with .vbproj generates a dotnet stub CI workflow', () => {
    fs.writeFileSync(path.join(tmpDir, 'MyApp.vbproj'), '');
    const result = runSquad([], tmpDir);
    assert.equal(result.exitCode, 0, `init should succeed: ${result.stdout}`);

    const ciPath = path.join(tmpDir, '.github', 'workflows', 'squad-ci.yml');
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    assert.ok(
      ciContent.includes('dotnet') || ciContent.toLowerCase().includes('dotnet'),
      `.vbproj project should generate dotnet stub: ${ciContent.slice(0, 400)}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 7: migration from v0.3.0 — .slnx project gets dotnet workflow
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade --migrate-directory: .slnx project type detected during upgrade', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => cleanDir(tmpDir));

  it('.slnx project gets dotnet stub workflows after migrate+upgrade', () => {
    makeOldSquadRepo(tmpDir, { useSlnx: true });
    const result = runSquad(['upgrade', '--migrate-directory'], tmpDir);
    assert.equal(result.exitCode, 0, `migrate+upgrade should succeed: ${result.stdout}`);

    const ciPath = path.join(tmpDir, '.github', 'workflows', 'squad-ci.yml');
    assert.ok(fs.existsSync(ciPath), 'squad-ci.yml should exist after migrate+upgrade');
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    assert.ok(
      ciContent.includes('dotnet') || ciContent.toLowerCase().includes('dotnet'),
      `.slnx project should get dotnet stub after migrate+upgrade`
    );
    assert.ok(
      !ciContent.includes('npm ci') && !ciContent.includes('npm test'),
      'dotnet project should not have npm commands in CI workflow'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 8: upgrade from v0.3.0 (without --migrate-directory)
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade from v0.3.0 (without --migrate-directory)', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); makeOldSquadRepo(tmpDir); });
  afterEach(() => cleanDir(tmpDir));

  it('upgrades squad.agent.md to current version', () => {
    const result = runSquad(['upgrade'], tmpDir);
    assert.equal(result.exitCode, 0, `upgrade should succeed: ${result.stdout}`);

    const agentPath = path.join(tmpDir, '.github', 'agents', 'squad.agent.md');
    const content = fs.readFileSync(agentPath, 'utf8');
    assert.ok(
      content.includes(`<!-- version: ${pkg.version} -->`),
      `squad.agent.md should be at v${pkg.version} after upgrade from v0.3.0`
    );
  });

  it('upgrade from v0.3.0 creates .squad/plugins/ (migration 0.4.0)', () => {
    // v0.3.0 doesn't have plugins/ — migration 0.4.0 should create it
    runSquad(['upgrade'], tmpDir);
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.ai-team', 'plugins')),
      '.ai-team/plugins/ should be created by migration 0.4.0 during upgrade from 0.3.0'
    );
  });

  it('upgrade from v0.3.0 keeps .ai-team/ intact (no --migrate-directory)', () => {
    runSquad(['upgrade'], tmpDir);
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.ai-team')),
      '.ai-team/ should still exist after plain upgrade (no migration flag)'
    );
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.squad')),
      '.squad/ should not be created by plain upgrade without --migrate-directory'
    );
  });
});
