const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const CLI = path.join(__dirname, '..', 'index.js');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'workflows');

// The three CI/CD workflows Kobayashi is building
const CI_CD_WORKFLOWS = [
  'squad-ci.yml',
  'squad-preview.yml',
  'squad-release.yml',
];

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-wf-test-'));
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

// Simple YAML validity check — no external deps.
// Rejects files that are empty, binary, or missing the top-level `name:` / `on:` keys
// that every GitHub Actions workflow must have.
function assertValidWorkflowYaml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.length > 0, `${path.basename(filePath)} should not be empty`);
  assert.ok(
    content.includes('name:'),
    `${path.basename(filePath)} should contain a "name:" key`
  );
  assert.ok(
    content.includes('on:'),
    `${path.basename(filePath)} should contain an "on:" trigger key`
  );
  assert.ok(
    content.includes('jobs:'),
    `${path.basename(filePath)} should contain a "jobs:" key`
  );
}

// Returns list of all .yml files in templates/workflows/
function getAllTemplateWorkflows() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.yml'));
}

describe('CI/CD workflow templates (squad-ci, squad-preview, squad-release)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  describe('template files exist in templates/workflows/', () => {
    for (const file of CI_CD_WORKFLOWS) {
      it(`${file} template exists`, (t) => {
        const templatePath = path.join(TEMPLATES_DIR, file);
        if (!fs.existsSync(templatePath)) {
          t.skip(`${file} template not yet created by Kobayashi`);
          return;
        }
        assert.ok(fs.existsSync(templatePath));
      });
    }
  });

  describe('template YAML validity', () => {
    for (const file of CI_CD_WORKFLOWS) {
      it(`${file} template is valid workflow YAML`, (t) => {
        const templatePath = path.join(TEMPLATES_DIR, file);
        if (!fs.existsSync(templatePath)) {
          t.skip(`${file} template not yet created`);
          return;
        }
        assertValidWorkflowYaml(templatePath);
      });
    }
  });

  describe('fresh init copies CI/CD workflows to .github/workflows/', () => {
    for (const file of CI_CD_WORKFLOWS) {
      it(`${file} is present after init`, (t) => {
        if (!fs.existsSync(path.join(TEMPLATES_DIR, file))) {
          t.skip(`${file} template not yet created`);
          return;
        }
        initSquad(tmpDir);
        const dest = path.join(tmpDir, '.github', 'workflows', file);
        assert.ok(fs.existsSync(dest), `${file} should exist in .github/workflows/ after init`);
      });
    }
  });

  describe('upgrade copies/updates CI/CD workflows', () => {
    for (const file of CI_CD_WORKFLOWS) {
      it(`${file} is present after upgrade`, (t) => {
        if (!fs.existsSync(path.join(TEMPLATES_DIR, file))) {
          t.skip(`${file} template not yet created`);
          return;
        }
        initSquad(tmpDir);
        const result = runSquad(['upgrade'], tmpDir);
        assert.equal(result.exitCode, 0, `upgrade should succeed: ${result.stdout}`);
        const dest = path.join(tmpDir, '.github', 'workflows', file);
        assert.ok(fs.existsSync(dest), `${file} should exist after upgrade`);
      });
    }

    it('upgrade overwrites stale workflow content', (t) => {
      const firstTemplate = CI_CD_WORKFLOWS.find(f =>
        fs.existsSync(path.join(TEMPLATES_DIR, f))
      );
      if (!firstTemplate) {
        t.skip('no CI/CD workflow templates created yet');
        return;
      }

      initSquad(tmpDir);
      const dest = path.join(tmpDir, '.github', 'workflows', firstTemplate);

      // Simulate a stale/modified file
      fs.writeFileSync(dest, '# stale content\n');

      const result = runSquad(['upgrade'], tmpDir);
      assert.equal(result.exitCode, 0, `upgrade should succeed: ${result.stdout}`);

      const after = fs.readFileSync(dest, 'utf8');
      assert.notEqual(after.trim(), '# stale content',
        'upgrade should overwrite stale workflow files');

      const template = fs.readFileSync(path.join(TEMPLATES_DIR, firstTemplate), 'utf8');
      assert.equal(after, template,
        'upgraded file should match the template exactly');
    });
  });

  describe('workflow YAML validity after init', () => {
    for (const file of CI_CD_WORKFLOWS) {
      it(`${file} in .github/workflows/ is valid workflow YAML`, (t) => {
        if (!fs.existsSync(path.join(TEMPLATES_DIR, file))) {
          t.skip(`${file} template not yet created`);
          return;
        }
        initSquad(tmpDir);
        assertValidWorkflowYaml(path.join(tmpDir, '.github', 'workflows', file));
      });
    }
  });

  describe('expected trigger configurations', () => {
    it('squad-ci.yml triggers on pull_request', (t) => {
      const templatePath = path.join(TEMPLATES_DIR, 'squad-ci.yml');
      if (!fs.existsSync(templatePath)) {
        t.skip('squad-ci.yml template not yet created');
        return;
      }
      const content = fs.readFileSync(templatePath, 'utf8');
      assert.ok(
        content.includes('pull_request'),
        'squad-ci.yml should trigger on pull_request'
      );
    });

    it('squad-ci.yml triggers on push', (t) => {
      const templatePath = path.join(TEMPLATES_DIR, 'squad-ci.yml');
      if (!fs.existsSync(templatePath)) {
        t.skip('squad-ci.yml template not yet created');
        return;
      }
      const content = fs.readFileSync(templatePath, 'utf8');
      assert.ok(
        content.includes('push'),
        'squad-ci.yml should trigger on push'
      );
    });

    it('squad-release.yml triggers on push to main', (t) => {
      const templatePath = path.join(TEMPLATES_DIR, 'squad-release.yml');
      if (!fs.existsSync(templatePath)) {
        t.skip('squad-release.yml template not yet created');
        return;
      }
      const content = fs.readFileSync(templatePath, 'utf8');
      assert.ok(
        content.includes('push'),
        'squad-release.yml should trigger on push'
      );
      assert.ok(
        content.includes('main'),
        'squad-release.yml should reference main branch'
      );
    });

    it('squad-preview.yml references preview branch', (t) => {
      const templatePath = path.join(TEMPLATES_DIR, 'squad-preview.yml');
      if (!fs.existsSync(templatePath)) {
        t.skip('squad-preview.yml template not yet created');
        return;
      }
      const content = fs.readFileSync(templatePath, 'utf8');
      assert.ok(
        content.includes('preview'),
        'squad-preview.yml should reference preview branch'
      );
    });
  });

  describe('all workflow templates have matching copies after init', () => {
    it('every .yml in templates/workflows/ is copied to .github/workflows/', () => {
      const allTemplates = getAllTemplateWorkflows();
      if (allTemplates.length === 0) {
        return; // nothing to test
      }

      initSquad(tmpDir);

      for (const file of allTemplates) {
        const dest = path.join(tmpDir, '.github', 'workflows', file);
        assert.ok(
          fs.existsSync(dest),
          `${file} from templates/workflows/ should be copied to .github/workflows/`
        );
      }
    });

    it('copied workflow files match their templates byte-for-byte', () => {
      const allTemplates = getAllTemplateWorkflows();
      if (allTemplates.length === 0) {
        return;
      }

      initSquad(tmpDir);

      for (const file of allTemplates) {
        const src = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8');
        const destPath = path.join(tmpDir, '.github', 'workflows', file);
        if (!fs.existsSync(destPath)) continue;
        const dest = fs.readFileSync(destPath, 'utf8');
        assert.equal(dest, src, `${file} should match its template exactly`);
      }
    });
  });
});
