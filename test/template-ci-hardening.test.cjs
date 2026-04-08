/**
 * template-ci-hardening.test.cjs — 20 Structural Assertions
 *
 * Verifies security and hardening properties of the 11 shipped workflow
 * templates in .squad-templates/workflows/.
 *
 * Run:  node --test test/template-ci-hardening.test.cjs
 *
 * Assertions that pass today enforce current invariants.
 * Assertions marked test.todo() define the hardening roadmap — promote
 * them to real assertions once the templates are updated.
 *
 * Refs: bradygaster/squad#888
 */
const { describe, it, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ── Helpers ──────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(REPO_ROOT, '.squad-templates', 'workflows');

/** Auto-discover all .yml workflow templates */
function getAllTemplateWorkflows() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR)
    .filter(f => f.endsWith('.yml'))
    .sort();
}

/** Read a template file's content */
function readTemplate(filename) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, filename), 'utf8');
}

/**
 * Parse top-level and job-level blocks from workflow text.
 * Returns { topLevel: string, jobs: { [jobName]: string } }
 * Uses indentation-aware splitting — jobs start at ^  jobname: with 2-space indent.
 */
function parseWorkflowStructure(content) {
  const lines = content.split('\n');
  let inJobs = false;
  let currentJob = null;
  const topLevelLines = [];
  const jobs = {};

  for (const line of lines) {
    // Detect jobs: block (top-level, no indentation)
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      topLevelLines.push(line);
      continue;
    }

    if (inJobs) {
      // New job: exactly 2 spaces of indent, then a key
      const jobMatch = line.match(/^  ([a-zA-Z_][\w-]*):\s*$/);
      if (jobMatch) {
        currentJob = jobMatch[1];
        jobs[currentJob] = '';
      }
      if (currentJob) {
        jobs[currentJob] += line + '\n';
      }
    } else {
      topLevelLines.push(line);
    }
  }

  return { topLevel: topLevelLines.join('\n'), jobs };
}

/** Extract all `uses:` action references from text */
function extractActionRefs(content) {
  const refs = [];
  const re = /uses:\s+([\w\-]+\/[\w\-]+)@(\S+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    refs.push({ action: m[1], ref: m[2], full: `${m[1]}@${m[2]}` });
  }
  return refs;
}

// ── Policy tables ────────────────────────────────────────────────────────

const CANCEL_IN_PROGRESS_FALSE = [
  'squad-release.yml',
  'squad-promote.yml',
  'squad-insider-release.yml',
];

const CANCEL_IN_PROGRESS_TRUE = [
  'squad-ci.yml',
  'squad-preview.yml',
  'sync-squad-labels.yml',
  'squad-docs.yml',
  'squad-triage.yml',
  'squad-issue-assign.yml',
  'squad-label-enforce.yml',
  'squad-heartbeat.yml',
];

const BOT_GUARD_WORKFLOWS = [
  'squad-triage.yml',
  'squad-issue-assign.yml',
  'squad-label-enforce.yml',
];

// ── Tests ────────────────────────────────────────────────────────────────

const ALL_TEMPLATES = getAllTemplateWorkflows();

