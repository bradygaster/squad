/**
 * Workstream-Aware Issue Filtering
 *
 * Filters GitHub issues to only those matching a workstream's labelFilter.
 * Intended to scope work to the active workstream during triage.
 *
 * @module streams/filter
 */

import type { ResolvedWorkstream } from './types.js';

/** Minimal issue shape for filtering. */
export interface WorkstreamIssue {
  number: number;
  title: string;
  labels: Array<{ name: string }>;
}

/** @deprecated Use WorkstreamIssue instead */
export type StreamIssue = WorkstreamIssue;

/**
 * Filter issues to only those matching the workstream's label filter.
 *
 * Matching is case-insensitive. If the workstream has no labelFilter,
 * all issues are returned (passthrough).
 *
 * @param issues - Array of issues to filter
 * @param workstream - The resolved workstream to filter by
 * @returns Filtered array of issues matching the workstream's label
 */
export function filterIssuesByWorkstream(
  issues: WorkstreamIssue[],
  workstream: ResolvedWorkstream,
): WorkstreamIssue[] {
  const filter = workstream.definition.labelFilter;
  if (!filter) {
    return issues;
  }

  const normalizedFilter = filter.toLowerCase();
  return issues.filter(issue =>
    issue.labels.some(label => label.name.toLowerCase() === normalizedFilter),
  );
}

/** @deprecated Use filterIssuesByWorkstream instead */
export const filterIssuesByStream = filterIssuesByWorkstream;
