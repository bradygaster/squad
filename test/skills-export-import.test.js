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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-skills-test-'));
}

function cleanDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function initSquad(dir) {
  const result = runSquad([], dir);
  assert.equal(result.exitCode, 0, `init should succeed: ${result.stdout}`);
  
  // Create a minimal team.md file (normally created by Squad agent during init conversation)
  const teamMdDir = path.join(dir, '.ai-team');
  const teamMdPath = path.join(teamMdDir, 'team.md');
  if (!fs.existsSync(teamMdPath)) {
    fs.mkdirSync(teamMdDir, { recursive: true });
    fs.writeFileSync(teamMdPath, '# Team Roster\n\nTest team for skills export/import testing.\n');
  }
  
  return result;
}

describe('Skills survive export/import round-trip (#82)', () => {
  let tmpDir1;
  let tmpDir2;

  beforeEach(() => {
    tmpDir1 = makeTempDir();
    tmpDir2 = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tmpDir1);
    cleanDir(tmpDir2);
  });

  it('exports skills to JSON manifest', () => {
    // Initialize squad in first temp dir
    initSquad(tmpDir1);

    // Create a test skill
    const skillDir = path.join(tmpDir1, '.ai-team', 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    const skillContent = `---
name: test-skill
confidence: medium
---

# Test Skill

This is a test skill for verifying export/import functionality.

## Pattern
- Step 1: Do something
- Step 2: Do something else

## Learned from
- Test session
`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

    // Export the team
    const exportPath = path.join(tmpDir1, 'squad-export.json');
    const exportResult = runSquad(['export'], tmpDir1);
    assert.equal(exportResult.exitCode, 0, `export should succeed: ${exportResult.stdout}`);
    assert.ok(fs.existsSync(exportPath), 'export file should be created');

    // Read and verify the export contains skills
    const manifest = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    assert.ok(Array.isArray(manifest.skills), 'manifest should have skills array');
    assert.ok(manifest.skills.length > 0, 'skills array should not be empty');

    // Verify our test skill is in the export
    const hasTestSkill = manifest.skills.some(skill => skill.includes('test-skill'));
    assert.ok(hasTestSkill, 'exported skills should include test-skill');
  });

  it('imports skills from JSON manifest', () => {
    // Initialize squad in first temp dir
    initSquad(tmpDir1);

    // Create a test skill with unique content
    const skillDir = path.join(tmpDir1, '.ai-team', 'skills', 'import-test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    const skillContent = `---
name: import-test-skill
confidence: high
---

# Import Test Skill

This skill has unique content to verify import works correctly.

## Pattern
- Unique pattern step A
- Unique pattern step B
- Unique pattern step C

## Learned from
- Import test session (v1.2.3)
`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

    // Export the team
    const exportPath = path.join(tmpDir1, 'squad-export.json');
    const exportResult = runSquad(['export'], tmpDir1);
    assert.equal(exportResult.exitCode, 0, `export should succeed: ${exportResult.stdout}`);

    // Initialize squad in second temp dir (to have .ai-team structure)
    initSquad(tmpDir2);

    // Import into second temp dir with --force
    const importResult = runSquad(['import', exportPath, '--force'], tmpDir2);
    assert.equal(importResult.exitCode, 0, `import should succeed: ${importResult.stdout}`);

    // Verify the skill exists in the new directory
    const importedSkillPath = path.join(tmpDir2, '.ai-team', 'skills', 'import-test-skill', 'SKILL.md');
    assert.ok(fs.existsSync(importedSkillPath), 'imported skill file should exist');

    // Verify the content matches
    const importedContent = fs.readFileSync(importedSkillPath, 'utf8');
    assert.equal(importedContent, skillContent, 'imported skill content should match original');
  });

  it('preserves multiple skills during export/import', () => {
    // Initialize squad in first temp dir
    initSquad(tmpDir1);

    // Create multiple test skills
    const skills = [
      { name: 'skill-alpha', content: 'Alpha skill content' },
      { name: 'skill-beta', content: 'Beta skill content' },
      { name: 'skill-gamma', content: 'Gamma skill content' },
    ];

    for (const skill of skills) {
      const skillDir = path.join(tmpDir1, '.ai-team', 'skills', skill.name);
      fs.mkdirSync(skillDir, { recursive: true });
      const skillContent = `---
name: ${skill.name}
confidence: low
---

# ${skill.name}

${skill.content}
`;
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);
    }

    // Export the team
    const exportPath = path.join(tmpDir1, 'squad-export.json');
    const exportResult = runSquad(['export'], tmpDir1);
    assert.equal(exportResult.exitCode, 0, `export should succeed: ${exportResult.stdout}`);

    // Read manifest and verify skill count
    const manifest = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    // Should have at least our 3 skills (may have starter skills too)
    assert.ok(manifest.skills.length >= 3, 'should have at least 3 skills in export');

    // Initialize squad in second temp dir
    initSquad(tmpDir2);

    // Import into second temp dir with --force
    const importResult = runSquad(['import', exportPath, '--force'], tmpDir2);
    assert.equal(importResult.exitCode, 0, `import should succeed: ${importResult.stdout}`);

    // Verify all skills exist
    for (const skill of skills) {
      const importedSkillPath = path.join(tmpDir2, '.ai-team', 'skills', skill.name, 'SKILL.md');
      assert.ok(fs.existsSync(importedSkillPath), `skill ${skill.name} should exist after import`);

      const content = fs.readFileSync(importedSkillPath, 'utf8');
      assert.ok(content.includes(skill.content), `skill ${skill.name} should have correct content`);
    }
  });

  it('preserves skill confidence levels during export/import', () => {
    // Initialize squad in first temp dir
    initSquad(tmpDir1);

    // Create a skill with high confidence
    const skillDir = path.join(tmpDir1, '.ai-team', 'skills', 'confidence-test');
    fs.mkdirSync(skillDir, { recursive: true });
    const skillContent = `---
name: confidence-test
confidence: high
---

# Confidence Test Skill

This skill should maintain its high confidence level after import.
`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

    // Export
    const exportPath = path.join(tmpDir1, 'squad-export.json');
    runSquad(['export'], tmpDir1);

    // Initialize and import
    initSquad(tmpDir2);
    runSquad(['import', exportPath, '--force'], tmpDir2);

    // Verify confidence is preserved
    const importedSkillPath = path.join(tmpDir2, '.ai-team', 'skills', 'confidence-test', 'SKILL.md');
    const importedContent = fs.readFileSync(importedSkillPath, 'utf8');
    assert.ok(importedContent.includes('confidence: high'), 'skill confidence level should be preserved');
  });

  it('reports skill count in import output', () => {
    // Initialize squad in first temp dir
    initSquad(tmpDir1);

    // Create a skill
    const skillDir = path.join(tmpDir1, '.ai-team', 'skills', 'report-test');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: report-test
---

# Report Test Skill
`);

    // Export
    const exportPath = path.join(tmpDir1, 'squad-export.json');
    runSquad(['export'], tmpDir1);

    // Initialize and import
    initSquad(tmpDir2);
    const importResult = runSquad(['import', exportPath, '--force'], tmpDir2);

    // Verify import output mentions skills
    assert.ok(importResult.stdout.includes('skill'), 'import output should mention skills');
  });
});
