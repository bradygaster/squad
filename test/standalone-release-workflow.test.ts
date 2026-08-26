/**
 * Regression guards for the standalone release handoff.
 *
 * GitHub suppresses release events created with GITHUB_TOKEN, so the normal
 * release workflow must call the bundle workflow directly. Release tags also
 * omit contributor-only .squad state, which means the bundle build must avoid
 * the root prebuild synchronization step.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS = join(process.cwd(), '.github', 'workflows');
const release = readFileSync(join(WORKFLOWS, 'squad-release.yml'), 'utf8');
const standalone = readFileSync(join(WORKFLOWS, 'squad-standalone-release.yml'), 'utf8');

describe('standalone release handoff', () => {
  it('calls the reusable bundle workflow after creating a release', () => {
    expect(release).toMatch(/release:\r?\n\s+runs-on:[\s\S]*?\s+outputs:/);
    expect(release).toContain("created: ${{ steps.check_tag.outputs.exists == 'false' }}");
    expect(release).toContain('tag: ${{ steps.version.outputs.tag }}');
    expect(release).toMatch(
      /standalone:\r?\n\s+name: Publish standalone bundles\r?\n\s+needs: release/,
    );
    expect(release).toContain("if: needs.release.outputs.created == 'true'");
    expect(release).toContain('uses: ./.github/workflows/squad-standalone-release.yml');
    expect(release).toContain('release_tag: ${{ needs.release.outputs.tag }}');
    expect(release).toContain('source_ref: ${{ needs.release.outputs.tag }}');
  });

  it('uses only contents permission for the reusable release upload', () => {
    expect(release).toMatch(
      /standalone:[\s\S]*?permissions:\r?\n\s+contents: write[\s\S]*?uses: \.\/\.github\/workflows\/squad-standalone-release\.yml/,
    );
    expect(release).not.toContain('actions: write');
  });

  it('accepts explicit release and source refs for calls and manual backfills', () => {
    expect(standalone).toMatch(/workflow_call:\r?\n\s+inputs:/);
    expect(standalone).toMatch(/workflow_dispatch:\r?\n\s+inputs:/);
    for (const input of ['node_version:', 'upload:', 'release_tag:', 'source_ref:']) {
      expect(standalone.match(new RegExp(input, 'g'))?.length).toBe(2);
    }
    expect(standalone).toContain(
      'ref: ${{ inputs.source_ref || inputs.release_tag || github.event.release.tag_name || github.ref }}',
    );
  });

  it('builds package workspaces without the release-tag-incompatible root prebuild', () => {
    expect(standalone).toContain(
      'run: npm -w packages/squad-sdk run build && npm -w packages/squad-cli run build',
    );
    expect(standalone).not.toMatch(/^\s*run: npm run build\s*$/m);
  });

  it('uses the explicit release tag for bundles and packaging manifests', () => {
    const tagExpression =
      "TAG: ${{ inputs.release_tag || github.event.release.tag_name || (github.ref_type == 'tag' && github.ref_name) }}";
    expect(standalone.match(new RegExp(tagExpression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')))
      .toHaveLength(3);
  });
});
