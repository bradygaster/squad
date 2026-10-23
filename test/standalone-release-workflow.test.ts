/**
 * Regression guards for the standalone release handoff.
 *
 * GitHub suppresses events created with GITHUB_TOKEN, so promotion explicitly
 * dispatches the release workflow and the release workflow calls its publishers
 * directly. Release tags also omit contributor-only .squad state, which means
 * publication builds must avoid the root prebuild synchronization step.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const WORKFLOWS = join(process.cwd(), '.github', 'workflows');
const release = readFileSync(join(WORKFLOWS, 'squad-release.yml'), 'utf8');
const standalone = readFileSync(join(WORKFLOWS, 'squad-standalone-release.yml'), 'utf8');
const npmPublish = readFileSync(join(WORKFLOWS, 'squad-npm-publish.yml'), 'utf8');
const insiderPublish = readFileSync(join(WORKFLOWS, 'squad-insider-publish.yml'), 'utf8');
const promote = readFileSync(join(WORKFLOWS, 'squad-promote.yml'), 'utf8');
const ghAwGuide = readFileSync(
  join(process.cwd(), 'docs', 'src', 'content', 'docs', 'guide', 'gh-aw.md'),
  'utf8',
);
const publicCliDocs = [
  'README.md',
  'packages/squad-cli/README.md',
  'docs/src/content/docs/get-started/installation.md',
  'docs/src/content/docs/guide.md',
  'docs/src/content/docs/features/vscode.md',
  'docs/src/content/docs/features/standalone-install.md',
  'docs/src/content/docs/insider-program.md',
  'docs/src/content/docs/scenarios/production-troubleshooting.md',
  'docs/src/content/docs/scenarios/troubleshooting.md',
].map((file) => [file, readFileSync(join(process.cwd(), file), 'utf8')] as const);

interface WorkflowStep {
  name?: string;
  uses?: string;
  if?: string;
  env?: Record<string, string>;
  run?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  secrets?: string | Record<string, unknown>;
  steps?: WorkflowStep[];
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowDefinition {
  on?: {
    release?: {
      types?: string[];
    };
    workflow_call?: {
      inputs?: Record<string, Record<string, unknown>>;
      secrets?: Record<string, { description?: string; required?: boolean }>;
    };
    workflow_dispatch?: {
      inputs?: Record<string, unknown>;
    };
    push?: {
      branches?: string[];
    };
  };
  concurrency?: {
    group?: string;
    'cancel-in-progress'?: boolean;
  };
  permissions?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
}

const releaseWorkflow = parse(release) as WorkflowDefinition;
const standaloneWorkflow = parse(standalone) as WorkflowDefinition;
const npmPublishWorkflow = parse(npmPublish) as WorkflowDefinition;
const insiderPublishWorkflow = parse(insiderPublish) as WorkflowDefinition;
const promoteWorkflow = parse(promote) as WorkflowDefinition;

function stepNamed(job: WorkflowJob, name: string): WorkflowStep {
  const step = job.steps?.find((candidate) => candidate.name === name);
  expect(step, `missing step "${name}"`).toBeDefined();
  return step!;
}

function serialized(job: WorkflowJob): string {
  return JSON.stringify(job);
}
const squadWorkflow = readFileSync(join(process.cwd(), 'workflows', 'squad.md'), 'utf8');

describe('standalone release handoff', () => {
  it('is human-only: dispatch with the confirming tag and the exact reviewed SHA', () => {
    expect(release).toMatch(/workflow_dispatch:\r?\n\s+inputs:\r?\n\s+confirm_tag:/);
    expect(release).toContain(
      "description: 'Confirm the release tag (for example v2.0.0-preview.1 or v2.0.0)'",
    );
    expect(releaseWorkflow.on?.push).toBeUndefined();
    expect(releaseWorkflow.on?.workflow_dispatch?.inputs).toHaveProperty('expected_sha');
    expect((releaseWorkflow.on?.workflow_dispatch?.inputs as Record<string, { required?: boolean }>).expected_sha.required).toBe(true);
    expect(release).toContain('RELEASE_REF: ${{ github.ref }}');
    expect(release).toContain('refs/heads/dev|refs/heads/main) branch=');
    expect(release).toContain('Releases from dev require X.Y.Z-preview.N');
    expect(release).toContain('Releases from main require a stable MAJOR.MINOR.PATCH version');
    expect(release).toContain('-preview\\.(0|[1-9][0-9]*)');
    expect(release).toContain('--prerelease');
    expect(release).toContain('--latest=false');
    expect(releaseWorkflow.jobs.guard.outputs?.stable_release).toBe(
      '${{ steps.channel.outputs.stable_release }}',
    );
  });

  it('asserts dispatch SHA, workflow SHA, checkout HEAD and live branch tip before any side effect, and again right before tagging', () => {
    const guard = stepNamed(releaseWorkflow.jobs.guard, 'Assert dispatch SHA, workflow SHA, checkout HEAD and live branch tip all equal expected_sha');
    expect(guard.env).toMatchObject({
      EXPECTED_SHA: '${{ inputs.expected_sha }}',
      DISPATCH_SHA: '${{ github.sha }}',
      WORKFLOW_SHA: '${{ github.workflow_sha }}',
    });
    expect(guard.run).toContain('[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(guard.run).toContain('git ls-remote --exit-code origin "refs/heads/${branch}"');
    for (const name of ['dispatch', 'workflow-definition', 'checkout-HEAD', 'live-${branch}-tip']) {
      expect(guard.run).toContain(name);
    }
    const reassert = stepNamed(releaseWorkflow.jobs.release, 'Re-assert identity and create or reconcile the release tag');
    expect(reassert.run).toContain('git ls-remote --exit-code origin "refs/heads/${BRANCH}"');
    expect(reassert.run).toContain('git tag -a "$TAG" -m "Release $TAG" "$EXPECTED_SHA"');
    for (const checkout of [releaseWorkflow.jobs.guard, releaseWorkflow.jobs.release]) {
      expect(checkout.steps?.find((s) => s.uses?.startsWith('actions/checkout@'))?.with?.ref).toBe('${{ inputs.expected_sha }}');
    }
  });

  it('runs the full verification bundle at the exact SHA before the tag, draft release and publishers', () => {
    const verify = releaseWorkflow.jobs.verify;
    expect(verify.uses).toBe('./.github/workflows/squad-release-verify.yml');
    expect(verify.needs).toBe('guard');
    expect(verify.with).toEqual({
      source_sha: '${{ inputs.expected_sha }}',
      expected_version: '${{ needs.guard.outputs.version }}',
    });
    expect(releaseWorkflow.jobs.release.needs).toEqual(['guard', 'verify', 'package-manager-preflight']);
    expect(releaseWorkflow.jobs.npm.needs).toEqual(['guard', 'verify', 'release']);
    expect(releaseWorkflow.jobs.standalone.needs).toEqual(['guard', 'verify', 'release']);
    expect(releaseWorkflow.jobs['package-manager-preflight'].needs).toBe('guard');
  });

  it('never moves a tag, drafts the GitHub release first and publishes it only after npm reconciliation', () => {
    const tag = stepNamed(releaseWorkflow.jobs.release, 'Re-assert identity and create or reconcile the release tag');
    expect(tag.run).toContain('A tag must never be moved');
    expect(tag.run).toContain('git tag -a "$TAG" -m "Release $TAG" "$EXPECTED_SHA"');
    const draft = stepNamed(releaseWorkflow.jobs.release, 'Re-assert tag identity and create the GitHub release as a draft');
    expect(draft.run).toContain('--draft');
    expect(draft.run).toContain('--target "$EXPECTED_SHA"');
    expect(draft.run).toContain('assert-publish-identity.mjs');
    const publish = releaseWorkflow.jobs['publish-release'];
    expect(publish.needs).toEqual(['guard', 'release-completion']);
    expect(stepNamed(publish, 'Re-assert tag identity, publish and verify the release').run).toContain('gh release edit "$TAG" --draft=false');
  });

  it('uses the shared publish-identity helper for release, npm recovery, and standalone paths', () => {
    const releaseGuard = stepNamed(
      releaseWorkflow.jobs.release,
      'Re-assert tag identity and create the GitHub release as a draft',
    ).run ?? '';
    const npmGuard = stepNamed(
      npmPublishWorkflow.jobs.prepare,
      'Validate inputs and immutable release identity',
    ).run ?? '';
    const standaloneGuard = stepNamed(standaloneWorkflow.jobs.guard, 'Validate inputs').run ?? '';
    for (const [name, guard] of [
      ['release', releaseGuard],
      ['npm recovery', npmGuard],
      ['standalone', standaloneGuard],
    ] as const) {
      expect(guard, name).toContain('scripts/release/assert-publish-identity.mjs');
    }
    expect(npmGuard).not.toMatch(/git (fetch|rev-list).*refs\/tags/);
    expect(standaloneGuard).not.toMatch(/git ls-remote.*refs\/tags/);
  });

  it('defaults preview channels to insider with a preview alias, both as dispatch inputs', () => {
    const inputs = releaseWorkflow.on?.workflow_dispatch?.inputs as Record<string, Record<string, unknown>>;
    expect(inputs.npm_dist_tag).toMatchObject({ default: 'insider', type: 'choice', options: ['insider', 'preview'] });
    expect(inputs.add_preview_alias).toMatchObject({ default: true, type: 'boolean' });
    const channel = stepNamed(releaseWorkflow.jobs.guard, 'Resolve release channel').run ?? '';
    expect(channel).toContain('dist_tag="$INPUT_DIST_TAG"');
    expect(channel).toContain('dist_tag=latest');
    expect(channel).toContain('[ "$dist_tag" = preview ] && add_preview_alias=false');
    expect(releaseWorkflow.jobs.npm.with).toEqual({
      version: '${{ needs.guard.outputs.version }}',
      source_sha: '${{ inputs.expected_sha }}',
      dist_tag: '${{ needs.guard.outputs.dist_tag }}',
      add_preview_alias: "${{ needs.guard.outputs.add_preview_alias == 'true' }}",
      evidence_artifact: '${{ needs.verify.outputs.evidence_artifact }}',
    });
    expect(releaseWorkflow.jobs.npm.secrets).toEqual({ NPM_TOKEN: '${{ secrets.NPM_TOKEN }}' });
    expect(releaseWorkflow.jobs.npm.permissions).toEqual({ contents: 'read', actions: 'read', 'id-token': 'write' });
  });

  it('keeps standalone bundles as artifacts by default and holds the public release for selected channels', () => {
    const inputs = releaseWorkflow.on?.workflow_dispatch?.inputs as Record<string, Record<string, unknown>>;
    expect(inputs.build_standalone).toMatchObject({ default: true, type: 'boolean' });
    expect(inputs.publish_standalone).toMatchObject({ default: false, type: 'boolean' });
    expect(inputs.publish_package_managers).toMatchObject({ default: false, type: 'boolean' });
    const standaloneJob = releaseWorkflow.jobs.standalone;
    expect(standaloneJob.if).toBe('inputs.build_standalone');
    expect(standaloneJob.uses).toBe('./.github/workflows/squad-standalone-release.yml');
    expect(standaloneJob.with).toEqual({
      upload: '${{ inputs.publish_standalone }}',
      publish_package_managers: '${{ inputs.publish_standalone && inputs.publish_package_managers }}',
      release_tag: '${{ needs.guard.outputs.tag }}',
      source_ref: '${{ inputs.expected_sha }}',
      source_sha: '${{ inputs.expected_sha }}',
    });
    expect(releaseWorkflow.jobs.npm.needs).not.toContain('standalone');
    expect(releaseWorkflow.jobs['release-completion'].needs).toEqual(['guard', 'npm', 'standalone']);
    const completion = stepNamed(releaseWorkflow.jobs['release-completion'], 'Check selected channel outcomes').run ?? '';
    expect(completion).toContain('npm did not reconcile COMPLETE');
    expect(completion).toContain('selected standalone/package-manager channels did not complete');
  });

  it('keeps an incomplete stable release out of latest until standalone assets exist', () => {
    const promotion = releaseWorkflow.jobs['promote-latest'];
    const promote = stepNamed(promotion, 'Verify standalone assets and promote latest').run ?? '';

    expect(promotion.needs).toEqual(['guard', 'publish-release', 'standalone']);
    expect(promotion.if).toBe(
      "needs.guard.outputs.stable_release == 'true' && inputs.publish_standalone",
    );
    for (const asset of [
      'squad-linux-x64.tar.gz',
      'squad-linux-arm64.tar.gz',
      'squad-darwin-x64.tar.gz',
      'squad-darwin-arm64.tar.gz',
      'squad-win32-x64.zip',
      'squad-win32-arm64.zip',
      'SHA256SUMS.txt',
    ]) {
      expect(promote).toContain(asset);
    }
    expect(promote).toContain('refusing latest promotion');
    expect(promote.indexOf('missing_assets[@]')).toBeLessThan(
      promote.indexOf('gh release edit "${TAG}" --latest'),
    );
    expect(promote).toContain('repos/${GITHUB_REPOSITORY}/releases/latest');
  });

  it('uses only contents permission for the reusable release upload', () => {
    expect(release).toMatch(
      /standalone:[\s\S]*?permissions:\r?\n\s+contents: write[\s\S]*?uses: \.\/\.github\/workflows\/squad-standalone-release\.yml/,
    );
    expect(release).not.toContain('actions: write');
    expect(releaseWorkflow.jobs.standalone.secrets).not.toBe('inherit');
  });

  it('accepts explicit release and source refs for calls and manual backfills', () => {
    expect(standalone).toMatch(/workflow_call:\r?\n\s+inputs:/);
    expect(standalone).toMatch(/workflow_dispatch:\r?\n\s+inputs:/);
    for (const input of [
      'node_version:',
      'upload:',
      'release_tag:',
      'source_ref:',
      'package_version:',
      'publish_package_managers:',
    ]) {
      const inputName = input.slice(0, -1);
      expect(standaloneWorkflow.on?.workflow_call?.inputs).toHaveProperty(inputName);
      expect(standaloneWorkflow.on?.workflow_dispatch?.inputs).toHaveProperty(inputName);
    }
    expect(standalone).toContain(
      'ref: ${{ inputs.source_ref || inputs.release_tag || github.ref }}',
    );
    expect(standaloneWorkflow.on?.release).toBeUndefined();
  });

  it('builds package workspaces without the release-tag-incompatible root prebuild', () => {
    expect(standalone).toContain(
      'run: npm -w packages/squad-sdk run build && npm -w packages/squad-cli run build',
    );
    expect(standalone).not.toMatch(/^\s*run: npm run build\s*$/m);
  });

  it('uses the explicit release tag for bundles and packaging manifests', () => {
    const tagExpression =
      "${{ inputs.release_tag || (github.ref_type == 'tag' && github.ref_name) }}";
    expect(
      stepNamed(standaloneWorkflow.jobs.publish, 'Upload to release').env?.TAG,
    ).toBe(tagExpression);
    expect(
      stepNamed(standaloneWorkflow.jobs.packaging, 'Generate manifests').env?.TAG,
    ).toBe(tagExpression);
  });
});

describe('stable promotion', () => {
  it('promotes directly from dev to main through a validated sanitized merge', () => {
    expect(existsSync(join(WORKFLOWS, 'squad-preview.yml'))).toBe(false);
    expect(Object.keys(promoteWorkflow.jobs)).toEqual(['open-existing-promotion', 'dev-to-main']);

    const promotion = serialized(promoteWorkflow.jobs['dev-to-main']);
    expect(promotion).toContain(
      'git merge origin/dev --no-commit --no-ff -X theirs -X no-renames || true',
    );
    expect(promotion).toContain('git diff --name-only --diff-filter=U');
    expect(promotion).toContain('git rm -rf --cached --ignore-unmatch');
    expect(promotion).toContain('.ai-team/');
    expect(promotion).toContain('.squad/');
    expect(promotion).toContain('.ai-team-templates/');
    expect(promotion).toContain('team-docs/');
    expect(promotion).toContain('docs/proposals/');
    expect(promotion).toContain('Stable promotion requires a MAJOR.MINOR.PATCH version');
    expect(promotion).toContain(
      'npm -w packages/squad-sdk run build && npm -w packages/squad-cli run build',
    );
    expect(promotion).toContain('git push origin HEAD:main');
    expect(promotion).toContain('gh workflow run squad-release.yml');
    expect(
      stepNamed(promoteWorkflow.jobs['dev-to-main'], 'Push main and start stable release').run,
    ).toContain('-f confirm_tag="v${VERSION}"');
    expect(
      stepNamed(promoteWorkflow.jobs['dev-to-main'], 'Push main and start stable release').run,
    ).toContain('-f expected_sha="$(git rev-parse HEAD)"');
    expect(promotion).not.toContain('origin/preview');
    expect(promoteWorkflow.permissions).toEqual({
      actions: 'write',
      contents: 'write',
    });
  });

  it('can open a validated in-repository promotion branch as a bot-authored PR', () => {
    expect(promoteWorkflow.on?.workflow_dispatch?.inputs?.promotion_branch).toMatchObject({
      required: false,
      default: '',
      type: 'string',
    });

    const botPromotion = promoteWorkflow.jobs['open-existing-promotion'];
    expect(botPromotion.if).toBe("${{ inputs.promotion_branch != '' }}");
    expect(botPromotion.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'write',
    });
    expect(promoteWorkflow.jobs['dev-to-main'].if).toBe("${{ inputs.promotion_branch == '' }}");

    const promotion = serialized(botPromotion);
    expect(promotion).toContain(
      'Promotion branch must match chore/promote-X.Y.Z or chore/promote-vX.Y.Z',
    );
    expect(promotion).toContain('git merge-base --is-ancestor origin/main HEAD');
    expect(promotion).toContain("git ls-files '.changeset/*.md'");
    expect(promotion).toContain('CLI SDK dependency floors must both be');
    expect(promotion).toContain('SKIP_BUILD_BUMP');
    expect(promotion).toContain('node --test test/*.test.cjs');
    expect(promotion).toContain('Build or tests modified the promotion branch');
    expect(promotion).toContain('gh pr create');
    expect(promotion).toContain('--base main');
    expect(promotion).toContain('--head');
    expect(promotion).toContain('${BRANCH}');
    expect(promotion).toContain('created with');
    expect(promotion).toContain('GITHUB_TOKEN');
  });
});

describe('reusable npm publication', () => {
  const publishJob = () => npmPublishWorkflow.jobs.publish;

  it('has no automatic trigger, requires the exact source SHA, and declares only the npm credential', () => {
    expect(npmPublishWorkflow.on?.release).toBeUndefined();
    expect(npmPublishWorkflow.on?.workflow_dispatch?.inputs).toHaveProperty('version');
    expect(npmPublishWorkflow.on?.workflow_dispatch?.inputs).toHaveProperty('source_sha');
    for (const input of ['version', 'source_sha', 'dist_tag', 'evidence_artifact']) {
      expect(npmPublishWorkflow.on?.workflow_call?.inputs?.[input], input).toMatchObject({ required: true, type: 'string' });
    }
    expect(npmPublishWorkflow.on?.workflow_dispatch?.inputs?.verify_run_id).toMatchObject({ required: true, type: 'string' });
    expect(npmPublishWorkflow.on?.workflow_dispatch?.inputs?.evidence_artifact).toMatchObject({ required: true, type: 'string' });
    expect(npmPublishWorkflow.on?.workflow_call?.inputs?.add_preview_alias).toMatchObject({ type: 'boolean', default: false });
    expect(Object.keys(npmPublishWorkflow.on?.workflow_call?.secrets ?? {})).toEqual(['NPM_TOKEN']);
    expect(npmPublishWorkflow.on?.workflow_call?.secrets?.NPM_TOKEN?.required).toBe(true);
    expect(npmPublishWorkflow.permissions).toEqual({ contents: 'read' });
    expect(npmPublishWorkflow.concurrency).toEqual({
      group: 'squad-npm-publication',
      'cancel-in-progress': false,
    });
    expect(npmPublish).not.toContain('github.event.inputs.version');
  });

  it('checks out the exact source SHA everywhere and re-asserts it immediately before publish', () => {
    for (const jobName of ['prepare', 'publish', 'promote-insider-tag']) {
      const checkout = npmPublishWorkflow.jobs[jobName].steps?.find((step) => step.uses?.startsWith('actions/checkout@'));
      expect(checkout?.with?.ref, jobName).toBe('${{ inputs.source_sha }}');
    }
    const mutations = (publishJob().steps ?? []).filter((step) =>
      /npm (?:publish|dist-tag)/.test(step.run ?? ''),
    );
    expect(mutations.length).toBeGreaterThan(0);
    for (const step of mutations) {
      expect(step.run, step.name).toContain('assert-publish-identity.mjs');
    }
    expect(npmPublishWorkflow.jobs).not.toHaveProperty('bump-activation-pin');
  });

  it('requires successful verify evidence and rechecks exact tarball hashes and privacy before publishing', () => {
    const inputs = stepNamed(npmPublishWorkflow.jobs.prepare, 'Validate inputs and immutable release identity').run ?? '';
    expect(inputs).toContain('release-evidence-${SOURCE_SHA}');
    expect(inputs).toContain('direct recovery must be dispatched from refs/tags/${TAG}');
    const verify = stepNamed(npmPublishWorkflow.jobs.prepare, 'Verify the cited Squad Release Verify run and artifact').run ?? '';
    expect(verify).toContain("'.conclusion'");
    expect(verify).toContain('.github/workflows/squad-release-verify.yml');
    const evidence = stepNamed(npmPublishWorkflow.jobs.prepare, 'Recheck evidence hashes, manifests and privacy result').run ?? '';
    expect(evidence).toContain("denyPatterns?.includes('email-upn')");
    expect(evidence).toContain('CLI evidence does not pin SDK exactly');
    expect(evidence).toContain("createHash('sha256')");
  });

  it('publishes exact verified tarballs without install, build or repack in the credentialed job', () => {
    expect(serialized(publishJob())).not.toContain('npm ci');
    expect(serialized(publishJob())).not.toContain(' run build');
    expect(serialized(publishJob())).not.toContain('npm pack');
    expect(stepNamed(publishJob(), 'Stage SDK from the exact verified tarball').run).toContain('npm publish "$PACKS_DIR/bradygaster-squad-sdk-${VERSION}.tgz" --ignore-scripts');
    expect(stepNamed(publishJob(), 'Stage CLI from the exact verified tarball').run).toContain('npm publish "$PACKS_DIR/bradygaster-squad-cli-${VERSION}.tgz" --ignore-scripts');
    expect(npmPublishWorkflow.jobs.prepare.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(npmPublishWorkflow.jobs.prepare).not.toHaveProperty('env.NODE_AUTH_TOKEN');
  });

  it('stages the pair, verifies, promotes both, aliases preview, and reconciles fail-closed', () => {
    const steps = publishJob().steps ?? [];
    const names = steps.map((s) => s.name ?? '');
    const order = [
      'Classify exact registry versions (only explicit 404 means missing)',
      'Stage SDK from the exact verified tarball',
      'Stage CLI from the exact verified tarball',
      'Verify staged pair',
      'Promote SDK to the primary channel',
      'Promote CLI to the primary channel',
      'Verify primary channel',
      'Final two-package reconciliation',
    ];
    const indices = order.map((n) => names.indexOf(n));
    expect(indices.every((i) => i >= 0), `missing steps: ${order.filter((_, k) => indices[k] < 0).join(', ')}`).toBe(true);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);

    const existing = stepNamed(publishJob(), order[0]).run ?? '';
    expect(existing).toContain("if (/\\bE404\\b|404 Not Found/i.test(diagnostic))");
    expect(existing).toContain("state: 'unknown'");
    expect(stepNamed(publishJob(), order[1]).run).toContain('bradygaster-squad-sdk-${VERSION}.tgz');
    expect(stepNamed(publishJob(), order[2]).run).toContain('bradygaster-squad-cli-${VERSION}.tgz');
    expect(stepNamed(publishJob(), order[3]).run).toContain('--install-check');
    expect(stepNamed(publishJob(), order[4]).run).toContain('npm dist-tag add "@bradygaster/squad-sdk@${VERSION}" "$DIST_TAG"');
    expect(stepNamed(publishJob(), order[5]).run).toContain('npm dist-tag add "@bradygaster/squad-cli@${VERSION}" "$DIST_TAG"');
    expect(stepNamed(publishJob(), 'Add preview alias to SDK').if).toBe("inputs.add_preview_alias && inputs.dist_tag != 'preview'");
    const final = stepNamed(publishJob(), order[7]);
    expect(final.if).toBe('always()');
    expect(final.run).toContain('--classify');
    expect(final.run).toContain('npm publication outcome is $outcome');
    expect(stepNamed(publishJob(), 'Remove SDK staging tag').if).toBe('success()');
    expect(publishJob().env?.STAGING_TAG).toBe('staging-${{ github.run_id }}-${{ github.run_attempt }}');
    expect(publishJob().outputs?.outcome).toBe('${{ steps.reconcile.outputs.outcome }}');
    expect(npmPublish).not.toContain('dist_tag=preview');
  });

  it('promotes insider dist-tags only after the pair reconciled COMPLETE on a stable release', () => {
    const promotion = npmPublishWorkflow.jobs['promote-insider-tag'];
    expect(promotion.needs).toEqual(['prepare', 'publish']);
    expect(promotion.if).toBe("needs.prepare.outputs.stable_release == 'true' && needs.publish.outputs.outcome == 'COMPLETE'");
    expect(serialized(promotion)).toContain('@bradygaster/squad-sdk');
    expect(serialized(promotion)).toContain('@bradygaster/squad-cli');
    expect(npmPublishWorkflow.jobs).not.toHaveProperty('promote-insider-tag-sdk');
    expect(npmPublishWorkflow.jobs).not.toHaveProperty('promote-insider-tag-cli');
  });

  it('uses least privilege for publication provenance', () => {
    expect(publishJob().permissions).toEqual({
      'id-token': 'write',
      contents: 'read',
      actions: 'read',
    });
    expect(npmPublishWorkflow.jobs['promote-insider-tag'].permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(npmPublishWorkflow.jobs.prepare.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(serialized(npmPublishWorkflow.jobs.prepare)).not.toContain('NPM_TOKEN');
  });
});

describe('insider publication', () => {
  it('publishes npm, an immutable GitHub prerelease, standalone assets, and package managers', () => {
    const publish = insiderPublishWorkflow.jobs.publish;
    const releaseJob = insiderPublishWorkflow.jobs.release;
    const standaloneJob = insiderPublishWorkflow.jobs.standalone;

    expect(publish.outputs?.insider_version).toBe(
      '${{ steps.version.outputs.insider_version }}',
    );
    expect(publish.outputs?.source_sha).toBe('${{ steps.version.outputs.source_sha }}');
    expect(stepNamed(publish, 'Compute insider version').run).toContain(
      'source_sha=$(git rev-parse HEAD)',
    );
    expect(stepNamed(publish, 'Compute insider version').run).toContain(
      'BASE="${BASE_VERSION%%-*}"',
    );

    const create = stepNamed(releaseJob, 'Create immutable insider release');
    expect(releaseJob.permissions).toEqual({ contents: 'write' });
    expect(create.run).toContain('gh release create "${tag}"');
    expect(create.run).toContain('--target "${SOURCE_SHA}"');
    expect(create.run).toContain('--prerelease');
    expect(create.run).toContain('--json isPrerelease,targetCommitish');
    expect(create.run).toContain('Reusing existing insider release');

    expect(standaloneJob.uses).toBe('./.github/workflows/squad-standalone-release.yml');
    expect(standaloneJob.with).toMatchObject({
      upload: true,
      release_tag: '${{ needs.release.outputs.tag }}',
      source_ref: '${{ needs.publish.outputs.source_sha }}',
      package_version: '${{ needs.publish.outputs.insider_version }}',
    });
    expect(standaloneJob.secrets).toEqual({
      HOMEBREW_TAP_TOKEN: '${{ secrets.HOMEBREW_TAP_TOKEN }}',
      WINGET_CREATE_GITHUB_TOKEN: '${{ secrets.WINGET_CREATE_GITHUB_TOKEN }}',
    });
  });

  it('overrides package versions only for generated insider bundles', () => {
    const override = stepNamed(
      standaloneWorkflow.jobs.build,
      'Apply package version override',
    );
    expect(override.if).toBe("inputs.package_version != ''");
    expect(override.run).toContain('-insider\\.');
    expect(override.run).toContain("pkg.version = version");
    expect(override.run).toContain("pkg.dependencies['@bradygaster/squad-sdk'] = version");
  });
});

describe('public installation guidance', () => {
  it('documents all package-manager channels without presenting npx as a CLI option', () => {
    const combined = publicCliDocs.map(([, content]) => content).join('\n');

    expect(combined).toContain('squad-preview');
    expect(combined).toContain('squad-insider');
    expect(combined).toContain('bradygaster.Squad.Preview');
    expect(combined).toContain('bradygaster.Squad.Insider');
    for (const [file, content] of publicCliDocs) {
      expect(content, file).not.toMatch(
        /\bnpx\s+(?:--yes\s+|-y\s+)?(?:@bradygaster\/squad-cli|squad\b)/,
      );
    }
  });
});

describe('automated package publication', () => {
  const packaging = standaloneWorkflow.jobs.packaging;
  const homebrew = standaloneWorkflow.jobs['publish-homebrew'];
  const winget = standaloneWorkflow.jobs['publish-winget'];

  it('publishes the generated artifact after release upload', () => {
    expect(packaging.needs).toBe('publish');
    expect(homebrew.needs).toBe('packaging');
    expect(winget.needs).toBe('packaging');
    expect(packaging.outputs?.release_tag).toContain('steps.generate.outputs.release_tag');

    const packagingUpload = packaging.steps?.find(
      (step) => step.uses?.startsWith('actions/upload-artifact@')
        && step.with?.name === 'packaging-manifests',
    );
    expect(packagingUpload).toBeDefined();
    const checksumDownload = packaging.steps?.find(
      (step) => step.uses?.startsWith('actions/download-artifact@'),
    );
    expect(checksumDownload?.with).toMatchObject({
      name: 'standalone-release-checksums',
      path: 'release-metadata',
    });
    expect(stepNamed(packaging, 'Generate manifests').run).toContain(
      '--checksums release-metadata/SHA256SUMS.txt',
    );

    for (const job of [homebrew, winget]) {
      const artifactDownload = job.steps?.find(
        (step) => step.uses?.startsWith('actions/download-artifact@'),
      );
      expect(artifactDownload?.with?.name).toBe('packaging-manifests');
      expect(serialized(job)).not.toContain('generate-packaging.mjs');
    }

    expect(standalone).not.toMatch(/maintainer to submit|Download the `packaging-manifests` artifact/i);
  });

  it('keeps published archives immutable across reruns', () => {
    const publish = standaloneWorkflow.jobs.publish;
    const upload = stepNamed(publish, 'Upload to release').run ?? '';
    const archiveUpload = upload
      .split('\n')
      .find((line) => line.includes('gh release upload "${TAG}" "${upload_paths[@]}"'));

    expect(upload).toContain('gh release download "${TAG}"');
    expect(upload).toContain('mv -- "${existing_dir}/${asset}" "${asset}"');
    expect(upload).toContain('sha256sum "${asset}" > "${asset}.sha256"');
    expect(upload.indexOf('mv -- "${existing_dir}/${asset}" "${asset}"')).toBeLessThan(
      upload.indexOf('sha256sum "${asset}" > "${asset}.sha256"'),
    );
    expect(archiveUpload).toBeDefined();
    expect(archiveUpload).not.toContain('--clobber');
    expect(upload).toContain(
      'gh release upload "${TAG}" SHA256SUMS.txt --clobber --repo "${GITHUB_REPOSITORY}"',
    );

    const checksumUpload = publish.steps?.find(
      (step) => step.uses?.startsWith('actions/upload-artifact@')
        && step.with?.name === 'standalone-release-checksums',
    );
    expect(checksumUpload?.with?.path).toBe('artifacts/SHA256SUMS.txt');
  });

  it('serializes mutable channels and publishes strict stable, preview, and insider tags', () => {
    expect(standaloneWorkflow.concurrency).toEqual({
      group: 'squad-standalone-release-publication',
      'cancel-in-progress': false,
    });
    expect(packaging.outputs?.release_channel).toBe(
      '${{ steps.generate.outputs.release_channel }}',
    );
    expect(packaging.outputs?.homebrew_cask).toBe(
      '${{ steps.generate.outputs.homebrew_cask }}',
    );
    expect(packaging.outputs?.winget_identifier).toBe(
      '${{ steps.generate.outputs.winget_identifier }}',
    );

    const generate = stepNamed(packaging, 'Generate manifests').run ?? '';
    expect(generate).toContain('channel=stable');
    expect(generate).toContain('channel=preview');
    expect(generate).toContain('channel=insider');
    expect(generate).toContain('homebrew_cask=squad-preview');
    expect(generate).toContain('winget_identifier=bradygaster.Squad.Insider');
    expect(homebrew.if).toBe('inputs.publish_package_managers');
    expect(winget.if).toBe('inputs.publish_package_managers');
  });

  it('checks out packaging at the same explicit source ref as the build', () => {
    const expectedRef =
      '${{ inputs.source_ref || inputs.release_tag || github.ref }}';

    for (const jobName of ['build', 'packaging']) {
      const checkout = standaloneWorkflow.jobs[jobName].steps?.find((step) =>
        step.uses?.startsWith('actions/checkout@'),
      );
      expect(checkout?.with?.ref, jobName).toBe(expectedRef);
    }
  });

  it('passes only dedicated external credentials while keeping GITHUB_TOKEN contents-only', () => {
    expect(releaseWorkflow.jobs.standalone.secrets).toEqual({
      HOMEBREW_TAP_TOKEN: '${{ secrets.HOMEBREW_TAP_TOKEN }}',
      WINGET_CREATE_GITHUB_TOKEN: '${{ secrets.WINGET_CREATE_GITHUB_TOKEN }}',
    });
    expect(
      Object.keys(standaloneWorkflow.on?.workflow_call?.secrets ?? {}).sort(),
    ).toEqual(['HOMEBREW_TAP_TOKEN', 'WINGET_CREATE_GITHUB_TOKEN']);
    expect(
      standaloneWorkflow.on?.workflow_call?.secrets?.HOMEBREW_TAP_TOKEN?.required,
    ).toBe(false);
    expect(
      standaloneWorkflow.on?.workflow_call?.secrets?.WINGET_CREATE_GITHUB_TOKEN?.required,
    ).toBe(false);
    expect(releaseWorkflow.jobs.standalone.permissions).toEqual({
      contents: 'write',
      actions: 'read',
    });

    for (const permissions of [
      releaseWorkflow.permissions,
      releaseWorkflow.jobs['promote-latest'].permissions,
      standaloneWorkflow.permissions,
      standaloneWorkflow.jobs.publish.permissions,
      homebrew.permissions,
      winget.permissions,
    ]) {
      expect(Object.keys(permissions ?? {})).toEqual(['contents']);
    }
    expect(homebrew.permissions).toEqual({ contents: 'read' });
    expect(winget.permissions).toEqual({ contents: 'read' });

    expect(serialized(homebrew)).toContain('HOMEBREW_TAP_TOKEN');
    expect(serialized(homebrew)).not.toContain('WINGET_CREATE_GITHUB_TOKEN');
    expect(serialized(winget)).toContain('WINGET_CREATE_GITHUB_TOKEN');
    expect(serialized(winget)).not.toContain('HOMEBREW_TAP_TOKEN');

    const allRunScripts = [...(homebrew.steps ?? []), ...(winget.steps ?? [])]
      .map((step) => step.run ?? '')
      .join('\n');
    expect(allRunScripts).not.toContain('${{ secrets.');
  });

  it('fails actionably when either dedicated credential is absent', () => {
    const homebrewGate = stepNamed(homebrew, 'Require Homebrew tap credential');
    expect(homebrewGate.env?.HOMEBREW_TAP_TOKEN).toBe(
      '${{ secrets.HOMEBREW_TAP_TOKEN }}',
    );
    expect(homebrewGate.run).toContain('[ -z "${HOMEBREW_TAP_TOKEN}" ]');
    expect(homebrewGate.run).toMatch(/classic PAT.*public_repo/);

    const wingetGate = stepNamed(winget, 'Require WinGet publication credential');
    expect(wingetGate.env?.WINGET_CREATE_GITHUB_TOKEN).toBe(
      '${{ secrets.WINGET_CREATE_GITHUB_TOKEN }}',
    );
    expect(wingetGate.run).toContain('[ -z "${WINGET_CREATE_GITHUB_TOKEN}" ]');
    expect(wingetGate.run).toMatch(/classic PAT.*public_repo/);
  });

  it('clones the tap anonymously and scopes the push credential locally', () => {
    const clone = stepNamed(
      homebrew,
      'Clone Homebrew tap (anonymous read; bradygaster/homebrew-squad is public)',
    );
    expect(clone.run).toContain(
      'git clone --depth 1 --branch main https://github.com/bradygaster/homebrew-squad.git homebrew-tap',
    );
    // The read-only clone must never receive the publish token: if it did, the
    // same auth-setup path that failed in production (actions/checkout
    // configuring credentials for the initial fetch of an external repo)
    // would be reintroduced.
    expect(clone.run).not.toContain('secrets.HOMEBREW_TAP_TOKEN');
    expect(clone.env ?? {}).not.toHaveProperty('HOMEBREW_TAP_TOKEN');
    expect(homebrew.steps?.some((step) => step.with?.repository === 'bradygaster/homebrew-squad')).toBe(false);

    const credential = stepNamed(
      homebrew,
      'Configure Homebrew tap push credential (scoped locally; never passed to the read-only clone)',
    );
    expect(credential['working-directory']).toBe('homebrew-tap');
    expect(credential.env?.TOKEN).toBe('${{ secrets.HOMEBREW_TAP_TOKEN }}');
    expect(credential.run).toContain('git config --local http.https://github.com/.extraheader');
    expect(credential.run).not.toContain('--global');
    // The token must not be echoed/logged anywhere in the credential step.
    expect(credential.run).not.toMatch(/echo.*TOKEN/);

    const publish = stepNamed(homebrew, 'Publish cask to the tap').run ?? '';
    expect(publish).toContain('../packaging/homebrew/${CASK}.rb');
    expect(publish).toContain('Casks/${CASK}.rb');
    expect(publish).toContain('cmp -s');
    expect(publish).toContain('git status --porcelain');
    expect(publish).toContain('git add -- "${target_cask}"');
    expect(publish).toContain('git push origin HEAD:main');
    expect(publish).toContain('github-actions[bot]');
    expect(publish).not.toMatch(/git add (?:\.|-A)|git push .*--force/);
  });

  it('validates channel cask versions and refuses stale Homebrew downgrades', () => {
    const publish = stepNamed(homebrew, 'Publish cask to the tap').run ?? '';
    expect(publish).toContain('extract_cask_version');
    expect(publish).toContain('preview)');
    expect(publish).toContain('insider)');
    expect(publish).toContain('is not valid for ${CHANNEL}');
    expect(publish).toContain('candidate_version');
    expect(publish).toContain('current_version');
    expect(publish).toContain('version_is_newer');
    expect(publish).toContain('Refused to downgrade');
  });

  it('validates and idempotently publishes only the three WinGet manifests', () => {
    const metadata = stepNamed(winget, 'Resolve WinGet release metadata').run ?? '';
    expect(metadata).toContain('-(preview|insider)');
    expect(metadata).toContain('branch="bradygaster-squad-${CHANNEL}-${version}"');
    expect(metadata).toContain('package_root="manifests/b/${PACKAGE_IDENTIFIER//./\\/}"');
    expect(metadata).toContain('${PACKAGE_IDENTIFIER}.yaml');
    expect(metadata).toContain('${PACKAGE_IDENTIFIER}.installer.yaml');
    expect(metadata).toContain('${PACKAGE_IDENTIFIER}.locale.en-US.yaml');

    const guard = stepNamed(winget, 'Check WinGet publication state').run ?? '';
    expect(guard).toContain('winget-base/${manifest_dir}');
    expect(guard).toContain('repos/microsoft/winget-pkgs/pulls');
    expect(guard).toContain('-f "head=tamirdresher:${BRANCH}"');
    expect(guard).toContain('git ls-remote --exit-code --heads');
    expect(guard).toContain('compare/master...tamirdresher:${BRANCH}');
    expect(guard).toContain('changes unrelated path');

    const existingCheckout = stepNamed(
      winget,
      'Check out existing WinGet version branch (anonymous read; tamirdresher/winget-pkgs is public)',
    );
    expect(existingCheckout.if).toContain("branch_exists == 'true'");
    expect(existingCheckout.run).toContain(
      'git clone --no-checkout --depth 1 --branch "${BRANCH}" --filter=blob:none \\\n  https://github.com/tamirdresher/winget-pkgs.git winget-pkgs',
    );
    expect(existingCheckout.run).not.toContain('secrets.WINGET_CREATE_GITHUB_TOKEN');
    expect(winget.steps?.some((step) => step.with?.repository === 'tamirdresher/winget-pkgs')).toBe(false);

    const existingCredential = stepNamed(
      winget,
      'Configure existing-branch push credential (scoped locally; never passed to the read-only clone)',
    );
    expect(existingCredential.env?.TOKEN).toBe('${{ secrets.WINGET_CREATE_GITHUB_TOKEN }}');
    expect(existingCredential.run).toContain('git config --local http.https://github.com/.extraheader');

    const publish = stepNamed(winget, 'Push manifests and open upstream PR').run ?? '';
    expect(publish).toContain('../packaging/winget/${manifest_name}');
    expect(publish).toContain('git add -- "${expected_paths[@]}"');
    expect(publish).toContain('git push origin "HEAD:refs/heads/${BRANCH}"');
    expect(publish).toContain('repos/microsoft/winget-pkgs/pulls');
    expect(publish).toContain('-f "head=tamirdresher:${BRANCH}"');
    expect(publish).toContain('--repo microsoft/winget-pkgs');
    expect(publish).toContain('--base master');
    expect(publish).toContain('--head "tamirdresher:${BRANCH}"');
    expect(publish).toContain('New version: ${PACKAGE_IDENTIFIER} version ${VERSION}');
    expect(publish).not.toMatch(/git add (?:\.|-A)|git push .*--force/);
  });

  it('pins publication actions and never cancels serialized publication', () => {
    for (const job of [homebrew, winget]) {
      for (const step of job.steps ?? []) {
        if (step.uses) {
          expect(step.uses).toMatch(/^[^@]+@[0-9a-f]{40}$/);
        }
      }
    }

    expect(standaloneWorkflow.concurrency?.group).toBe(
      'squad-standalone-release-publication',
    );
    expect(standaloneWorkflow.concurrency?.['cancel-in-progress']).toBe(false);
  });

  it('documents the strict, reviewable four-workflow bootstrap', () => {
    expect(ghAwGuide).toContain('gh aw compile --strict --approve');
    expect(ghAwGuide).toContain('gh aw compile --strict');
    expect(ghAwGuide).toContain('gh pr create');
    expect(ghAwGuide).toContain('requestReviewsByLogin');
    expect(ghAwGuide).toContain('copilot-pull-request-reviewer');
    expect(ghAwGuide).toContain('gh pr checks --watch');
    expect(ghAwGuide).toContain('.github/aw/');
    expect(ghAwGuide).toContain('`.vscode/settings.json`');
    expect(ghAwGuide).toContain('SQUAD_GITHUB_APP_PRIVATE_KEY');
    expect(ghAwGuide).toContain('SQUAD_GITHUB_TOKEN');
    expect(ghAwGuide).toContain('both slash-command and `github-actions[bot]`');
    expect(ghAwGuide).toContain('The completion comment links the created Cast PR');
    expect(ghAwGuide).toContain('application CI is `action_required`');
    expect(ghAwGuide).toContain(
      '`squad-deps-worker.md` and `squad-deps-worker.lock.yml`',
    );
  });

  it('documents the v0.13.1 npm-free activation and committed-state boundary', () => {
    expect(ghAwGuide).toContain(
      'standalone GitHub Release bundle with checksum verification',
    );
    expect(ghAwGuide).toContain('a merged Cast');
    expect(ghAwGuide).not.toContain('Installs `@bradygaster/squad-cli`');
    expect(ghAwGuide).not.toContain('State does not persist across runs.');
    expect(ghAwGuide).not.toContain('`create-issue` safe-output has a max of 75');
  });

  it('keeps the Cast prompt aligned with the documented naming modes', () => {
    expect(ghAwGuide).toContain('### Descriptive (default)');
    expect(ghAwGuide).toContain('When you don\'t request a themed universe');
    expect(ghAwGuide).toMatch(/themed\s+names without specifying a universe/);
    expect(ghAwGuide).toContain('You can request **any universe**');

    expect(squadWorkflow).toMatch(/No themed naming request.*descriptive mode/s);
    expect(squadWorkflow).toMatch(
      /Explicit built-in or custom universe request.*requested universe/s,
    );
    expect(squadWorkflow).toMatch(
      /Themed names requested without a universe.*auto-select.*built-in universe/s,
    );
  });
});
