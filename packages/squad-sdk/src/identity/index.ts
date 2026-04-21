/**
 * Identity Module — Public API
 *
 * GitHub App-based agent identity: role slug resolution,
 * credential storage, and comment/commit attribution formatting.
 *
 * @module identity
 */

export type {
  IdentityTier,
  RoleSlug,
  AppRegistration,
  IdentityConfig,
  CommentInput,
  CommitMessageInput,
} from './types.js';
export { ALL_ROLES } from './types.js';

export { resolveRoleSlug } from './role-slugs.js';

export {
  loadIdentityConfig,
  saveIdentityConfig,
  loadAppRegistration,
  saveAppRegistration,
  hasPrivateKey,
} from './storage.js';

export {
  formatComment,
  formatCommitMessage,
} from './formatting.js';

export {
  generateAppJWT,
  getInstallationToken,
  resolveToken,
  resolveTokenWithDiagnostics,
  clearTokenCache,
  peekTokenCache,
  getInstallationPermissions,
  GitHubApiError,
  RetryExhaustedError,
} from './tokens.js';
export type { TokenResolveError, TokenResolveResult, RetryPolicy } from './tokens.js';

export {
  execWithRoleToken,
  withRoleToken,
} from './exec.js';
export type { ExecResult } from './exec.js';
