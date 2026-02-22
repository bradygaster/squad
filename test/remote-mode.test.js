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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-remote-mode-test-'));
}

function cleanDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function stripAnsi(text) {
  return text.replace(/\x1B\[[0-9;]*m/g, '');
}

describe('Remote mode init', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('--mode remote --team-root creates thin local config and local/team artifacts', () => {
    const projectDir = path.join(tmpDir, 'project');
    const teamRoot = path.join(tmpDir, 'team-root');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(teamRoot, { recursive: true });

    const result = runSquad(['--mode', 'remote', '--team-root', teamRoot], projectDir);
    assert.equal(result.exitCode, 0, `remote init should succeed: ${result.stdout}`);

    const projectSquadDir = path.join(projectDir, '.squad');
    const configPath = path.join(projectSquadDir, 'config.json');
    assert.ok(fs.existsSync(configPath), '.squad/config.json should exist');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const expectedRelative = path.relative(projectDir, teamRoot) || '.';
    assert.equal(config.teamRoot, expectedRelative, 'config should store relative teamRoot path');
    assert.ok(!fs.existsSync(path.join(projectSquadDir, 'team.md')), 'project .squad should remain thin in remote mode');

    assert.ok(fs.existsSync(path.join(projectSquadDir, 'decisions.md')), 'project decisions.md should exist');
    assert.ok(fs.existsSync(path.join(projectSquadDir, 'decisions', 'inbox')), 'project decisions/inbox should exist');
    assert.ok(fs.existsSync(path.join(projectSquadDir, 'log')), 'project log/ should exist');
    assert.ok(fs.existsSync(path.join(projectSquadDir, 'orchestration-log')), 'project orchestration-log/ should exist');

    assert.ok(fs.existsSync(path.join(teamRoot, 'team.md')), 'teamRoot/team.md should exist');
    assert.ok(fs.existsSync(path.join(teamRoot, 'agents')), 'teamRoot/agents should exist');
    assert.ok(fs.existsSync(path.join(teamRoot, 'casting')), 'teamRoot/casting should exist');
    assert.ok(fs.existsSync(path.join(teamRoot, 'skills')), 'teamRoot/skills should exist');
    assert.ok(fs.existsSync(path.join(teamRoot, 'identity')), 'teamRoot/identity should exist');
  });

  it('local mode (no flags) still initializes project-local squad normally', () => {
    const projectDir = path.join(tmpDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    const result = runSquad([], projectDir);
    assert.equal(result.exitCode, 0, `local init should succeed: ${result.stdout}`);

    assert.ok(fs.existsSync(path.join(projectDir, '.squad')), 'local init should create .squad/');
    assert.ok(fs.existsSync(path.join(projectDir, '.squad', 'ceremonies.md')), 'local init should create .squad/ceremonies.md');
    assert.ok(!fs.existsSync(path.join(projectDir, '.squad', 'config.json')), 'local init should not create remote config.json');
  });

  it('fails if --team-root does not exist', () => {
    const projectDir = path.join(tmpDir, 'project');
    const missingTeamRoot = path.join(tmpDir, 'does-not-exist');
    fs.mkdirSync(projectDir, { recursive: true });

    const result = runSquad(['--mode', 'remote', '--team-root', missingTeamRoot], projectDir);
    assert.notEqual(result.exitCode, 0, 'remote init should fail when teamRoot is missing');
    assert.ok(result.stdout.includes('Team root not found or not a directory'), `unexpected output: ${result.stdout}`);
  });
});

describe('Link command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('link --team-root writes config pointing to an existing team root', () => {
    const projectDir = path.join(tmpDir, 'project');
    const teamRoot = path.join(tmpDir, 'shared-team');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(teamRoot, { recursive: true });
    fs.writeFileSync(path.join(teamRoot, 'team.md'), '## Members\n');

    const result = runSquad(['link', '--team-root', teamRoot], projectDir);
    assert.equal(result.exitCode, 0, `link should succeed: ${result.stdout}`);

    const configPath = path.join(projectDir, '.squad', 'config.json');
    assert.ok(fs.existsSync(configPath), '.squad/config.json should exist after link');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.teamRoot, path.relative(projectDir, teamRoot) || '.', 'link should store relative teamRoot path');

    assert.ok(fs.existsSync(path.join(projectDir, '.squad', 'decisions.md')), 'link should create local decisions.md');
    assert.ok(fs.existsSync(path.join(projectDir, '.squad', 'log')), 'link should create local log/ dir');
    assert.ok(fs.existsSync(path.join(projectDir, '.squad', 'orchestration-log')), 'link should create local orchestration-log/ dir');
  });

  it('fails if team root is missing team.md', () => {
    const projectDir = path.join(tmpDir, 'project');
    const invalidTeamRoot = path.join(tmpDir, 'invalid-team-root');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(invalidTeamRoot, { recursive: true });

    const result = runSquad(['link', '--team-root', invalidTeamRoot], projectDir);
    assert.notEqual(result.exitCode, 0, 'link should fail for invalid team root');
    assert.ok(result.stdout.includes('Invalid team root: missing team.md'), `unexpected output: ${result.stdout}`);
  });
});

