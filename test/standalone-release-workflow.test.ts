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
const promote = readFileSync(join(WORKFLOWS, 'squad-promote.yml'), 'utf8');

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
const promoteWorkflow = parse(promote) as WorkflowDefinition;

function stepNamed(job: WorkflowJob, name: string): WorkflowStep {
  const step = job.steps?.find((candidate) => candidate.name === name);
  expect(step, `missing step "${name}"`).toBeDefined();
  return step!;
}

function serialized(job: WorkflowJob): string {
  return JSON.stringify(job);
}

describe('standalone release handoff', () => {
  it('publishes on-demand prereleases from dev and automatic stable releases from main', () => {
    expect(release).toMatch(/workflow_dispatch:\r?\n\s+inputs:\r?\n\s+confirm_tag:/);
    expect(release).toContain(
      "description: 'Confirm the release tag (for example v0.14.0-preview.1 or v0.14.0)'",
    );
    expect(releaseWorkflow.on?.push?.branches).toEqual(['main']);
    expect(release).toContain('RELEASE_REF: ${{ github.ref }}');
    expect(release).toContain('if [ "$RELEASE_REF" = "refs/heads/dev" ]; then');
    expect(release).toContain('elif [ "$RELEASE_REF" = "refs/heads/main" ]; then');
    expect(release).toContain('if [ "$RELEASE_REF" != "refs/heads/main" ]; then');
    expect(release).toContain('Manual dev releases require a prerelease version');
    expect(release).toContain('Manual main releases require a stable MAJOR.MINOR.PATCH version');
    expect(release).toContain('The main branch requires a stable MAJOR.MINOR.PATCH version');
    expect(release).toContain('-preview\\.(0|[1-9][0-9]*)');
    expect(release).toContain('Preview releases require the CLI SDK dependency');
    expect(release).toContain('--prerelease');
    expect(release).toContain('--latest');
    expect(releaseWorkflow.jobs.release.outputs?.stable_release).toBe(
      '${{ steps.version.outputs.stable_release }}',
    );
  });

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
    expect(releaseWorkflow.jobs.standalone.secrets).not.toBe('inherit');
  });

  it('accepts explicit release and source refs for calls and manual backfills', () => {
    expect(standalone).toMatch(/workflow_call:\r?\n\s+inputs:/);
    expect(standalone).toMatch(/workflow_dispatch:\r?\n\s+inputs:/);
    for (const input of ['node_version:', 'upload:', 'release_tag:', 'source_ref:']) {
      const inputName = input.slice(0, -1);
      expect(standaloneWorkflow.on?.workflow_call?.inputs).toHaveProperty(inputName);
      expect(standaloneWorkflow.on?.workflow_dispatch?.inputs).toHaveProperty(inputName);
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
      "${{ inputs.release_tag || github.event.release.tag_name || (github.ref_type == 'tag' && github.ref_name) }}";
    expect(
      stepNamed(standaloneWorkflow.jobs.publish, 'Upload to release').env?.TAG,
    ).toBe(tagExpression);
    expect(
      stepNamed(standaloneWorkflow.jobs.packaging, 'Generate manifests').env?.TAG,
    ).toBe(tagExpression);
  });

  it('calls the reusable npm workflow after creating a release', () => {
    expect(releaseWorkflow.jobs.release.outputs?.version).toBe(
      '${{ steps.version.outputs.version }}',
    );

    const caller = releaseWorkflow.jobs.npm;
    expect(caller.needs).toBe('release');
    expect(caller.if).toBe("needs.release.outputs.created == 'true'");
    expect(caller.uses).toBe('./.github/workflows/squad-npm-publish.yml');
    expect(caller.with).toEqual({
      version: '${{ needs.release.outputs.version }}',
      source_ref: '${{ needs.release.outputs.tag }}',
    });
    expect(caller.secrets).toEqual({
      NPM_TOKEN: '${{ secrets.NPM_TOKEN }}',
    });
    expect(caller.permissions).toEqual({
      contents: 'write',
      'id-token': 'write',
      'pull-requests': 'write',
    });
  });
});

