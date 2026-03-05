/**
 * Workstream Types — Type definitions for Squad Workstreams.
 *
 * Workstreams enable horizontal scaling by allowing multiple Squad instances
 * (e.g., in different Codespaces) to each handle a scoped subset of work.
 *
 * @module streams/types
 */

/** Definition of a single workstream (team partition). */
export interface WorkstreamDefinition {
  /** Workstream name, e.g., "ui-team", "backend-team" */
  name: string;
  /** GitHub label to filter issues by, e.g., "team:ui" */
  labelFilter: string;
  /** Optional folder restrictions, e.g., ["apps/web"] */
  folderScope?: string[];
  /** Workflow mode. Default: branch-per-issue */
  workflow?: 'branch-per-issue' | 'direct';
  /** Human-readable description of this workstream's purpose */
  description?: string;
}

/** @deprecated Use WorkstreamDefinition instead */
export type StreamDefinition = WorkstreamDefinition;

/** Top-level workstreams configuration (stored in .squad/workstreams.json). */
export interface WorkstreamConfig {
  /** All configured workstreams */
  workstreams: WorkstreamDefinition[];
  /** Default workflow for workstreams that don't specify one */
  defaultWorkflow: 'branch-per-issue' | 'direct';
}

/** @deprecated Use WorkstreamConfig instead */
export type StreamConfig = WorkstreamConfig;

/** A resolved workstream with provenance information. */
export interface ResolvedWorkstream {
  /** Workstream name */
  name: string;
  /** Full workstream definition */
  definition: WorkstreamDefinition;
  /** How this workstream was resolved */
  source: 'env' | 'file' | 'config';
}

/** @deprecated Use ResolvedWorkstream instead */
export type ResolvedStream = ResolvedWorkstream;