describe('Repo commands', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('repo init creates squad-manifest.json', () => {
    const squadRepoDir = path.join(tmpDir, 'squad-repo');
    fs.mkdirSync(squadRepoDir, { recursive: true });

    const result = runSquad(['repo', 'init'], squadRepoDir);
    assert.equal(result.exitCode, 0, `repo init should succeed: ${result.stdout}`);
    assert.ok(fs.existsSync(path.join(squadRepoDir, 'squad-manifest.json')), 'repo init should create squad-manifest.json');
  });

  it('repo link creates project config and updates repo manifest', () => {
    const squadRepoDir = path.join(tmpDir, 'squad-repo');
    const projectDir = path.join(tmpDir, 'project');
    fs.mkdirSync(squadRepoDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    const initResult = runSquad(['repo', 'init'], squadRepoDir);
    assert.equal(initResult.exitCode, 0, `repo init should succeed: ${initResult.stdout}`);

    const linkResult = runSquad(['repo', 'link', squadRepoDir], projectDir);
    assert.equal(linkResult.exitCode, 0, `repo link should succeed: ${linkResult.stdout}`);

    const configPath = path.join(projectDir, '.squad', 'config.json');
    assert.ok(fs.existsSync(configPath), 'repo link should create .squad/config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.teamRoot, path.relative(projectDir, squadRepoDir) || '.', 'repo link should store relative repo path');

    const manifest = JSON.parse(fs.readFileSync(path.join(squadRepoDir, 'squad-manifest.json'), 'utf8'));
    const expectedProjectRef = path.relative(squadRepoDir, projectDir) || '.';
    const hasProject = manifest.projects.some(project => {
      if (typeof project === 'string') return project === expectedProjectRef;
      return project && project.path === expectedProjectRef;
    });
    assert.ok(hasProject, 'repo link should add project reference to manifest');
  });

  it('repo link fails when target squad repo has no manifest', () => {
    const projectDir = path.join(tmpDir, 'project');
    const invalidRepo = path.join(tmpDir, 'invalid-squad-repo');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(invalidRepo, { recursive: true });

    const result = runSquad(['repo', 'link', invalidRepo], projectDir);
    assert.notEqual(result.exitCode, 0, 'repo link should fail without squad-manifest.json');
    assert.ok(result.stdout.includes('missing squad-manifest.json'), `unexpected output: ${result.stdout}`);
  });
});

describe('Hub commands', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('hub init creates squad-hub.json and squads directory', () => {
    const hubDir = path.join(tmpDir, 'hub');
    fs.mkdirSync(hubDir, { recursive: true });

    const result = runSquad(['hub', 'init'], hubDir);
    assert.equal(result.exitCode, 0, `hub init should succeed: ${result.stdout}`);
    assert.ok(fs.existsSync(path.join(hubDir, 'squad-hub.json')), 'hub init should create squad-hub.json');
    assert.ok(fs.existsSync(path.join(hubDir, 'squads')), 'hub init should create squads/ directory');
  });

  it('hub add creates squad structure and updates squad-hub.json', () => {
    const hubDir = path.join(tmpDir, 'hub');
    fs.mkdirSync(hubDir, { recursive: true });
    runSquad(['hub', 'init'], hubDir);

    const addResult = runSquad(['hub', 'add', 'checkout-api'], hubDir);
    assert.equal(addResult.exitCode, 0, `hub add should succeed: ${addResult.stdout}`);

    const squadRoot = path.join(hubDir, 'squads', 'checkout-api');
    assert.ok(fs.existsSync(path.join(squadRoot, 'team.md')), 'hub add should create team.md');
    assert.ok(fs.existsSync(path.join(squadRoot, 'agents')), 'hub add should create agents/ directory');
    assert.ok(fs.existsSync(path.join(squadRoot, 'casting')), 'hub add should create casting/ directory');

    const hubConfig = JSON.parse(fs.readFileSync(path.join(hubDir, 'squad-hub.json'), 'utf8'));
    const hasEntry = Array.isArray(hubConfig.squads) && hubConfig.squads.some(s => s && s.key === 'checkout-api');
    assert.ok(hasEntry, 'hub add should append squad entry to squad-hub.json');
  });

  it('hub add fails if hub is not initialized', () => {
    const hubDir = path.join(tmpDir, 'hub');
    fs.mkdirSync(hubDir, { recursive: true });

    const result = runSquad(['hub', 'add', 'no-hub-yet'], hubDir);
    assert.notEqual(result.exitCode, 0, 'hub add should fail when no hub exists');
    assert.ok(result.stdout.includes('No hub found'), `unexpected output: ${result.stdout}`);
  });

  it('hub list shows squads and does not crash', () => {
    const hubDir = path.join(tmpDir, 'hub');
    fs.mkdirSync(hubDir, { recursive: true });
    runSquad(['hub', 'init'], hubDir);
    runSquad(['hub', 'add', 'payments'], hubDir);

    const listResult = runSquad(['hub', 'list'], hubDir);
    assert.equal(listResult.exitCode, 0, `hub list should succeed: ${listResult.stdout}`);
    assert.ok(listResult.stdout.includes('payments') || listResult.stdout.includes('Squad Hub'),
      `hub list output should include squad data: ${listResult.stdout}`);
  });
});

