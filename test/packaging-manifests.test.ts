/**
 * Tests for scripts/generate-packaging.mjs.
 *
 * The renderers are pure, so these exercise them directly rather than shelling
 * out. The assertions focus on the things that silently produce a broken
 * package rather than a failed build: wrong checksum casing, a non-exe winget
 * target, or a stale version leaking into one manifest but not another.
 */

import { describe, it, expect } from 'vitest';
import {
  parseChecksums,
  homebrewToken,
  releaseChannel,
  renderHomebrewCask,
  renderWingetInstaller,
  renderWingetLocale,
  renderWingetVersion,
  wingetPackageIdentifier,
} from '../scripts/generate-packaging.mjs';

const SHA = {
  darwinArm: 'a'.repeat(64),
  darwinX64: 'b'.repeat(64),
  winX64: 'c'.repeat(64),
  winArm: 'd'.repeat(64),
};

const CHECKSUMS = {
  'squad-darwin-arm64.tar.gz': SHA.darwinArm,
  'squad-darwin-x64.tar.gz': SHA.darwinX64,
  'squad-win32-x64.zip': SHA.winX64,
  'squad-win32-arm64.zip': SHA.winArm,
};

const BASE = { version: 'v1.2.3', repo: 'bradygaster/squad', checksums: CHECKSUMS };

describe('parseChecksums', () => {
  it('parses GNU sha256sum output', () => {
    const parsed = parseChecksums(`${SHA.winX64}  squad-win32-x64.zip\n${SHA.darwinArm}  squad-darwin-arm64.tar.gz\n`);
    expect(parsed['squad-win32-x64.zip']).toBe(SHA.winX64);
    expect(parsed['squad-darwin-arm64.tar.gz']).toBe(SHA.darwinArm);
  });

  it('parses BSD shasum output', () => {
    // macOS runners produce this shape; the release workflow may not always be
    // the only producer of a checksum file.
    const parsed = parseChecksums(`SHA256 (squad-darwin-x64.tar.gz) = ${SHA.darwinX64}`);
    expect(parsed['squad-darwin-x64.tar.gz']).toBe(SHA.darwinX64);
  });

  it('strips directory prefixes and normalizes case', () => {
    const parsed = parseChecksums(`${SHA.winArm.toUpperCase()}  ./dist/squad-win32-arm64.zip`);
    expect(parsed['squad-win32-arm64.zip']).toBe(SHA.winArm);
  });

  it('ignores blank lines and junk', () => {
    const parsed = parseChecksums(`\n\nnot a checksum line\n${SHA.winX64}  squad-win32-x64.zip\n`);
    expect(Object.keys(parsed)).toEqual(['squad-win32-x64.zip']);
  });
});

describe('renderHomebrewCask', () => {
  const cask = renderHomebrewCask(BASE);

  it('emits both arch checksums against the right assets', () => {
    expect(cask).toContain(`arm:   "${SHA.darwinArm}"`);
    expect(cask).toContain(`intel: "${SHA.darwinX64}"`);
  });

  it('uses the bare version, not the tag', () => {
    expect(cask).toContain('version "1.2.3"');
    expect(cask).not.toContain('version "v1.2.3"');
  });

  it('installs the launcher via the binary stanza', () => {
    // A cask, not a formula: the bundle is prebuilt with a vendored runtime,
    // so there is nothing to compile.
    expect(cask).toMatch(/binary "squad-darwin-#\{arch\}\/squad"/);
  });

  it('tells users Copilot CLI is not bundled', () => {
    // Squad drives the copilot CLI and deliberately does not vendor it.
    expect(cask).toContain('copilot-cli');
  });

  it('fails loudly when an asset is missing rather than emitting an empty sha', () => {
    expect(() => renderHomebrewCask({ ...BASE, checksums: {} }))
      .toThrow(/No checksum for "squad-darwin-arm64.tar.gz"/);
  });

  it('uses separate, conflicting casks for preview and insider channels', () => {
    const preview = renderHomebrewCask({ ...BASE, version: 'v1.3.0-preview.2' });
    const insider = renderHomebrewCask({ ...BASE, version: 'v1.4.0-insider.7' });

    expect(preview).toContain('cask "squad-preview"');
    expect(preview).toContain('conflicts_with cask:');
    expect(preview).toContain('"squad-insider"');
    expect(insider).toContain('cask "squad-insider"');
    expect(insider).toContain('"squad-preview"');
  });
});

