/**
 * Publish Policy Lint Test (#557)
 *
 * Validates that all npm publish commands in workflow files are
 * workspace-scoped (-w or --workspace), except for the two exact verified
 * tarball paths in squad-npm-publish.yml. Bare npm publish would publish the
 * root package.json — a critical incident vector.
 *
 * Also tests the grep logic itself with known good/bad inputs.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Core lint function (mirrors CI shell logic) ────────────────────────

const NPM_PUBLISH_COMMAND =
  /(?:^|&&|\|\||;)\s*(?:(?:if|then)\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*npm\s+[^#;&|]*\bpublish\b[^#;&|]*/;
const WORKSPACE_FLAG = /(?:^|\s)(?:-w|--workspace)(?:=|\s|$)/;
const VERIFIED_TARBALL =
  /npm\s+publish\s+"\$PACKS_DIR\/bradygaster-squad-(?:sdk|cli)-\$\{VERSION\}\.tgz"(?:\s|$)/;

/**
 * Returns true if the line contains a workspace-scoped npm publish
 * or is not a publish command at all. Returns false for bare publishes.
 */
function isCompliant(line: string): boolean {
  const command = line
    .trimStart()
    .replace(/^-\s*/, '')
    .replace(/^run:\s*/, '');
  if (command.startsWith('#')) return true;

  const publishCommand = command.match(NPM_PUBLISH_COMMAND)?.[0];
  return publishCommand === undefined ||
    WORKSPACE_FLAG.test(publishCommand) ||
    VERIFIED_TARBALL.test(publishCommand);
}

/**
 * Scans a YAML file's lines and returns violations (bare npm publish).
 */
