/**
 * State module — Squad state persistence abstraction.
 *
 * Provides the StateBackend interface and implementations:
 * - OrphanBranchBackend: State in a git orphan branch (immune to branch switches)
 * - FilesystemBackend: State on disk (current default, fallback)
 */

export type { StateBackend, StateBackendHealth } from './state-backend.js';
export { OrphanBranchBackend } from './orphan-branch-backend.js';
export { FilesystemBackend } from './filesystem-backend.js';