describe('Doctor command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('doctor on healthy local setup reports no failures', () => {
    const projectDir = path.join(tmpDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    const initResult = runSquad([], projectDir);
    assert.equal(initResult.exitCode, 0, `init should succeed: ${initResult.stdout}`);

    fs.mkdirSync(path.join(projectDir, '.squad', 'agents', 'scribe'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, '.squad', 'casting'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.squad', 'team.md'), '## Members\n');
    fs.writeFileSync(path.join(projectDir, '.squad', 'routing.md'), '');
    fs.writeFileSync(path.join(projectDir, '.squad', 'decisions.md'), '');
    fs.writeFileSync(path.join(projectDir, '.squad', 'casting', 'registry.json'), '{"agents": []}\n');

    const doctorResult = runSquad(['doctor'], projectDir);
    const output = stripAnsi(doctorResult.stdout);
    assert.equal(doctorResult.exitCode, 0, `doctor should run: ${doctorResult.stdout}`);
    assert.ok(output.includes('Mode: local'), `doctor should detect local mode: ${output}`);
    assert.match(output, /Summary:\s+\d+\s+passed,\s+0\s+failed/, `doctor should report all green: ${output}`);
  });

  it('doctor on empty directory reports failures', () => {
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });

    const doctorResult = runSquad(['doctor'], emptyDir);
    const output = stripAnsi(doctorResult.stdout);
    assert.equal(doctorResult.exitCode, 0, 'doctor should complete even when checks fail');
    assert.match(output, /Summary:\s+\d+\s+passed,\s+[1-9]\d*\s+failed/, `doctor should report failures: ${output}`);
  });

  it('doctor in remote mode validates teamRoot path', () => {
    const projectDir = path.join(tmpDir, 'project');
    const teamRoot = path.join(tmpDir, 'remote-team');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(teamRoot, { recursive: true });

    const initResult = runSquad(['--mode', 'remote', '--team-root', teamRoot], projectDir);
    assert.equal(initResult.exitCode, 0, `remote init should succeed: ${initResult.stdout}`);

    const configPath = path.join(projectDir, '.squad', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.teamRoot = teamRoot;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    fs.mkdirSync(path.join(teamRoot, 'agents', 'scribe'), { recursive: true });
    fs.mkdirSync(path.join(teamRoot, 'casting'), { recursive: true });
    fs.writeFileSync(path.join(teamRoot, 'casting', 'registry.json'), '{"agents": []}\n');

    const doctorResult = runSquad(['doctor'], projectDir);
    const output = stripAnsi(doctorResult.stdout);
    assert.equal(doctorResult.exitCode, 0, `doctor should run: ${doctorResult.stdout}`);
    assert.ok(output.includes('Mode: remote'), `doctor should detect remote mode: ${output}`);
    assert.ok(output.includes('teamRoot path resolves to an existing directory'), `doctor should validate teamRoot: ${output}`);
    assert.ok(!output.includes('teamRoot path resolves to an existing directory — not found'),
      `doctor should resolve teamRoot in remote mode: ${output}`);
  });

  it('doctor on hub validates configured squads', () => {
    const hubDir = path.join(tmpDir, 'hub');
    fs.mkdirSync(hubDir, { recursive: true });
    runSquad(['hub', 'init'], hubDir);
    runSquad(['hub', 'add', 'catalog'], hubDir);

    const doctorResult = runSquad(['doctor'], hubDir);
    const output = stripAnsi(doctorResult.stdout);
    assert.equal(doctorResult.exitCode, 0, `doctor should run for hub: ${doctorResult.stdout}`);
    assert.ok(output.includes('Mode: hub'), `doctor should detect hub mode: ${output}`);
    assert.ok(output.includes('squads/catalog/team.md found'), `doctor should validate hub squad team.md: ${output}`);
  });
});
