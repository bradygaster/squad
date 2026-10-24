import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { verifyPublishEvidence } from '../scripts/release/verify-publish-evidence.mjs';

const VERSION = '2.0.0-preview.1';

describe('verified publish evidence handoff', () => {
  it('records release, evidence, and workflow identities and fails closed on a tarball hash mismatch', () => {
    const cache = path.resolve(__dirname, '..', 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const root = mkdtempSync(path.join(cache, 'verify-publish-evidence-'));
    const evidenceDir = path.join(root, 'evidence');
    const publishDir = path.join(root, 'publish');
    mkdirSync(evidenceDir);
    mkdirSync(publishDir);
    const packages: Record<string, Record<string, unknown>> = {};
    for (const [name, filename, bytes] of [
      ['@bradygaster/squad-sdk', 'sdk.tgz', Buffer.from('sdk')],
      ['@bradygaster/squad-cli', 'cli.tgz', Buffer.from('cli')],
    ] as const) {
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      writeFileSync(path.join(evidenceDir, filename), bytes);
      writeFileSync(path.join(evidenceDir, `${filename}.sha256`), `${sha256}  ${filename}\n`);
      packages[name] = {
        filename,
        bytes: bytes.length,
        sha256,
        integrity: `sha512-${name}`,
        shasum: `sha1-${name}`,
        files: [],
        manifest: {
          version: VERSION,
          ...(name.endsWith('squad-cli') ? { sdkDependency: VERSION } : {}),
        },
        privacy: { denyPatterns: ['email-upn'], hits: [] },
      };
    }
    writeFileSync(path.join(evidenceDir, 'pack-evidence.json'), `${JSON.stringify({ ok: true, packages }, null, 2)}\n`);
    const args = {
      evidenceDir,
      publishDir,
      version: VERSION,
      sourceSha: '1'.repeat(40),
      tag: `v${VERSION}`,
      verifyRunId: '39996429914',
      evidenceArtifact: `release-evidence-${'1'.repeat(40)}`,
      recoverySha: '2'.repeat(40),
      workflowSha: '2'.repeat(40),
      dispatchSha: '2'.repeat(40),
    };
    try {
      verifyPublishEvidence(args);
      const identity = JSON.parse(readFileSync(path.join(publishDir, 'release-identity.json'), 'utf8'));
      expect(identity).toMatchObject({
        sourceSha: args.sourceSha,
        tag: args.tag,
        verifyRunId: args.verifyRunId,
        evidenceArtifact: args.evidenceArtifact,
        recoverySha: args.recoverySha,
        workflowSha: args.workflowSha,
        dispatchSha: args.dispatchSha,
      });

      expect(() => verifyPublishEvidence({ ...args, recoverySha: '' }))
        .toThrow(/recoverySha must be a full lowercase 40-hex SHA/);
      expect(() => verifyPublishEvidence({ ...args, recoverySha: '3'.repeat(40) }))
        .toThrow(/recoverySha must equal workflowSha and dispatchSha/);
      writeFileSync(path.join(evidenceDir, 'sdk.tgz'), 'tampered');
      expect(() => verifyPublishEvidence(args)).toThrow(/sha256 .* != evidence/);
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
