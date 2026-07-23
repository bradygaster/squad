/**
 * Static validation for .github/workflows/squad-npm-dist-tag.yml
 *
 * This is the one-time-safe, permanent tag-move workflow for Issue #1491.
 * The workflow itself performs a privileged npm mutation (`npm dist-tag add`)
 * on production packages, so we assert its security posture at the text
 * level — no YAML parser, no network calls, just file-shape checks that
 * catch regressions before a reviewer sees them.
 *
 * These assertions codify the constraints the reviewer must sign off on:
 *   - workflow_dispatch is the ONLY trigger
 *   - least-privilege permissions (contents: read only, no id-token)
 *   - hard-coded package allow-list (exactly the two Squad packages)
 *   - strict semver validation on the version input
 *   - NO `npm publish` command
 *   - actions pinned to 40-char commit SHAs
 *   - promotion runs SDK first, then CLI (sequential, verified between)
 *   - reuses the reviewed scripts/promote-insider-tag.mjs (PR #1495)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = path.resolve(
  __dirname,
  '..',
  '.github',
  'workflows',
  'squad-npm-dist-tag.yml',
);

const ALLOWED_PACKAGES = ['@bradygaster/squad-sdk', '@bradygaster/squad-cli'];

function readWorkflow() {
  assert.ok(fs.existsSync(WORKFLOW_PATH), `workflow file must exist at ${WORKFLOW_PATH}`);
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

/**
 * Return the workflow text with all comment lines stripped (both YAML `#`
 * comments and shell `#` comments inside `run:` blocks). Command-shape
 * assertions run against this so a documentation reference to `--force`
 * or `npm publish` in a comment doesn't false-positive a security test.
 */