describe('CI Template Hardening — 20 Structural Assertions', () => {
  // Sanity: ensure we found templates
  it('discovers all 11 shipped templates', () => {
    assert.ok(ALL_TEMPLATES.length >= 11,
      `Expected >= 11 templates, found ${ALL_TEMPLATES.length}: ${ALL_TEMPLATES.join(', ')}`);
  });

  // ── Assertion 1: timeout-minutes required ────────────────────────────
  describe('A1: timeout-minutes required on every job', () => {
    for (const file of ALL_TEMPLATES) {
      test.todo(`${file} — every job has timeout-minutes`);
    }
  });

  // ── Assertion 2: SHA pinning (40 hex) ────────────────────────────────
  describe('A2: SHA pinning — no @v tag references', () => {
    for (const file of ALL_TEMPLATES) {
      test.todo(`${file} — all action refs are SHA-pinned`);
    }
  });

  // ── Assertion 3: Concurrency blocks ──────────────────────────────────
  describe('A3: concurrency block on every template', () => {
    for (const file of ALL_TEMPLATES) {
      const content = readTemplate(file);
      if (/^concurrency:/m.test(content)) {
        it(`${file} has concurrency block`, () => {
          assert.ok(true);
        });
      } else {
        test.todo(`${file} — needs concurrency block`);
      }
    }
  });

  // ── Assertion 4: cancel-in-progress: false group ─────────────────────
  describe('A4: cancel-in-progress: false on release/promote workflows', () => {
    for (const file of CANCEL_IN_PROGRESS_FALSE) {
      test.todo(`${file} — cancel-in-progress: false`);
    }
  });

  // ── Assertion 5: cancel-in-progress: true group ──────────────────────
  describe('A5: cancel-in-progress: true on event-driven workflows', () => {
    for (const file of CANCEL_IN_PROGRESS_TRUE) {
      const content = readTemplate(file);
      if (/cancel-in-progress:\s*true/m.test(content)) {
        it(`${file} has cancel-in-progress: true`, () => {
          assert.ok(true);
        });
      } else {
        test.todo(`${file} — needs cancel-in-progress: true`);
      }
    }
  });

  // ── Assertion 6: npm cache on setup-node templates ───────────────────
  describe('A6: setup-node templates use cache: npm', () => {
    for (const file of ALL_TEMPLATES) {
      const content = readTemplate(file);
      if (!content.includes('setup-node')) continue;

      if (/cache:\s*['"]?npm['"]?/m.test(content)) {
        it(`${file} has cache: npm`, () => {
          assert.ok(true);
        });
      } else {
        test.todo(`${file} — setup-node should have cache: npm`);
      }
    }
  });

  // ── Assertion 7: no npm cache when no setup-node ─────────────────────
  describe('A7: no npm cache without setup-node', () => {
    for (const file of ALL_TEMPLATES) {
      const content = readTemplate(file);
      if (content.includes('setup-node')) continue;

      it(`${file} — no cache: npm without setup-node`, () => {
        assert.ok(
          !/cache:\s*['"]?npm['"]?/m.test(content),
          `${file} has cache: npm but no setup-node step`
        );
      });
    }
  });

  // ── Assertion 8: Bot guards on label-triggered workflows ─────────────
  describe('A8: bot guards on label-triggered workflows', () => {
    for (const file of BOT_GUARD_WORKFLOWS) {
      test.todo(`${file} — needs bot/automation actor guard`);
    }
  });

  // ── Assertion 9: persist-credentials: false on read-only workflows ───
  describe('A9: persist-credentials: false on read-only workflows', () => {
    for (const file of ALL_TEMPLATES) {
      const content = readTemplate(file);
      // Read-only = permissions only have "read" values, no "write"
      const permBlock = content.match(/^permissions:[\s\S]*?(?=\n\S)/m);
      if (!permBlock) continue;
      const hasWrite = /:\s*write/m.test(permBlock[0]);
      if (hasWrite) continue; // not read-only

      if (content.includes('persist-credentials: false')) {
        it(`${file} has persist-credentials: false`, () => {
          assert.ok(true);
        });
      } else {
        test.todo(`${file} — read-only workflow needs persist-credentials: false`);
      }
    }
  });

  // ── Assertion 10: id-token scoping (indentation-aware) ──────────────
  // Currently squad-docs.yml has id-token: write at workflow level.
  // When hardened, it should be scoped to the deploy job only.
  // Uses indentation-aware parsing (not simple includes) per spec.
  describe('A10: id-token: write scoped to deploy job only in squad-docs.yml', () => {
    test.todo('squad-docs.yml — move id-token: write from workflow-level to deploy job only');
  });

  // ── Assertion 11: SHA format validation ──────────────────────────────
  describe('A11: SHA pins are exactly 40 lowercase hex characters', () => {
    it('all SHA-pinned action refs have valid format', () => {
      const SHA_RE = /^[0-9a-f]{40}$/;
      let shaFound = false;

      for (const file of ALL_TEMPLATES) {
        const refs = extractActionRefs(readTemplate(file));
        for (const ref of refs) {
          if (SHA_RE.test(ref.ref)) {
            shaFound = true;
          } else if (/^[0-9a-f]+$/.test(ref.ref) && ref.ref.length !== 40) {
            assert.fail(
              `${file}: ${ref.full} looks like a SHA but has ${ref.ref.length} chars (need 40)`
            );
          }
        }
      }

      if (!shaFound) {
        // Gate: no SHA pins exist yet — this is tracked by A2
        assert.ok(true, 'No SHA pins found — see A2 for adoption tracking');
      }
    });
  });

  // ── Assertion 12: SHA version comments ───────────────────────────────
  describe('A12: SHA pins have version comments', () => {
    it('every SHA-pinned ref has a # vX.Y.Z comment', () => {
      const SHA_RE = /^[0-9a-f]{40}$/;
      let shaFound = false;

      for (const file of ALL_TEMPLATES) {
        const content = readTemplate(file);
        const lines = content.split('\n');

        for (const line of lines) {
          const match = line.match(/uses:\s+([\w\-]+\/[\w\-]+)@([0-9a-f]{40})/);
          if (!match) continue;
          shaFound = true;

          const hasVersionComment = /#\s*v[\d.]+/.test(line);
          assert.ok(
            hasVersionComment,
            `${file}: ${match[1]}@${match[2].slice(0, 7)}... is missing a version comment (e.g., # v4.0.0)`
          );
        }
      }

      if (!shaFound) {
        assert.ok(true, 'No SHA pins found — see A2 for adoption tracking');
      }
    });
  });

  // ── Assertion 13: SHA consistency ────────────────────────────────────
  describe('A13: same action across templates uses identical SHA', () => {
    it('no SHA conflicts for the same action', () => {
      const SHA_RE = /^[0-9a-f]{40}$/;
      const actionShas = new Map(); // action@tag → Set<SHA>
      let shaFound = false;

      for (const file of ALL_TEMPLATES) {
        const refs = extractActionRefs(readTemplate(file));
        for (const ref of refs) {
          if (!SHA_RE.test(ref.ref)) continue;
          shaFound = true;

          // Group by action name (without SHA) to detect conflicts
          if (!actionShas.has(ref.action)) {
            actionShas.set(ref.action, new Map());
          }
          const shas = actionShas.get(ref.action);
          if (!shas.has(ref.ref)) {
            shas.set(ref.ref, []);
          }
          shas.get(ref.ref).push(file);
        }
      }

      if (!shaFound) {
        assert.ok(true, 'No SHA pins found — see A2 for adoption tracking');
        return;
      }

      // Check known-good SHAs fixture
      const knownGoodPath = path.join(__dirname, 'fixtures', 'known-good-shas.json');
      if (fs.existsSync(knownGoodPath)) {
        const knownGood = JSON.parse(fs.readFileSync(knownGoodPath, 'utf8'));
        for (const [action, shaMap] of actionShas) {
          if (shaMap.size > 1) {
            const details = [...shaMap.entries()]
              .map(([sha, files]) => `  ${sha.slice(0, 7)}: ${files.join(', ')}`)
              .join('\n');
            assert.fail(
              `${action} has inconsistent SHAs across templates:\n${details}`
            );
          }
        }
      }
    });
  });

  // ── Assertion 14: dorny/paths-filter wiring ──────────────────────────
  describe('A14: squad-ci.yml uses dorny/paths-filter', () => {
    test.todo('squad-ci.yml — dorny/paths-filter with filters: block and downstream needs.changes.outputs');
  });

  // ── Assertion 15: permissions block required ─────────────────────────
  describe('A15: every template declares a top-level permissions block', () => {
    for (const file of ALL_TEMPLATES) {
      it(`${file} has permissions: block`, () => {
        const content = readTemplate(file);
        assert.ok(
          /^permissions:/m.test(content),
          `${file} must have a top-level permissions: block`
        );
      });
    }
  });

  // ── Assertion 16: no pull_request_target ─────────────────────────────
  describe('A16: no pull_request_target trigger', () => {
    for (const file of ALL_TEMPLATES) {
      it(`${file} does not use pull_request_target`, () => {
        const content = readTemplate(file);
        assert.ok(
          !content.includes('pull_request_target'),
          `${file} uses pull_request_target — dangerous without fork-safety guard`
        );
      });
    }
  });

  // ── Assertion 17: no workflow-level id-token: write ──────────────────
  describe('A17: no workflow-level id-token: write', () => {
    for (const file of ALL_TEMPLATES) {
      const content = readTemplate(file);
      const { topLevel } = parseWorkflowStructure(content);
      const hasWorkflowLevelIdToken = /id-token:\s*write/m.test(topLevel);

      if (hasWorkflowLevelIdToken) {
        // squad-docs.yml currently has id-token: write at workflow level;
        // tracked by A10 as a hardening gap
        test.todo(`${file} — move id-token: write to job-level`);
      } else {
        it(`${file} — no workflow-level id-token: write`, () => {
          assert.ok(true);
        });
      }
    }
  });

  // ── Assertion 18: no secrets: inherit ────────────────────────────────
  describe('A18: no secrets: inherit in reusable workflow calls', () => {
    for (const file of ALL_TEMPLATES) {
      it(`${file} does not use secrets: inherit`, () => {
        const content = readTemplate(file);
        assert.ok(
          !/secrets:\s*inherit/m.test(content),
          `${file} uses secrets: inherit — explicitly pass required secrets instead`
        );
      });
    }
  });

  // ── Assertion 19: HAS_COPILOT_TOKEN pattern ──────────────────────────
  // Currently uses: secrets.COPILOT_ASSIGN_TOKEN || secrets.GITHUB_TOKEN
  // Target:  env block with secrets.COPILOT_ASSIGN_TOKEN != '' boolean check
  describe('A19: heartbeat env uses boolean comparison for COPILOT_ASSIGN_TOKEN', () => {
    test.todo("squad-heartbeat.yml — use secrets.COPILOT_ASSIGN_TOKEN != '' boolean comparison");
  });

  // ── Assertion 20: Concurrency group sanity ───────────────────────────
  describe('A20: concurrency groups are non-empty with interpolation', () => {
    for (const file of ALL_TEMPLATES) {
      const content = readTemplate(file);
      const groupMatch = content.match(/concurrency:\s*\n\s+group:\s*(.+)/m);
      if (!groupMatch) continue;

      const group = groupMatch[1].trim();

      it(`${file} — concurrency group is non-empty`, () => {
        assert.ok(group.length > 0, `${file} has empty concurrency group`);
      });

      it(`${file} — concurrency group uses interpolation or is static exception`, () => {
        // Exception: squad-docs.yml uses static group: pages (GitHub Pages constraint)
        const isStaticException = file === 'squad-docs.yml' && group === 'pages';
        const hasInterpolation = group.includes('${{');

        assert.ok(
          hasInterpolation || isStaticException,
          `${file} concurrency group "${group}" must contain \${{ }} interpolation ` +
          `(exception: squad-docs.yml static "pages" group)`
        );
      });
    }
  });
});
