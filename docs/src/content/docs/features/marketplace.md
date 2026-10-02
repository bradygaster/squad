# Marketplace Guide

**Issue:** #39 (M5-16)

---

## Overview

The Squad marketplace lets teams export, import, browse, and install agent configurations. This guide covers the full lifecycle: packaging, publishing, discovery, installation, versioning, caching, and security.

## Export / Import

Export your Squad configuration as a portable bundle:

```typescript
import { exportSquadConfig, importSquadConfig } from '@squad/sdk';

// Export
const bundle = await exportSquadConfig(config, {
  includeHistory: false,
  anonymize: true,
  format: 'json',
});

// Import into another project
const result = await importSquadConfig(bundle, targetDir, {
  merge: true,
  dryRun: false,
});
console.log(`Applied ${result.changes.length} changes`);
```

`ExportBundle` contains config, agents, skills, routing rules, and metadata. `splitHistory()` separates shareable history from private data. `detectConflicts()` identifies merge conflicts; `resolveConflicts()` applies resolution strategies (`keep-existing`, `use-incoming`, `merge`, `manual`).

## Agent Repositories

Pin agents to specific versions for reproducible teams:

```typescript
import { pinAgentVersion, getAgentVersion, configureAgentRepo } from '@squad/sdk';

await pinAgentVersion({ agentId: 'backend', sha: 'abc123', source: 'github' });
const pin = await getAgentVersion('backend');
// { agentId: 'backend', sha: 'abc123', timestamp: ..., source: 'github' }
```

`configureAgentRepo()` validates GitHub repository config. `AgentRepoOperations` provides push/pull for agent definitions.

## Versioning & Caching

`AgentCache` provides TTL-based caching for remote agent definitions:

- Agent definitions: 1-hour TTL (`DEFAULT_AGENT_TTL`)
- Skills: 5-minute TTL (`DEFAULT_SKILL_TTL`)
- `CacheStats` tracks hits, misses, evictions, and size

`parseSemVer()` and `compareSemVer()` handle version comparison. `bumpVersion()` supports major/minor/patch/prerelease increments.

## Security

7 security rules (`SECURITY_RULES`) validate remote agents before installation:

```typescript
import { validateRemoteAgent, generateSecurityReport } from '@squad/sdk';

const report = await validateRemoteAgent(agentDefinition);
if (report.blocked.length > 0) {
  console.error('Agent blocked:', report.blocked);
  const sanitized = quarantineAgent(agentDefinition);
}
```

`SecurityReport` includes pass/fail per rule, warnings, blocked items, and a `riskScore`. `quarantineAgent()` strips injection attempts and caps tool permissions. Rules check for: prompt injection, excessive permissions, suspicious tool patterns, and more.

## Marketplace Browse & Install

`MarketplaceBrowser` provides CLI-based discovery:

```typescript
import { MarketplaceBrowser } from '@squad/sdk';

const browser = new MarketplaceBrowser(fetcher);
const results = await browser.search({
  text: 'backend API',
  category: 'Development',
  sort: 'downloads',
});

// Install an entry
const installResult = await browser.install(results.entries[0], targetDir);
```

`formatEntryList()` and `formatEntryDetails()` render entries for terminal output. `MarketplaceBackend` provides the reference API. `packageForMarketplace()` bundles a project for publishing; `validatePackageContents()` checks the package before upload.

## Extensions

`ExtensionAdapter` bridges Squad to the Copilot Extensions API. `toExtensionConfig()` converts Squad config to extension format. `registerExtension()` handles marketplace registration.
