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

// The placeholder title `safeAuditTitle()` substitutes when a title is
// missing or is itself forbidden-shaped. It is NOT what gets recorded when
// the caller supplies a safe title (see the FORBIDDEN_ROWS test below, which
// always supplies the safe title 'do not care'). The missing-title path is
// already covered by test/memory-governance.test.ts
// ("uses a safe placeholder title for no-title rejected sensitive writes"),
// so it is intentionally not duplicated here.
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

        // Pin current behavior exactly: safeAuditTitle() preserves a caller
        // supplied title verbatim as long as the title itself does not match
        // a forbidden pattern, so the recorded title is the literal 'do not
        // care' string this suite always supplies, not the SAFE_AUDIT_TITLE
        // placeholder (that placeholder is only substituted when the title
        // is missing or is itself forbidden-shaped). Any regression that
        // starts leaking raw content into `reason` will still fail below.
        expect(record.title).toBe('do not care');
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
    // The TRANSIENT auto-classification heuristic
    // (/\b(CI|PR|build)\s+(status|failed|passed|output|log)\b/i) is shadowed
    // by an identical pattern in FORBIDDEN_PATTERNS (reason: "transient
    // CI/PR status"), which classify() checks first, unconditionally. Any
    // content that would trip the TRANSIENT heuristic trips the FORBIDDEN
    // check first, so this canonical sample classifies FORBIDDEN, not
    // TRANSIENT. The TRANSIENT heuristic branch is unreachable via
    // content-only input; see the dedicated
    // "TRANSIENT is reachable only via an explicit requestedClass override"
    // test below for the one real public path that does produce TRANSIENT.
    canonical: { content: 'CI failed on the release branch', expected: 'FORBIDDEN' },
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

  it('TRANSIENT is reachable only via an explicit requestedClass override', async () => {
    await withHermeticRoot(async (root) => {
      const storage = makeWriteGuardedStorage(new FSStorageProvider(), root);
      const store = new LocalMemoryStore(storage, root);
      // This content matches none of the FORBIDDEN_PATTERNS entries, so the
      // unconditional forbidden check at the top of classify() falls through
      // and the requestedClass override below is honored as-is. This is the
      // one real, currently-reachable public path to a TRANSIENT
      // classification; the content-matching heuristic for TRANSIENT is
      // otherwise unreachable, see the CLASSIFY_ROWS 'TRANSIENT' comment above.
      const classification = await store.classify({
        content: 'Quick scratch note for today',
        requestedClass: 'TRANSIENT',
      });
      expect(classification.class).toBe('TRANSIENT');
      expect(classification.allowed).toBe(false);
      expect(classification.reason).toBe('Transient task state is not persisted as durable memory');
    });
  });
});