describe('stable promotion', () => {
  it('promotes directly from dev to main through a validated sanitized merge', () => {
    expect(existsSync(join(WORKFLOWS, 'squad-preview.yml'))).toBe(false);
    expect(Object.keys(promoteWorkflow.jobs)).toEqual(['dev-to-main']);

    const promotion = serialized(promoteWorkflow.jobs['dev-to-main']);
    expect(promotion).toContain('git merge origin/dev --no-commit --no-ff -X theirs || true');
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
    expect(promotion).not.toContain('origin/preview');
    expect(promoteWorkflow.permissions).toEqual({
      actions: 'write',
      contents: 'write',
    });
  });
});

describe('reusable npm publication', () => {
  it('preserves direct triggers and declares only the required npm credential', () => {
    expect(npmPublishWorkflow.on?.release?.types).toContain('published');
    expect(npmPublishWorkflow.on?.workflow_dispatch?.inputs).toHaveProperty('version');
    expect(npmPublishWorkflow.on?.workflow_call?.inputs?.version).toMatchObject({
      required: true,
      type: 'string',
    });
    expect(npmPublishWorkflow.on?.workflow_call?.inputs?.source_ref).toMatchObject({
      required: false,
      type: 'string',
    });
    expect(Object.keys(npmPublishWorkflow.on?.workflow_call?.secrets ?? {})).toEqual([
      'NPM_TOKEN',
    ]);
    expect(npmPublishWorkflow.on?.workflow_call?.secrets?.NPM_TOKEN?.required).toBe(true);
    expect(npmPublishWorkflow.permissions).toEqual({ contents: 'read' });
    expect(npmPublishWorkflow.concurrency).toEqual({
      group: 'squad-npm-publication',
      'cancel-in-progress': false,
    });
  });

  it('uses the requested source ref except for the dev activation pin', () => {
    for (const jobName of [
      'preflight',
      'smoke-test',
      'publish-sdk',
      'publish-cli',
      'promote-insider-tag-sdk',
      'promote-insider-tag-cli',
    ]) {
      const checkout = npmPublishWorkflow.jobs[jobName].steps?.find((step) =>
        step.uses?.startsWith('actions/checkout@'),
      );
      expect(checkout?.with?.ref, jobName).toBe('${{ inputs.source_ref || github.ref }}');
    }

    const activationCheckout = npmPublishWorkflow.jobs['bump-activation-pin'].steps?.find(
      (step) => step.uses?.startsWith('actions/checkout@'),
    );
    expect(activationCheckout?.with?.ref).toBe('dev');
  });

  it('builds release-tag workspaces without contributor-only prebuild inputs', () => {
    const build = stepNamed(npmPublishWorkflow.jobs['smoke-test'], 'Build');
    expect(build.run).toBe(
      'npm -w packages/squad-sdk run build && npm -w packages/squad-cli run build',
    );
  });

  it('validates reusable and manual versions without expression injection', () => {
    expect(npmPublish).not.toContain('github.event.inputs.version');

    for (const jobName of [
      'publish-sdk',
      'publish-cli',
      'promote-insider-tag-sdk',
      'promote-insider-tag-cli',
    ]) {
      const normalize = npmPublishWorkflow.jobs[jobName].steps?.find(
        (step) => step.name === 'Determine and validate version',
      );
      expect(normalize?.env?.INPUT_VERSION, jobName).toBe('${{ inputs.version }}');
      expect(normalize?.run, jobName).not.toContain('${{ inputs.version');
      expect(normalize?.run, jobName).toContain("semver_re='^(0|[1-9][0-9]*)");
      expect(normalize?.run, jobName).toContain('=~');
    }
  });

  it('guards preview publication against stale workspace SDK resolution', () => {
    const guard = stepNamed(
      npmPublishWorkflow.jobs.preflight,
      'Validate workspace release dependency',
    );
    expect(guard.run).toContain('const expected = `>=${sdk.version}`');
    expect(guard.run).toContain('lockDependency !== expected');
  });

  it('skips each existing package independently and still verifies it', () => {
    const packages = [
      ['publish-sdk', '@bradygaster/squad-sdk'],
      ['publish-cli', '@bradygaster/squad-cli'],
    ];

    for (const [jobName, packageName] of packages) {
      const steps = npmPublishWorkflow.jobs[jobName].steps ?? [];
      const publishIndex = steps.findIndex((step) => step.name?.startsWith('Publish '));
      const verifyIndex = steps.findIndex((step) => step.name === 'Verify npm publication');
      const publish = steps[publishIndex];

      expect(publish.run, jobName).toContain(
        `npm view "${packageName}@\${PACKAGE_VERSION}" version`,
      );
      expect(publish.run, jobName).toContain('already exists; skipping npm publish');
      expect(publish.run, jobName).toContain('publish --access public --provenance');
      expect(verifyIndex, jobName).toBeGreaterThan(publishIndex);
      expect(steps[verifyIndex].run, jobName).toContain(
        `npm view "${packageName}@\${PACKAGE_VERSION}" version`,
      );
    }
  });

  it('publishes stable versions to latest and prereleases to preview', () => {
    for (const jobName of ['publish-sdk', 'publish-cli']) {
      const job = npmPublishWorkflow.jobs[jobName];
      const normalize = stepNamed(job, 'Determine and validate version');
      const publish = job.steps?.find((step) => step.name?.startsWith('Publish '));
      const verify = stepNamed(job, 'Verify npm publication');

      expect(job.outputs?.dist_tag, jobName).toBe('${{ steps.version.outputs.dist_tag }}');
      expect(job.outputs?.stable_release, jobName).toBe(
        '${{ steps.version.outputs.stable_release }}',
      );
      expect(normalize.run, jobName).toContain('dist_tag=preview');
      expect(normalize.run, jobName).toContain('dist_tag=latest');
      expect(normalize.run, jobName).toContain('expected MAJOR.MINOR.PATCH-preview.N');
      expect(publish?.env?.NPM_DIST_TAG, jobName).toBe(
        '${{ steps.version.outputs.dist_tag }}',
      );
      expect(publish?.run, jobName).toContain('--tag "$NPM_DIST_TAG"');
      expect(publish?.run, jobName).toContain('"dist-tags.${NPM_DIST_TAG}"');
      expect(verify.run, jobName).toContain('"dist-tags.${NPM_DIST_TAG}"');
    }

    expect(npmPublishWorkflow.jobs['bump-activation-pin'].if).toBe(
      "needs.publish-cli.outputs.stable_release == 'true'",
    );
    expect(npmPublishWorkflow.jobs['promote-insider-tag-sdk'].if).toBe(
      "needs.publish-sdk.outputs.stable_release == 'true'",
    );
    expect(npmPublishWorkflow.jobs['promote-insider-tag-cli'].if).toBe(
      "needs.publish-cli.outputs.stable_release == 'true'",
    );
  });

  it('uses least privilege for provenance and the activation pin PR', () => {
    for (const jobName of [
      'publish-sdk',
      'publish-cli',
    ]) {
      expect(npmPublishWorkflow.jobs[jobName].permissions, jobName).toEqual({
        'id-token': 'write',
        contents: 'read',
      });
    }
    for (const jobName of ['promote-insider-tag-sdk', 'promote-insider-tag-cli']) {
      expect(npmPublishWorkflow.jobs[jobName].permissions).toBeUndefined();
    }
    expect(npmPublishWorkflow.jobs['bump-activation-pin'].permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
    });
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

  it('serializes mutable channels and gates them on strict stable tags', () => {
    expect(standaloneWorkflow.concurrency).toEqual({
      group: 'squad-standalone-release-publication',
      'cancel-in-progress': false,
    });
    expect(packaging.outputs?.stable_release).toBe(
      '${{ steps.generate.outputs.stable_release }}',
    );

    const generate = stepNamed(packaging, 'Generate manifests').run ?? '';
    expect(generate).toContain(
      '[[ "${TAG}" =~ ^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$ ]]',
    );
    expect(homebrew.if).toBe("needs.packaging.outputs.stable_release == 'true'");
    expect(winget.if).toBe("needs.packaging.outputs.stable_release == 'true'");
  });

  it('checks out packaging at the same explicit source ref as the build', () => {
    const expectedRef =
      '${{ inputs.source_ref || inputs.release_tag || github.event.release.tag_name || github.ref }}';

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

    for (const permissions of [
      releaseWorkflow.permissions,
      releaseWorkflow.jobs.standalone.permissions,
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

  it('updates only the tap cask and skips an identical manifest', () => {
    const checkout = homebrew.steps?.find(
      (step) => step.with?.repository === 'bradygaster/homebrew-squad',
    );
    expect(checkout?.uses).toMatch(/^actions\/checkout@[0-9a-f]{40}$/);
    expect(checkout?.with).toMatchObject({
      ref: 'main',
      path: 'homebrew-tap',
      token: '${{ secrets.HOMEBREW_TAP_TOKEN }}',
    });

    const publish = stepNamed(homebrew, 'Publish cask to the tap').run ?? '';
    expect(publish).toContain('../packaging/homebrew/squad.rb');
    expect(publish).toContain('Casks/squad.rb');
    expect(publish).toContain('cmp -s');
    expect(publish).toContain('git status --porcelain');
    expect(publish).toContain('git add -- "${target_cask}"');
    expect(publish).toContain('git push origin HEAD:main');
    expect(publish).toContain('github-actions[bot]');
    expect(publish).not.toMatch(/git add (?:\.|-A)|git push .*--force/);
  });

  it('validates cask versions and refuses stale Homebrew downgrades', () => {
    const publish = stepNamed(homebrew, 'Publish cask to the tap').run ?? '';
    expect(publish).toContain('extract_stable_cask_version');
    expect(publish).toContain('is not stable SemVer');
    expect(publish).toContain('candidate_version');
    expect(publish).toContain('current_version');
    expect(publish).toContain('version_is_newer');
    expect(publish).toContain('Refused to downgrade');
  });

  it('validates and idempotently publishes only the three WinGet manifests', () => {
    const metadata = stepNamed(winget, 'Resolve WinGet release metadata').run ?? '';
    expect(metadata).toContain(
      '^v((0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*))$',
    );
    expect(metadata).toContain('branch="bradygaster-squad-${version}"');
    expect(metadata).toContain('package_root="manifests/b/bradygaster/Squad"');
    for (const manifest of [
      'bradygaster.Squad.yaml',
      'bradygaster.Squad.installer.yaml',
      'bradygaster.Squad.locale.en-US.yaml',
    ]) {
      expect(metadata).toContain(manifest);
    }

    const guard = stepNamed(winget, 'Check WinGet publication state').run ?? '';
    expect(guard).toContain('winget-base/${manifest_dir}');
    expect(guard).toContain('repos/microsoft/winget-pkgs/pulls');
    expect(guard).toContain('-f "head=tamirdresher:${BRANCH}"');
    expect(guard).toContain('winget-base/${PACKAGE_ROOT}');
    expect(guard).toContain('git ls-remote --exit-code --heads');
    expect(guard).toContain('compare/master...tamirdresher:${BRANCH}');
    expect(guard).toContain('changes unrelated path');

    const existingCheckout = stepNamed(
      winget,
      'Check out existing WinGet version branch',
    );
    expect(existingCheckout.with?.repository).toBe('tamirdresher/winget-pkgs');
    expect(existingCheckout.if).toContain("branch_exists == 'true'");

    const publish = stepNamed(winget, 'Push manifests and open upstream PR').run ?? '';
    expect(publish).toContain('../packaging/winget/${manifest_name}');
    expect(publish).toContain('git add -- "${expected_paths[@]}"');
    expect(publish).toContain('git push origin "HEAD:refs/heads/${BRANCH}"');
    expect(publish).toContain('repos/microsoft/winget-pkgs/pulls');
    expect(publish).toContain('-f "head=tamirdresher:${BRANCH}"');
    expect(publish).toContain('--repo microsoft/winget-pkgs');
    expect(publish).toContain('--base master');
    expect(publish).toContain('--head "tamirdresher:${BRANCH}"');
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
});
