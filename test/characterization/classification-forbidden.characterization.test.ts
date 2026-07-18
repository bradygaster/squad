/**
 * Characterization tests for classification and forbidden-content governance.
 *
 * Covers:
 *   Gap C1 - one row per FORBIDDEN_PATTERNS entry, positive rejection plus
 *            negative near-miss, with audit safety pinned exactly.
 *   Gap C2 - one canonical + one ambiguous sample per non-forbidden auto-class.
 *
 * All inputs are hand-authored synthetic strings, safe for a public repo.
 * No real secrets, no real PII, no real customer data. If any row is observed
 * to leak raw synthetic input into the audit record (contradicting the current
 * safe-by-default design), that row must be marked `it.todo` with a
 * "SECURITY REGRESSION CANDIDATE" comment and escalated in the PR body; the
 * production source is not edited by this PR.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { FSStorageProvider } from '../../packages/squad-sdk/src/storage/fs-storage-provider.js';
import { LocalMemoryStore } from '../../packages/squad-sdk/src/memory/index.js';

import { makeWriteGuardedStorage, withHermeticRoot } from './_helpers/hermetic-root.js';

const REJECTION_REASON_PREFIX = 'Rejected as forbidden memory: ';
const SAFE_AUDIT_TITLE = 'Rejected governed memory';

async function readJsonl(file: string): Promise<Array<Record<string, unknown>>> {
  const raw = await fs.readFile(file, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

interface ForbiddenRow {
  label: string;
  reasonSuffix: string;
  positive: string;
  negative: string;
}

// One row per pattern in FORBIDDEN_PATTERNS (12 total). The `reasonSuffix` is
// the exact string appended to the pattern's rejection reason by classify().
const FORBIDDEN_ROWS: ForbiddenRow[] = [
  {
    label: 'private key material',
    reasonSuffix: 'private key material',
    positive: '-----BEGIN RSA PRIVATE KEY-----\nsynthetic body\n-----END RSA PRIVATE KEY-----',
    negative: 'Discussion about key rotation policy for private keys next quarter',
  },
  {
    label: 'access token',
    reasonSuffix: 'access token',
    positive: 'Token used in the test fixture: ghp_ABCDEFGHIJKLMNOPQR12',
    negative: 'Rotate tokens quarterly across all repos',
  },
  {
    label: 'credential-like assignment',
    reasonSuffix: 'credential-like assignment',
    positive: 'password: hunter2extra',
    negative: 'We rotate passwords quarterly',
  },
  {
    label: 'connection string secret',
    reasonSuffix: 'connection string secret',
    positive: 'AccountKey=syntheticFixtureValue123',
    negative: 'Rotating the storage account key annually',
  },
  {
    label: 'PII-like identifier',
    reasonSuffix: 'PII-like identifier',
    positive: 'Reference 123-45-6789 in the synthetic fixture',
    negative: 'Order 12345-6789 shipped on schedule',
  },
  {
    label: 'internal network topology',
    reasonSuffix: 'internal network topology',
    positive: 'Test server reachable at 192.168.1.5',
    negative: 'Public resolver at 8.8.8.8 works fine',
  },
  {
    label: 'raw diagnostic payload',
    reasonSuffix: 'raw diagnostic payload',
    positive: 'Attached raw logs from the failing job',
    negative: 'Log rotation runs nightly',
  },
  {
    label: 'transient CI/PR status',
    reasonSuffix: 'transient CI/PR status',
    positive: 'CI failed on the main branch',
    negative: 'CI hygiene review scheduled',
  },
  {
    label: 'private customer data',
    reasonSuffix: 'private customer data',
    positive: 'Do not share private customer data externally',
    negative: 'Customer feedback survey shows a positive trend',
  },
  {
    label: 'private customer data (alt)',
    reasonSuffix: 'private customer data',
    positive: 'Customer PII must be masked in exports',
    negative: 'Customer engagement metrics rose',
  },
  {
    label: 'unreviewed vulnerability disclosure',
    reasonSuffix: 'unreviewed vulnerability disclosure',
    positive: 'Filed unreviewed vulnerabilities in the tracker',
    negative: 'Vulnerability review process runs weekly',
  },
  {
    label: 'zero-day disclosure',
    reasonSuffix: 'unreviewed vulnerability disclosure',
    positive: 'Suspected zero-day in library X',
    negative: 'Daytime standups happen at ten',
  },
];

describe('classification and forbidden-content characterization (C1)', () => {
  it.each(FORBIDDEN_ROWS)(
    'rejects and audits safely for pattern: $label',
    async (row) => {
      await withHermeticRoot(async (root) => {
        const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
        const store = new LocalMemoryStore(storage, root);

        const result = await store.write({
          content: row.positive,
          title: 'do not care',
          author: 'characterization-suite',
        });

        expect(result.stored).toBe(false);
        expect(result.classification.class).toBe('FORBIDDEN');
        expect(result.classification.allowed).toBe(false);
        expect(result.classification.reason).toBe(REJECTION_REASON_PREFIX + row.reasonSuffix);

        const auditPath = path.join(root, '.squad', 'memory', 'audit.jsonl');
        const auditRecords = await readJsonl(auditPath);
        const rejectRecords = auditRecords.filter((r) => r.action === 'reject');
        expect(rejectRecords).toHaveLength(1);
        const record = rejectRecords[0];

        // Pin current safe-by-default behavior exactly. Any regression that
        // starts leaking raw content into `title` or `reason` will fail here.
        expect(record.title).toBe(SAFE_AUDIT_TITLE);
        expect(record.reason).toBe(REJECTION_REASON_PREFIX + row.reasonSuffix);
        expect(record.class).toBe('FORBIDDEN');
      });
    },
  );

  it.each(FORBIDDEN_ROWS)(
    'accepts the near-miss negative for pattern: $label',
    async (row) => {
      await withHermeticRoot(async (root) => {
        const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
        const store = new LocalMemoryStore(storage, root);

        const classification = await store.classify({ content: row.negative });
        expect(classification.class).not.toBe('FORBIDDEN');
      });
    },
  );
});

interface ClassifyRow {
  label: string;
  canonical: { content: string; expected: string };
  ambiguous: { content: string; expected: string };
}

// One canonical + one ambiguous input per non-forbidden auto-class. Ambiguous
// expectations are inline snapshots of current behavior; comments note that
// #1309 may revisit these boundaries. This PR does not encode target behavior.
const CLASSIFY_ROWS: ClassifyRow[] = [
  {
    label: 'TRANSIENT',
    canonical: { content: 'CI failed on the release branch', expected: 'TRANSIENT' },
    // "build velocity" contains no CI/PR/build+status pair, so falls through
    // to LOCAL under the current heuristic.
    ambiguous: { content: 'Interested in build velocity', expected: 'LOCAL' },
  },
  {
    label: 'POLICY',
    canonical: { content: 'Always run tests before merging', expected: 'POLICY' },
    // Leading "We" defeats the ^-anchored POLICY regex, so the sentence
    // falls through to DECISION via "decision" or LOCAL. Current behavior:
    // "must" is not at start-of-string so no POLICY match; content mentions
    // no decision/adopt/etc, so LOCAL. May be revisited by #1309.
    ambiguous: { content: 'We must document milestones weekly', expected: 'LOCAL' },
  },
  {
    label: 'DECISION',
    canonical: { content: 'Decided to adopt TypeScript strict mode', expected: 'DECISION' },
    // "decision-making" contains the token "decision" bounded by \b, so the
    // current heuristic classifies as DECISION. May be revisited by #1309.
    ambiguous: { content: 'The decision-making process is opaque', expected: 'DECISION' },
  },
  {
    label: 'COPILOT_MEMORY',
    canonical: { content: 'Persist this in copilot memory', expected: 'COPILOT_MEMORY' },
    // "semantic memory" phrase matches the COPILOT_MEMORY heuristic even
    // outside a first-person "persist" framing. May be revisited by #1309.
    ambiguous: { content: 'Semantic memory research is trending', expected: 'COPILOT_MEMORY' },
  },
  {
    label: 'LOCAL',
    canonical: { content: 'Refactored the parser module for clarity', expected: 'LOCAL' },
    // Short observational content with no trigger tokens falls through to LOCAL.
    ambiguous: { content: 'Testing edge cases in the workflow', expected: 'LOCAL' },
  },
];

describe('classify heuristic characterization (C2)', () => {
  it.each(CLASSIFY_ROWS)('canonical sample classifies as $label', async (row) => {
    await withHermeticRoot(async (root) => {
      const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
      const store = new LocalMemoryStore(storage, root);
      const classification = await store.classify({ content: row.canonical.content });
      expect(classification.class).toBe(row.canonical.expected);
    });
  });

  it.each(CLASSIFY_ROWS)('ambiguous sample near $label classifies to current class', async (row) => {
    await withHermeticRoot(async (root) => {
      const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
      const store = new LocalMemoryStore(storage, root);
      const classification = await store.classify({ content: row.ambiguous.content });
      // Current behavior; may be revisited by #1309.
      expect(classification.class).toBe(row.ambiguous.expected);
    });
  });
});
