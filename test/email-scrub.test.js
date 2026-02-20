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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-email-scrub-test-'));
}

function cleanDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

describe('Email Scrubbing During Migration (#108)', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it('should scrub email addresses during migration', () => {
    // Create a fake .ai-team/ directory with email addresses
    const aiTeamDir = path.join(tempDir, '.ai-team');
    fs.mkdirSync(aiTeamDir, { recursive: true });

    // Create team.md with email addresses in various formats
    const teamMd = path.join(aiTeamDir, 'team.md');
    fs.writeFileSync(teamMd, `# Team Roster

- **Owner:** Brady Gaster (brady@example.com)
- **Member:** Jane Doe (jane.doe@example.org)

## Notes

Contact admin.
`);

    // Run migration
    const result = runSquad(['upgrade', '--migrate-directory'], tempDir);
    assert.equal(result.exitCode, 0, `Migration should succeed: ${result.stdout}`);

    // Check that .squad/ exists
    const squadDir = path.join(tempDir, '.squad');
    assert.ok(fs.existsSync(squadDir), '.squad/ should exist after migration');
    assert.ok(!fs.existsSync(aiTeamDir), '.ai-team/ should be renamed');

    // Verify email addresses are scrubbed from team.md
    const scrubbedTeamMd = fs.readFileSync(path.join(squadDir, 'team.md'), 'utf8');
    
    // The existing scrubber removes " (email)" pattern for names
    assert.ok(scrubbedTeamMd.includes('Brady Gaster'), 'team.md should keep names');
    assert.ok(scrubbedTeamMd.includes('Jane Doe'), 'team.md should keep names');
    assert.ok(!scrubbedTeamMd.includes('brady@example.com'), 'team.md should not have brady email');
    assert.ok(!scrubbedTeamMd.includes('jane.doe@example.org'), 'team.md should not have jane email');

    // Verify the scrubbing was reported
    assert.ok(result.stdout.includes('Scrubbing') || result.stdout.includes('email'), 
      'Output should mention scrubbing');
  });

  it('should scrub email addresses during regular upgrade', () => {
    // Initialize squad first
    runSquad([], tempDir);

    // Manually add email addresses to .squad/team.md
    const squadDir = path.join(tempDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    
    const teamMd = path.join(squadDir, 'team.md');
    fs.writeFileSync(teamMd, `# Team

- Alice (alice@example.com)
- Bob (bob@test.org)
`);

    // Run upgrade (without --migrate-directory)
    const result = runSquad(['upgrade'], tempDir);
    assert.equal(result.exitCode, 0, `Upgrade should succeed: ${result.stdout}`);

    // Verify emails are scrubbed
    const scrubbedTeamMd = fs.readFileSync(teamMd, 'utf8');
    assert.ok(scrubbedTeamMd.includes('Alice'), 'team.md should keep names');
    assert.ok(scrubbedTeamMd.includes('Bob'), 'team.md should keep names');
    assert.ok(!scrubbedTeamMd.includes('alice@example.com'), 'team.md should not have alice email');
    assert.ok(!scrubbedTeamMd.includes('bob@test.org'), 'team.md should not have bob email');

    // Verify the scrubbing was reported
    assert.ok(result.stdout.includes('Scrubbing') || result.stdout.includes('email'), 
      'Output should mention email scrubbing');
  });

  it('should handle files without email addresses gracefully', () => {
    // Initialize squad
    runSquad([], tempDir);

    // Create .squad/team.md without emails
    const squadDir = path.join(tempDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    
    const teamMd = path.join(squadDir, 'team.md');
    fs.writeFileSync(teamMd, `# Team

- Alice
- Bob
`);

    // Run upgrade
    const result = runSquad(['upgrade'], tempDir);
    assert.equal(result.exitCode, 0, `Upgrade should succeed: ${result.stdout}`);

    // Verify file is unchanged
    const content = fs.readFileSync(teamMd, 'utf8');
    assert.ok(content.includes('Alice'), 'team.md should be unchanged');
    assert.ok(content.includes('Bob'), 'team.md should be unchanged');

    // Verify the result mentions scrubbing check
    assert.ok(result.stdout.includes('Scrubbing') || result.stdout.includes('email'), 
      'Output should mention email scrubbing');
  });
});
