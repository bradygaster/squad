/**
 * Marketplace module — Copilot Extensions marketplace readiness
 * Issue #108 (M4-8)
 */

import type { SquadConfig } from '../config/schema.js';

// --- ManifestCategory enum ---

export enum ManifestCategory {
  Productivity = 'productivity',
  Development = 'development',
  Testing = 'testing',
  DevOps = 'devops',
  Documentation = 'documentation',
  Security = 'security',
  Other = 'other',
}

// --- MarketplaceManifest type ---

export interface MarketplaceManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string;
  categories: ManifestCategory[];
  tags: string[];
  icon: string;
  screenshots: string[];
  pricing: ManifestPricing;
}

export interface ManifestPricing {
  model: 'free' | 'paid' | 'freemium';
  trial?: boolean;
  url?: string;
}

// --- Validation ---

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateManifest(manifest: MarketplaceManifest): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('name is required and must be a string');
  } else if (!/^[a-z0-9-]+$/.test(manifest.name)) {
    errors.push('name must be lowercase alphanumeric with hyphens only');
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('version is required and must be a string');
  } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('version must follow semver (e.g. 1.0.0)');
  }

  if (!manifest.description || typeof manifest.description !== 'string') {
    errors.push('description is required and must be a string');
  } else if (manifest.description.length < 10) {
    warnings.push('description should be at least 10 characters for marketplace visibility');
  }

  if (!manifest.author || typeof manifest.author !== 'string') {
    errors.push('author is required and must be a string');
  }

  if (!manifest.repository || typeof manifest.repository !== 'string') {
    errors.push('repository is required and must be a string');
  }

  if (!Array.isArray(manifest.categories) || manifest.categories.length === 0) {
    errors.push('at least one category is required');
  } else {
    const validCategories = Object.values(ManifestCategory);
    for (const cat of manifest.categories) {
      if (!validCategories.includes(cat)) {
        errors.push(`invalid category: ${cat}`);
      }
    }
  }

  if (!Array.isArray(manifest.tags)) {
    errors.push('tags must be an array');
  } else if (manifest.tags.length === 0) {
    warnings.push('adding tags improves marketplace discoverability');
  }

  if (!manifest.icon || typeof manifest.icon !== 'string') {
    errors.push('icon is required and must be a string');
  }

  if (!Array.isArray(manifest.screenshots)) {
    errors.push('screenshots must be an array');
  } else if (manifest.screenshots.length === 0) {
    warnings.push('adding screenshots improves marketplace listing quality');
  }

  if (!manifest.pricing || typeof manifest.pricing !== 'object') {
    errors.push('pricing is required');
  } else if (!['free', 'paid', 'freemium'].includes(manifest.pricing.model)) {
    errors.push('pricing.model must be free, paid, or freemium');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// --- Generate manifest from SquadConfig ---

export function generateManifest(config: SquadConfig): MarketplaceManifest {
  return {
    name: slugify(config.team.name),
    version: config.version,
    description: config.team.description ?? `${config.team.name} — Squad-powered Copilot extension`,
    author: '',
    repository: '',
    categories: [ManifestCategory.Development],
    tags: config.agents.map((a) => a.role),
    icon: 'icon.png',
    screenshots: [],
    pricing: { model: 'free' },
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export { ExtensionAdapter, toExtensionConfig, fromExtensionEvent, registerExtension } from './extension-adapter.js';
export type { ExtensionEvent, ExtensionConfig, RegistrationResult } from './extension-adapter.js';
export { packageForMarketplace, validatePackageContents } from './packaging.js';
export type { PackageResult, MarketplacePackageValidationResult } from './packaging.js';
export { searchMarketplace, validateEntry, generateEntryFromConfig } from './schema.js';
export type {
  MarketplaceEntry,
  MarketplaceEntryStats,
  MarketplaceIndex,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
  MarketplaceSortField,
  EntryValidationResult,
} from './schema.js';
export { MarketplaceBrowser, formatEntryList, formatEntryDetails } from './browser.js';
export type { MarketplaceFetcher, InstallResult } from './browser.js';
export { MarketplaceBackend } from './backend.js';
export type { PublishResult, OperationResult } from './backend.js';
export { validateRemoteAgent, quarantineAgent, generateSecurityReport, SECURITY_RULES } from './security.js';
export type { RemoteAgentDefinition, SecurityReport, SecurityRule, SecuritySeverity } from './security.js';
export {
  PLUGIN_MANIFEST_FILENAMES,
  PLUGIN_MANIFEST_SCHEMA_VERSION,
  createPluginInstallPlan,
  derivePluginRoles,
  describePluginFile,
  parsePluginManifestContent,
  toPosixRelativePath,
  validatePluginManifest,
} from './plugin-manifest.js';
export type {
  PluginFileDeployment,
  PluginComponentKind,
  PluginFileType,
  PluginInstallPlan,
  PluginInstallPlanFile,
  PluginValidationResult,
  SquadPluginManifest,
} from './plugin-manifest.js';
export {
  INSTALLED_PLUGINS_FILE,
  PLUGIN_AUDIT_FILE,
  PLUGIN_LOCK_FILE,
  PLUGIN_RUNTIME_FILE,
  PLUGIN_STATE_DIR,
  appendAuditEvent,
  readPluginStates,
  removeInstalledPlugin,
  setPluginEnabled,
  sha256,
  switchActivePlugin,
  upsertInstalledPlugin,
  writePluginStates,
} from './plugin-state.js';
export type {
  InstalledPlugin,
  InstalledPluginFile,
  InstalledPluginsState,
  PluginAuditEvent,
  PluginAuditEventType,
  PluginAuditState,
  PluginLockEntry,
  PluginLockState,
  PluginRuntimeEntry,
  PluginRuntimeState,
  PluginStates,
} from './plugin-state.js';