function findViolations(content: string): { line: number; text: string }[] {
  const violations: { line: number; text: string }[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!isCompliant(lines[i])) {
      violations.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return violations;
}

// ─── Unit tests for the lint logic ──────────────────────────────────────

describe('publish-policy lint logic', () => {
  describe('should PASS (workspace-scoped)', () => {
    const goodLines = [
      'npm -w packages/squad-sdk publish --access public --provenance',
      'npm -w packages/squad-cli publish --tag insider --access public',
      'run: npm -w packages/squad-sdk publish --access public --provenance',
      'run: npm -w packages/squad-cli publish --tag insider --access public',
      'npm --workspace packages/squad-sdk publish --access public',
      'npm --workspace packages/squad-cli publish --tag insider',
      'cd packages/sdk && npm --workspace=packages/squad-sdk publish',
      'run: npm publish --workspace packages/squad-cli',
      'npm publish "$PACKS_DIR/bradygaster-squad-sdk-${VERSION}.tgz" --ignore-scripts --access public --provenance',
      'npm publish "$PACKS_DIR/bradygaster-squad-cli-${VERSION}.tgz" --ignore-scripts --access public --provenance',
    ];

    for (const line of goodLines) {
      it(`allows: ${line}`, () => {
        expect(isCompliant(line)).toBe(true);
      });
    }
  });

  describe('should FAIL (bare publish)', () => {
    const badLines = [
      'npm publish',
      'npm publish --access public',
      'run: npm publish --tag insider',
      'run: npm publish --access public --provenance',
      'npm publish --tag insider --access public',
      'cd packages/sdk && npm publish --access public',
      'run: if NODE_AUTH_TOKEN=token npm publish; then echo done; fi',
      'npm publish "$PACKS_DIR/other-${VERSION}.tgz" --ignore-scripts',
    ];

    for (const line of badLines) {
      it(`rejects: ${line}`, () => {
        expect(isCompliant(line)).toBe(false);
      });
    }
  });

  describe('should skip non-publish and comment lines', () => {
    const neutralLines = [
      '# npm publish --access public',
      '  # run: npm publish',
      'npm install',
      'npm test',
      'echo "npm publish is dangerous"',
      'npm ci',
      '      - name: Enforce workspace-scoped npm publish',
      "description: 'npm automation token used to publish both Squad packages'",
      'uses: ./.github/workflows/squad-npm-publish.yml',
      'BARE=$(grep -n \'npm.*publish\' "$wf" || true)',
    ];

    for (const line of neutralLines) {
      it(`ignores: ${line}`, () => {
        expect(isCompliant(line)).toBe(true);
      });
    }
  });

  it('findViolations returns correct line numbers', () => {
    const content = [
      'name: test',
      '# npm publish bare in comment',
      'run: npm -w packages/sdk publish --access public',
      'run: npm publish --access public',
      'run: npm publish',
    ].join('\n');

    const violations = findViolations(content);
    expect(violations).toHaveLength(2);
    expect(violations[0].line).toBe(4);
    expect(violations[0].text).toBe('run: npm publish --access public');
    expect(violations[1].line).toBe(5);
    expect(violations[1].text).toBe('run: npm publish');
  });
});

// ─── Live workflow file validation ──────────────────────────────────────

describe('publish-policy: live workflow files', () => {
  const workflowDir = join(process.cwd(), '.github', 'workflows');
  const workflowFiles = readdirSync(workflowDir).filter(f => f.endsWith('.yml'));

  it('workflow directory has files to check', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  for (const file of workflowFiles) {
    it(`${file} — no bare npm publish`, () => {
      const content = readFileSync(join(workflowDir, file), 'utf-8');
      const violations = findViolations(content);
      if (violations.length > 0) {
        const details = violations
          .map(v => `  line ${v.line}: ${v.text}`)
          .join('\n');
        expect.fail(
          `Bare npm publish found in ${file} (missing -w/--workspace):\n${details}`,
        );
      }
    });
  }
});

describe('publish-policy: release recovery after staging cleanup failure', () => {
  const workflow = readFileSync(
    join(process.cwd(), '.github', 'workflows', 'squad-npm-publish.yml'),
    'utf-8',
  );
  const section = (startMarker: string, endMarker: string): string => {
    const start = workflow.indexOf(startMarker);
    if (start === -1) return '';
    const end = workflow.indexOf(endMarker, start + startMarker.length);
    return workflow.slice(start, end === -1 ? undefined : end);
  };
  const sdkCleanup = section(
    '      - name: Remove SDK staging tag\n',
    '\n      - name: Remove CLI staging tag',
  );
  const cliCleanup = section(
    '      - name: Remove CLI staging tag\n',
    '\n      - name: Record staging tag cleanup results',
  );
  const cleanupEvidence = section(
    '      - name: Record staging tag cleanup results\n',
    '\n      - name: Upload reconciliation evidence',
  );
  const draftJob = section(
    '  publish-draft-release:\n',
    '\n  promote-insider-tag:',
  );

  it('records staging cleanup failures without failing the publish job', () => {
    expect(sdkCleanup).toMatch(/id: remove-sdk-staging-tag/);
    expect(sdkCleanup).toMatch(
      /if: success\(\) && steps\.existing\.outputs\.stage_pair == 'true'/,
    );
    expect(sdkCleanup).toMatch(
      /assert-publish-identity\.mjs[\s\S]*?if npm dist-tag rm @bradygaster\/squad-sdk[\s\S]*?outcome=failure[\s\S]*?exit_code=\$status/,
    );
    expect(cliCleanup).toMatch(/id: remove-cli-staging-tag/);
    expect(cliCleanup).toMatch(
      /if: success\(\) && steps\.existing\.outputs\.stage_pair == 'true'/,
    );
    expect(cliCleanup).toMatch(
      /assert-publish-identity\.mjs[\s\S]*?if npm dist-tag rm @bradygaster\/squad-cli[\s\S]*?outcome=failure[\s\S]*?exit_code=\$status/,
    );
    expect(cleanupEvidence).toMatch(
      /SDK_CLEANUP_OUTCOME: \$\{\{ steps\.remove-sdk-staging-tag\.outputs\.outcome[\s\S]*?CLI_CLEANUP_OUTCOME: \$\{\{ steps\.remove-cli-staging-tag\.outputs\.outcome[\s\S]*?staging-tag-cleanup\.json[\s\S]*?::warning::Could not remove/,
    );
  });

  it('publishes the existing draft when preparation succeeded and reconciliation is complete', () => {
    expect(draftJob).toMatch(
      /if: always\(\) && needs\.prepare\.result == 'success' && inputs\.verify_run_id != '' && inputs\.publish_draft_release && needs\.publish\.outputs\.outcome == 'COMPLETE'/,
    );
  });
});
