import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const source = read('workflows/shared/squad.md');

describe('Squad standalone activation latest-release default', () => {
  it('delegates release selection to the immutable action without an override', () => {
    const install = source.match(
      /- name: Install Squad CLI from standalone release[\s\S]*?(?=\n\s+- name:)/,
    )?.[0];

    expect(install, 'workflows/shared/squad.md must retain the standalone install step').toBeDefined();
    expect(install).toContain(
      'uses: bradygaster/squad/.github/actions/squad-init@d8d7ef2d6da93460fecbfd56f8de20f9d10fd377',
    );
    expect(install).toContain("skip-init: 'true'");
    expect(install, 'workflows/shared/squad.md must use the action default, not a version input')
      .not.toMatch(/^\s+version:/m);
    expect(source, 'workflows/shared/squad.md must not resolve a workflow-level CLI override')
      .not.toContain('squad-release');
    expect(source).not.toContain('vars.SQUAD_CLI_VERSION');
    expect(source).not.toMatch(/\bnpm (?:install|ci|view)\b/);
    expect(source).toContain('SQUAD_CLI_VERSION: ${{ steps.squad-cli.outputs.version }}');
    expect(source).toContain('squad health --json');
  });

  it('retains the action latest default and fail-closed checksum installer', () => {
    const action = parse(read('.github/actions/squad-init/action.yml'));
    const installer = read('scripts/install.sh');

    expect(action.inputs.version.default).toBe('latest');
    expect(action.outputs.version.value).toBe('${{ steps.install.outputs.version }}');
    expect(installer).toContain('VERSION="${VERSION:-latest}"');
    expect(installer).toContain('/releases/latest');
    expect(installer).toContain('/${VERSION}/SHA256SUMS.txt');
    expect(installer).toContain('err "Checksum download failed: $checksum_url"');
    expect(installer).toContain('err "Checksum mismatch for ${asset}. Expected ${expected}, got ${actual}."');
  });

  it('does not leave automation that requires or reintroduces the removed CLI pin', () => {
    const publish = parse(read('.github/workflows/squad-npm-publish.yml'));

    expect(publish.jobs, 'squad-npm-publish.yml must not rewrite the latest-default activation')
      .not.toHaveProperty('bump-activation-pin');
    for (const path of [
      '.github/workflows/squad-cli-pin-drift.yml',
      'scripts/bump-activation-pin.mjs',
    ]) {
      expect(existsSync(join(process.cwd(), path)), `${path} requires the obsolete CLI literal`).toBe(false);
    }
  });

  it('documents latest CLI releases separately from immutable workflow source pins', () => {
    const docs = read('docs/src/content/docs/guide/gh-aw.md');

    expect(docs).not.toContain('`SQUAD_CLI_VERSION`');
    expect(docs).toContain('latest stable GitHub Release');
    expect(docs).toContain('checksum verification');
    expect(docs).toContain('SQUAD_SHA');
  });
});