function readWorkflowActiveContent() {
  return readWorkflow()
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

describe('squad-npm-dist-tag.yml — trigger surface', () => {
  const text = readWorkflow();

  it('declares only workflow_dispatch under `on:`', () => {
    const onMatch = text.match(/\non:\s*\n([\s\S]*?)(?:\n[a-zA-Z_]+:\s*(?:\n|$))/);
    assert.ok(onMatch, 'workflow must have a top-level `on:` block');
    const onBlock = onMatch[1];
    assert.match(onBlock, /workflow_dispatch:/, 'workflow_dispatch trigger is required');
    for (const forbidden of ['push:', 'pull_request:', 'pull_request_target:', 'schedule:', 'release:', 'repository_dispatch:', 'workflow_run:']) {
      assert.doesNotMatch(
        onBlock,
        new RegExp(`(^|\\n)\\s*${forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
        `\`on:\` must NOT contain ${forbidden} — this workflow is manual-only`,
      );
    }
  });
});

describe('squad-npm-dist-tag.yml — permissions', () => {
  const text = readWorkflow();

  it('grants only contents:read at the workflow level', () => {
    const permMatch = text.match(/\npermissions:\s*\n([\s\S]*?)(?:\njobs:\s*\n)/);
    assert.ok(permMatch, 'workflow must have a top-level `permissions:` block');
    const block = permMatch[1];
    assert.match(block, /contents:\s*read/, 'contents: read is required');
    // No broader permissions
    for (const forbidden of ['contents:\\s*write', 'id-token:', 'packages:', 'issues:\\s*write', 'pull-requests:\\s*write', 'actions:\\s*write', 'deployments:']) {
      assert.doesNotMatch(
        block,
        new RegExp(forbidden),
        `permissions block must NOT contain ${forbidden.replace(/\\\\s\\*/g, ' ')} — least privilege only`,
      );
    }
  });
});

describe('squad-npm-dist-tag.yml — package allow-list', () => {
  const text = readWorkflow();

  it('references exactly the two allow-listed package names', () => {
    for (const pkg of ALLOWED_PACKAGES) {
      assert.match(
        text,
        new RegExp(pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `workflow must reference ${pkg}`,
      );
    }
  });

  it('references no other @bradygaster/* package as a promotion target', () => {
    // Any @bradygaster/foo occurrence must be one of the allow-listed names.
    const found = new Set(
      (text.match(/@bradygaster\/[a-z0-9-]+/g) || []),
    );
    for (const pkg of found) {
      assert.ok(
        ALLOWED_PACKAGES.includes(pkg),
        `unexpected package reference: ${pkg}. Allow-list is: ${ALLOWED_PACKAGES.join(', ')}`,
      );
    }
  });
});

describe('squad-npm-dist-tag.yml — no publish, no lifecycle escape', () => {
  // Use the comment-stripped view so documentation references (e.g. a
  // comment saying "No `npm publish` step") don't false-positive these
  // command-shape assertions.
  const activeText = readWorkflowActiveContent();

  it('does not contain `npm publish`', () => {
    assert.doesNotMatch(activeText, /\bnpm\s+publish\b/, '`npm publish` is forbidden in the tag-move workflow');
  });

  it('does not use --force / --allow-same-version anywhere', () => {
    assert.doesNotMatch(activeText, /--force\b/);
    assert.doesNotMatch(activeText, /--allow-same-version\b/);
  });

  it('does not run arbitrary npm scripts (no `npm run` / `npm test` / `npm ci`)', () => {
    // Tag move needs only `npm view`, `npm whoami`, and `npm dist-tag add`
    // (the last is invoked by scripts/promote-insider-tag.mjs). Any other
    // `npm <verb>` is out of scope and could execute repo lifecycle code.
    assert.doesNotMatch(activeText, /\bnpm\s+run\b/);
    assert.doesNotMatch(activeText, /\bnpm\s+test\b/);
    assert.doesNotMatch(activeText, /\bnpm\s+ci\b/);
    assert.doesNotMatch(activeText, /\bnpm\s+install\b/);
  });
});

describe('squad-npm-dist-tag.yml — version input hardening', () => {
  const text = readWorkflow();

  it('validates the version input against a strict semver regex', () => {
    // Same regex as the merged squad-npm-publish.yml promote job uses.
    assert.match(
      text,
      /\^\(0\|\[1-9\]\[0-9\]\*\)\\\.\(0\|\[1-9\]\[0-9\]\*\)\\\.\(0\|\[1-9\]\[0-9\]\*\)\(-\[0-9A-Za-z\.-\]\+\)\?\$/,
      'strict semver regex must be present',
    );
  });

  it('reads the version input via env var (INPUT_VERSION), not inline expression', () => {
    assert.match(text, /INPUT_VERSION:\s*\$\{\{\s*github\.event\.inputs\.version\s*\}\}/);
    // The interpolation itself must not appear inside a `run:` shell body.
    // A cheap approximation: after the last `env:` block, `${{ github.event.inputs.version }}`
    // should not appear inside triple-block content — we assert it appears
    // ONLY on env-assignment lines (INPUT_VERSION: or NEW_VERSION: sourcing
    // from steps.version.outputs.version).
    const inlineOccurrences = text
      .split('\n')
      .filter((line) => line.includes('${{ github.event.inputs.version }}'));
    for (const line of inlineOccurrences) {
      assert.match(
        line.trim(),
        /^INPUT_VERSION:\s/,
        `github.event.inputs.version must only appear as an env assignment, saw: ${line}`,
      );
    }
  });
});

describe('squad-npm-dist-tag.yml — action pins', () => {
  const text = readWorkflow();

  it('pins every `uses: actions/*` to a 40-char commit SHA', () => {
    const usesLines = (text.match(/uses:\s*actions\/[a-zA-Z0-9_-]+@[^\s#\n]+/g) || []);
    assert.ok(usesLines.length >= 2, 'expected at least checkout + setup-node');
    for (const line of usesLines) {
      const ref = line.split('@')[1];
      assert.match(
        ref,
        /^[0-9a-f]{40}$/,
        `action must be pinned to a full 40-char commit SHA, got: ${line}`,
      );
    }
  });
});

describe('squad-npm-dist-tag.yml — sequential SDK-then-CLI ordering', () => {
  const text = readWorkflow();

  it('reuses scripts/promote-insider-tag.mjs (the reviewed PR #1495 script)', () => {
    assert.match(text, /node\s+scripts\/promote-insider-tag\.mjs\s+@bradygaster\/squad-sdk/);
    assert.match(text, /node\s+scripts\/promote-insider-tag\.mjs\s+@bradygaster\/squad-cli/);
  });

  it('promotes SDK before CLI, with a verification step between', () => {
    const sdkPromoteIdx = text.indexOf('node scripts/promote-insider-tag.mjs @bradygaster/squad-sdk');
    const cliPromoteIdx = text.indexOf('node scripts/promote-insider-tag.mjs @bradygaster/squad-cli');
    assert.ok(sdkPromoteIdx > -1 && cliPromoteIdx > -1, 'both promote steps must be present');
    assert.ok(sdkPromoteIdx < cliPromoteIdx, 'SDK must be promoted before CLI');

    // A verification step for SDK must exist between the SDK promote and
    // the CLI promote — we check for the SDK verification's characteristic
    // command shape.
    const between = text.slice(sdkPromoteIdx, cliPromoteIdx);
    assert.match(
      between,
      /npm\s+view\s+@bradygaster\/squad-sdk\s+dist-tags\.insider/,
      'SDK insider tag must be verified before CLI promotion begins',
    );
  });

  it('verifies CLI insider tag after CLI promotion', () => {
    const cliPromoteIdx = text.indexOf('node scripts/promote-insider-tag.mjs @bradygaster/squad-cli');
    const after = text.slice(cliPromoteIdx);
    assert.match(
      after,
      /npm\s+view\s+@bradygaster\/squad-cli\s+dist-tags\.insider/,
      'CLI insider tag must be verified after CLI promotion',
    );
  });
});

describe('squad-npm-dist-tag.yml — credential handling', () => {
  const text = readWorkflow();

  it('sources npm auth from secrets.NPM_TOKEN via NODE_AUTH_TOKEN', () => {
    assert.match(text, /NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
  });

  it('never dereferences, prints, or writes the npm token to logs or files', () => {
    const activeText = readWorkflowActiveContent();
    // Dereferences of the token value ($X, ${X}) are the real leak vector.
    // Echoing the bare identifier "NPM_TOKEN" as a status message is safe.
    for (const bad of [
      /echo\s+[^\n]*\$\{?NODE_AUTH_TOKEN\}?/i,
      /echo\s+[^\n]*\$\{?NPM_TOKEN\}?/i,
      /cat\s+\.npmrc/i,
      /\bprintenv\b/i,
      /\benv\s*\|/i,
      />\s*\.npmrc/,
    ]) {
      assert.doesNotMatch(activeText, bad, `workflow must not leak the npm token (matched: ${bad})`);
    }
  });

  it('uses persist-credentials: false on checkout to avoid GITHUB_TOKEN leakage', () => {
    assert.match(text, /persist-credentials:\s*false/);
  });
});

describe('squad-npm-dist-tag.yml — concurrency & timeout', () => {
  const text = readWorkflow();

  it('sets a workflow-level concurrency group', () => {
    assert.match(text, /\nconcurrency:\s*\n\s+group:\s*\$\{\{\s*github\.workflow\s*\}\}/);
    assert.match(text, /cancel-in-progress:\s*false/);
  });

  it('caps the job with a short timeout-minutes', () => {
    const m = text.match(/timeout-minutes:\s*(\d+)/);
    assert.ok(m, 'timeout-minutes must be set');
    const t = parseInt(m[1], 10);
    assert.ok(t > 0 && t <= 15, `timeout-minutes should be a short bound (got ${t})`);
  });
});