describe('renderWingetInstaller', () => {
  const installer = renderWingetInstaller(BASE);

  it('targets squad.exe, never squad.cmd', () => {
    // winget's portable installer only symlinks .exe targets; pointing it at a
    // .cmd would install something that cannot be invoked.
    expect(installer).toContain('squad-win32-x64\\squad.exe');
    expect(installer).toContain('squad-win32-arm64\\squad.exe');
    expect(installer).not.toContain('.cmd');
    expect(installer).not.toContain('.ps1');
  });

  it('declares the zip + portable pairing winget requires', () => {
    expect(installer).toContain('InstallerType: zip');
    expect(installer).toContain('NestedInstallerType: portable');
  });

  it('uppercases checksums as winget-pkgs expects', () => {
    expect(installer).toContain(SHA.winX64.toUpperCase());
    expect(installer).not.toContain(SHA.winX64);
  });

  it('covers both Windows architectures', () => {
    expect(installer).toContain('Architecture: x64');
    expect(installer).toContain('Architecture: arm64');
  });

  it('keeps the tag in URLs but the bare version in PackageVersion', () => {
    expect(installer).toContain('PackageVersion: 1.2.3');
    expect(installer).toContain('/releases/download/v1.2.3/');
  });

  it('fails loudly when a Windows asset is missing', () => {
    expect(() => renderWingetInstaller({ ...BASE, checksums: {} }))
      .toThrow(/No checksum for "squad-win32-x64.zip"/);
  });
});

describe('winget version and locale manifests', () => {
  it('agree on identifier and version with the installer manifest', () => {
    // winget-pkgs rejects a version directory whose three manifests disagree.
    const all = [
      renderWingetVersion(BASE),
      renderWingetInstaller(BASE),
      renderWingetLocale(BASE),
    ];
    for (const manifest of all) {
      expect(manifest).toContain('PackageIdentifier: bradygaster.Squad');
      expect(manifest).toContain('PackageVersion: 1.2.3');
      expect(manifest).toContain('ManifestVersion: 1.12.0');
    }
  });

  it('declares the manifest types winget expects', () => {
    expect(renderWingetVersion(BASE)).toContain('ManifestType: version');
    expect(renderWingetInstaller(BASE)).toContain('ManifestType: installer');
    expect(renderWingetLocale(BASE)).toContain('ManifestType: defaultLocale');
  });

  it('points the locale manifest at the release notes for the same tag', () => {
    expect(renderWingetLocale(BASE)).toContain('/releases/tag/v1.2.3');
  });

  it('uses separate package identifiers for preview and insider channels', () => {
    const preview = { ...BASE, version: 'v1.3.0-preview.2' };
    const insider = { ...BASE, version: 'v1.4.0-insider.7' };

    for (const render of [renderWingetVersion, renderWingetInstaller, renderWingetLocale]) {
      expect(render(preview)).toContain('PackageIdentifier: bradygaster.Squad.Preview');
      expect(render(insider)).toContain('PackageIdentifier: bradygaster.Squad.Insider');
    }
  });
});

describe('release channel metadata', () => {
  it('maps supported versions to package-manager channel names', () => {
    expect(releaseChannel('v1.2.3')).toBe('stable');
    expect(releaseChannel('1.3.0-preview.2')).toBe('preview');
    expect(releaseChannel('v1.4.0-insider.7')).toBe('insider');
    expect(homebrewToken('v1.3.0-preview.2')).toBe('squad-preview');
    expect(wingetPackageIdentifier('v1.4.0-insider.7')).toBe(
      'bradygaster.Squad.Insider',
    );
  });

  it('rejects unsupported prerelease identifiers', () => {
    expect(() => releaseChannel('v1.2.3-beta.1')).toThrow(/Unsupported release version/);
  });
});
