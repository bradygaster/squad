/**
 * Plugin marketplace commands — add/remove/list/browse
 * Port from beta index.js lines 716-833
 */

import { lstat, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  TIMEOUTS,
  FSStorageProvider,
  PLUGIN_MANIFEST_FILENAMES,
  appendAuditEvent,
  createPluginInstallPlan,
  describePluginFile,
  executeLifecycleHook,
  isLifecycleEventName,
  parsePluginManifestContent,
  readPluginStates,
  removeInstalledPlugin,
  setPluginEnabled,
  sha256,
  switchActivePlugin,
  upsertInstalledPlugin,
  validatePluginManifest,
  writePluginStates,
  type InstalledPluginFile,
  type PluginComponentKind,
  type PluginInstallPlanFile,
} from '@bradygaster/squad-sdk';
import { success, warn, info, dim, DIM, BOLD, RESET } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { effectiveSquadDir } from '../core/effective-squad-dir.js';
import { ghAvailable, ghAuthenticated } from '../core/gh-cli.js';

const execFileAsync = promisify(execFile);

// --- Types ---

export interface Marketplace {
  name: string;
  source: string;
  added_at: string;
}

export interface MarketplacesRegistry {
  marketplaces: Marketplace[];
}

// --- Main command handler ---

export async function runPlugin(dest: string, args: string[]): Promise<void> {
  const subCmd = args[0];
  const action = args[1];

  if (!subCmd) {
    fatal(pluginUsage());
  }

  const { local: squadDirInfo, stateDir } = effectiveSquadDir(dest);
  const storage = new FSStorageProvider();
  const pluginsDir = join(stateDir, 'plugins');
  const marketplacesFile = join(pluginsDir, 'marketplaces.json');

  async function readMarketplaces(): Promise<MarketplacesRegistry> {
    if (!storage.existsSync(marketplacesFile)) {
      return { marketplaces: [] };
    }
    try {
      const content = await storage.read(marketplacesFile);
      if (!content) return { marketplaces: [] };
      return JSON.parse(content);
    } catch {
      return { marketplaces: [] };
    }
  }

  async function writeMarketplaces(data: MarketplacesRegistry): Promise<void> {
    await storage.mkdir(pluginsDir, { recursive: true });
    await storage.write(marketplacesFile, JSON.stringify(data, null, 2) + '\n');
  }

  if (subCmd !== 'marketplace') {
    await runPluginLifecycle(dest, squadDirInfo.path, args);
    return;
  }

  if (!action) {
    fatal('Usage: squad plugin marketplace add|remove|list|browse');
  }

  // --- Add marketplace ---
  if (action === 'add') {
    const source = args[2];
    if (!source || !source.includes('/')) {
      fatal('Usage: squad plugin marketplace add <owner/repo>');
    }

    const data = await readMarketplaces();
    const name = source.split('/').pop()!;

    if (data.marketplaces.some(m => m.source === source)) {
      info(`${DIM}${source} is already registered${RESET}`);
      return;
    }

    data.marketplaces.push({
      name,
      source,
      added_at: new Date().toISOString()
    });

    await writeMarketplaces(data);
    success(`Registered marketplace: ${BOLD}${name}${RESET} (${source})`);
    return;
  }

  // --- Remove marketplace ---
  if (action === 'remove') {
    const name = args[2];
    if (!name) {
      fatal('Usage: squad plugin marketplace remove <name>');
    }

    const data = await readMarketplaces();
    const before = data.marketplaces.length;
    data.marketplaces = data.marketplaces.filter(m => m.name !== name);

    if (data.marketplaces.length === before) {
      fatal(`Marketplace "${name}" not found`);
    }

    await writeMarketplaces(data);
    success(`Removed marketplace: ${BOLD}${name}${RESET}`);
    return;
  }

  // --- List marketplaces ---
  if (action === 'list') {
    const data = await readMarketplaces();

    if (data.marketplaces.length === 0) {
      info(`${DIM}No marketplaces registered${RESET}`);
      console.log(`\nAdd one with: ${BOLD}squad plugin marketplace add <owner/repo>${RESET}`);
      return;
    }

    console.log(`\n${BOLD}Registered marketplaces:${RESET}\n`);
    for (const m of data.marketplaces) {
      const date = m.added_at ? ` ${DIM}(added ${m.added_at.split('T')[0]})${RESET}` : '';
      console.log(`  ${BOLD}${m.name}${RESET}  →  ${m.source}${date}`);
    }
    console.log();
    return;
  }

  // --- Browse marketplace ---
  if (action === 'browse') {
    const name = args[2];
    if (!name) {
      fatal('Usage: squad plugin marketplace browse <name>');
    }

    const data = await readMarketplaces();
    const marketplace = data.marketplaces.find(m => m.name === name);

    if (!marketplace) {
      fatal(`Marketplace "${name}" not found. Run "squad plugin marketplace list" to see registered marketplaces.`);
    }

    // Check gh CLI availability
    if (!(await ghAvailable())) {
      fatal('GitHub CLI (gh) is required but not found. Install from https://cli.github.com/');
    }

    if (!(await ghAuthenticated())) {
      fatal('GitHub CLI is not authenticated. Run "gh auth login" first.');
    }

    // Browse the marketplace repo for plugins using gh CLI
    let entries: string[];
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['api', `repos/${marketplace.source}/contents`, '--jq', '[.[] | select(.type == "dir") | .name]'],
        { timeout: TIMEOUTS.PLUGIN_FETCH_MS }
      );
      entries = JSON.parse(stdout.trim());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fatal(`Could not browse ${marketplace.source} — ${message}`);
    }

    if (!entries || entries.length === 0) {
      info(`${DIM}No plugins found in ${marketplace.source}${RESET}`);
      return;
    }

    console.log(`\n${BOLD}Plugins in ${marketplace.name}${RESET} (${marketplace.source}):\n`);
    for (const entry of entries) {
      console.log(`  📦 ${entry}`);
    }
    console.log(`\n${DIM}${entries.length} plugin(s) available${RESET}\n`);
    return;
  }

  fatal(`Unknown action: ${action}. Usage: squad plugin marketplace add|remove|list|browse`);
}

async function runPluginLifecycle(dest: string, squadDir: string, args: string[]): Promise<void> {
  const action = args[0];
  await mkdir(squadDir, { recursive: true });
  await mkdir(join(squadDir, 'plugins'), { recursive: true });
  const stateStorage = new FSStorageProvider();

  if (action === 'validate' || action === 'dry-run') {
    const source = args[1];
    if (!source) {
      fatal(`Usage: squad plugin ${action} <local-plugin-dir>`);
    }
    const { manifest, validation, plan } = await loadLocalPlugin(dest, source, action === 'dry-run');
    if (!validation.valid) {
      fatal(`Invalid plugin manifest:\n  - ${validation.errors.join('\n  - ')}`);
    }
    success(`Plugin manifest is valid: ${bold(manifest.id)}@${manifest.version}`);
    printExternalMetadata(manifest);
    printProviderContracts(manifest);
    printCopilotDependencies(manifest.copilot);
    if (action === 'dry-run') {
      console.log(`\n${BOLD}Dry run deployment plan:${RESET}\n`);
      for (const file of plan.files) {
        console.log(`  ${describePluginFile(file)}`);
      }
      console.log(`\n${DIM}No files were written.${RESET}`);
    }
    if (validation.warnings.length > 0) {
      console.log(`\n${DIM}Warnings:${RESET}`);
      for (const warning of validation.warnings) {
        console.log(`  - ${warning}`);
      }
    }
    return;
  }

  if (action === 'install') {
    const source = args[1];
    if (!source) {
      fatal('Usage: squad plugin install <local-plugin-dir> [--dry-run]');
    }

    const dryRun = args.includes('--dry-run');
    const { pluginDir, manifest, manifestContent, validation, plan } = await loadLocalPlugin(dest, source, dryRun);
    if (!validation.valid) {
      fatal(`Invalid plugin manifest:\n  - ${validation.errors.join('\n  - ')}`);
    }

    const installedFiles = await collectInstallFiles(pluginDir, plan.files);

    if (dryRun) {
      success(`Plugin manifest is valid: ${bold(manifest.id)}@${manifest.version}`);
      printExternalMetadata(manifest);
      printProviderContracts(manifest);
      printCopilotDependencies(manifest.copilot);
      console.log(`\n${BOLD}Dry run deployment plan:${RESET}\n`);
      for (const file of plan.files) {
        console.log(`  ${describePluginFile(file)}`);
      }
      if (validation.warnings.length > 0) {
        console.log(`\n${DIM}Warnings:${RESET}`);
        for (const warning of validation.warnings) {
          console.log(`  - ${warning}`);
        }
      }
      return;
    }

    const previousStates = await readPluginStates(stateStorage, squadDir);
    const states = cloneStates(previousStates);
    const copiedTargets: string[] = [];
    try {
      for (const file of plan.files) {
        const sourcePath = safeJoin(pluginDir, file.source);
        const targetPath = safeJoin(squadDir, file.target);
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, await readFile(sourcePath));
        copiedTargets.push(targetPath);
      }

      upsertInstalledPlugin(states, manifest, {
        source: pluginDir,
        manifestContent,
        files: installedFiles,
      });
      await writePluginStates(stateStorage, states, squadDir);
    } catch (err: unknown) {
      await Promise.all(copiedTargets.map((target) => rm(target, { force: true })));
      await writePluginStates(stateStorage, previousStates, squadDir);
      const message = err instanceof Error ? err.message : String(err);
      fatal(`Install failed and was rolled back: ${message}`);
    }
    success(`Installed plugin ${bold(manifest.id)}@${manifest.version} (disabled)`);
    printExternalMetadata(manifest);
    printProviderContracts(manifest);
    printCopilotDependencies(manifest.copilot);
    return;
  }

  if (action === 'list-json' || (action === 'list' && args.includes('--json'))) {
    const states = await readPluginStates(stateStorage, squadDir);
    console.log(JSON.stringify({
      plugins: states.installed.plugins,
      active: states.runtime.active,
    }, null, 2));
    return;
  }

  if (action === 'list') {
    const states = await readPluginStates(stateStorage, squadDir);
    if (states.installed.plugins.length === 0) {
      info(`${DIM}No plugins installed${RESET}`);
      return;
    }

    console.log(`\n${BOLD}Installed plugins:${RESET}\n`);
    for (const plugin of states.installed.plugins) {
      const status = plugin.enabled ? 'enabled' : 'disabled';
      const roles = plugin.roles.length > 0 ? ` roles=${plugin.roles.join(',')}` : '';
      const copilotDependencies = plugin.copilot?.requires?.length
        ? ` copilot=${plugin.copilot.requires.length}`
        : '';
      const upstream = plugin.upstream?.package ? ` upstream=${plugin.upstream.package}` : '';
      const mcp = plugin.mcp?.available ? ' mcp=available' : '';
      const providers = plugin.providers?.length ? ` providers=${plugin.providers.length}` : '';
      console.log(`  ${BOLD}${plugin.id}${RESET}@${plugin.version}  ${DIM}${status}${RESET}${roles}${copilotDependencies}${upstream}${mcp}${providers}`);
    }
    console.log();
    return;
  }

  if (action === 'enable' || action === 'disable') {
    const pluginId = args[1];
    if (!pluginId) {
      fatal(`Usage: squad plugin ${action} <plugin-id>`);
    }
    const states = await readPluginStates(stateStorage, squadDir);
    const plugin = setPluginEnabled(states, pluginId, action === 'enable');
    await writePluginStates(stateStorage, states, squadDir);
    success(`${action === 'enable' ? 'Enabled' : 'Disabled'} plugin ${bold(plugin.id)}`);
    return;
  }

  if (action === 'switch') {
    const role = args[1] as PluginComponentKind | undefined;
    const pluginId = args[2];
    if (!role || !pluginId) {
      fatal('Usage: squad plugin switch <role> <plugin-id>');
    }
    const states = await readPluginStates(stateStorage, squadDir);
    const plugin = switchActivePlugin(states, role, pluginId);
    await writePluginStates(stateStorage, states, squadDir);
    success(`Switched ${bold(role)} to plugin ${bold(plugin.id)}`);
    return;
  }

  if (action === 'uninstall') {
    const pluginId = args[1];
    if (!pluginId) {
      fatal('Usage: squad plugin uninstall <plugin-id>');
    }
    const states = await readPluginStates(stateStorage, squadDir);
    const plugin = removeInstalledPlugin(states, pluginId);
    for (const file of plugin.files) {
      await rm(safeJoin(squadDir, file.target), { force: true });
    }
    await writePluginStates(stateStorage, states, squadDir);
    success(`Uninstalled plugin ${bold(plugin.id)}`);
    return;
  }

  if (action === 'verify' || action === 'health') {
    const states = await readPluginStates(stateStorage, squadDir);
    const errors: string[] = [];
    for (const plugin of states.installed.plugins) {
      for (const file of plugin.files) {
        const targetPath = safeJoin(squadDir, file.target);
        const content = await readOptionalBuffer(targetPath);
        if (content === undefined) {
          errors.push(`${plugin.id}: missing ${file.target}`);
          continue;
        }
        const actual = sha256(content);
        if (actual !== file.sha256) {
          errors.push(`${plugin.id}: checksum mismatch for ${file.target}`);
        }
      }
    }

    const now = new Date().toISOString();
    for (const plugin of states.installed.plugins) {
      appendAuditEvent(states.audit, {
        type: 'verify',
        plugin_id: plugin.id,
        version: plugin.version,
        timestamp: now,
        message: errors.length === 0 ? `Verified ${plugin.id}` : `Verification checked ${plugin.id}`,
      });
    }
    await writePluginStates(stateStorage, states, squadDir);

    if (errors.length > 0) {
      fatal(`Plugin verification failed:\n  - ${errors.join('\n  - ')}`);
    }
    success(`Plugin health check passed (${states.installed.plugins.length} installed)`);
    return;
  }

  if (action === 'refresh' || action === 'run-lifecycle') {
    const pluginId = args[1];
    const lifecycleEvent = action === 'refresh' ? 'onMemoryRefresh' : args[2];

    if (!pluginId) {
      fatal(`Usage: squad plugin ${action} <plugin-id>${action === 'run-lifecycle' ? ' <lifecycle-event>' : ''}`);
    }

    if (action === 'run-lifecycle' && !lifecycleEvent) {
      fatal('Usage: squad plugin run-lifecycle <plugin-id> <lifecycle-event>');
    }

    const states = await readPluginStates(stateStorage, squadDir);
    const plugin = states.installed.plugins.find((p) => p.id === pluginId);

    if (!plugin) {
      fatal(`Plugin "${pluginId}" is not installed`);
    }

    if (!plugin.enabled) {
      fatal(`Plugin "${pluginId}" is disabled. Enable it first with: squad plugin enable ${pluginId}`);
    }

    const runtime = plugin.runtime;
    if (!runtime?.capabilities || runtime.capabilities.length === 0) {
      fatal(`Plugin "${pluginId}" has no runtime capabilities`);
    }

    let lifecycle = 'onMemoryRefresh';
    if (action === 'run-lifecycle') {
      if (!lifecycleEvent) {
        fatal('Usage: squad plugin run-lifecycle <plugin-id> <lifecycle-event>');
      }
      lifecycle = lifecycleEvent;
    }
    if (!isLifecycleEventName(lifecycle)) {
      fatal(`Unsupported lifecycle event "${lifecycle}". Allowed events: onInstall, onEnable, onDisable, onBeforeSpawn, onAfterTask, onMemoryRefresh`);
    }

    console.log(`${DIM}Executing ${lifecycle} lifecycle for ${plugin.id}...${RESET}`);
    const results = await executeLifecycleHook(
      plugin.id,
      plugin.version,
      lifecycle,
      runtime.capabilities,
      stateStorage,
      squadDir,
      states.audit
    );

    await writePluginStates(stateStorage, states, squadDir);

    if (results.length === 0) {
      info(`${DIM}No runtime operations executed for lifecycle ${lifecycle}${RESET}`);
      return;
    }

    for (const result of results) {
      if (result.success) {
        success(result.message);
        if (result.artifactsGenerated.length > 0) {
          console.log(`${DIM}Generated artifacts:${RESET}`);
          for (const artifact of result.artifactsGenerated) {
            console.log(`  - ${artifact}`);
          }
        }
      } else {
        warn(`${result.message}${result.error ? `: ${result.error}` : ''}`);
      }
    }
    return;
  }

  fatal(pluginUsage());
}

async function findManifestFile(pluginDir: string): Promise<string | undefined> {
  for (const fileName of PLUGIN_MANIFEST_FILENAMES) {
    const candidate = join(pluginDir, fileName);
    const found = await readOptionalFile(candidate);
    if (found !== undefined) {
      return candidate;
    }
  }
  return undefined;
}

async function loadLocalPlugin(dest: string, source: string, dryRun: boolean): Promise<{
  pluginDir: string;
  manifestContent: string;
  manifest: ReturnType<typeof parsePluginManifestContent>;
  validation: ReturnType<typeof validatePluginManifest>;
  plan: ReturnType<typeof createPluginInstallPlan>;
}> {
  const pluginDir = resolve(dest, source);
  await assertDirectory(pluginDir, 'Plugin source');
  const manifestFile = await findManifestFile(pluginDir);
  if (!manifestFile) {
    fatal(`No plugin manifest found. Expected one of: ${PLUGIN_MANIFEST_FILENAMES.join(', ')}`);
  }
  const manifestContent = await readFile(manifestFile, 'utf8');
  const manifest = parsePluginManifestContent(manifestContent, manifestFile);
  const validation = validatePluginManifest(manifest);
  const plan = validation.valid
    ? createPluginInstallPlan(manifest, { dryRun })
    : { manifest, files: [], dryRun };
  return { pluginDir, manifestContent, manifest, validation, plan };
}

async function collectInstallFiles(
  pluginDir: string,
  files: PluginInstallPlanFile[],
): Promise<InstalledPluginFile[]> {
  const installedFiles: InstalledPluginFile[] = [];
  for (const file of files) {
    const sourcePath = safeJoin(pluginDir, file.source);
    const stats = await lstat(sourcePath);
    if (stats.isSymbolicLink()) {
      fatal(`Plugin source file may not be a symlink: ${file.source}`);
    }
    if (!stats.isFile()) {
      fatal(`Plugin source must be a file: ${file.source}`);
    }
    const content = await readFile(sourcePath);
    installedFiles.push({
      ...file,
      sha256: sha256(content),
    });
  }
  return installedFiles;
}

function cloneStates<T>(states: T): T {
  return JSON.parse(JSON.stringify(states)) as T;
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

async function readOptionalBuffer(filePath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(filePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

async function assertDirectory(dirPath: string, label: string): Promise<void> {
  let stats;
  try {
    stats = await stat(dirPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      fatal(`${label} does not exist: ${dirPath}`);
    }
    throw err;
  }
  if (!stats.isDirectory()) {
    fatal(`${label} must be a directory: ${dirPath}`);
  }
}

function safeJoin(root: string, relativePath: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`Path escapes root: ${relativePath}`);
  }
  return resolvedPath;
}

function pluginUsage(): string {
  return 'Usage: squad plugin marketplace add|remove|list|browse OR squad plugin validate|dry-run|install|uninstall|enable|disable|switch|list|verify|refresh|run-lifecycle';
}

function printCopilotDependencies(copilot: ReturnType<typeof parsePluginManifestContent>['copilot']): void {
  const dependencies = copilot?.requires ?? [];
  if (dependencies.length === 0) {
    return;
  }

  console.log(`\n${BOLD}Copilot plugin dependencies:${RESET}`);
  for (const dependency of dependencies) {
    const optional = dependency.optional ? 'optional' : 'required';
    const version = dependency.version ? ` ${dependency.version}` : '';
    const reason = dependency.reason ? ` — ${dependency.reason}` : '';
    console.log(`  - ${dependency.id}${version} ${DIM}(${optional})${RESET}${reason}`);
  }
  console.log(`${DIM}Squad records these dependencies but does not install or run Copilot plugin commands.${RESET}`);
}

function printExternalMetadata(manifest: ReturnType<typeof parsePluginManifestContent>): void {
  if (!manifest.repository && !manifest.upstream && !manifest.mcp) {
    return;
  }

  console.log(`\n${BOLD}External integration metadata:${RESET}`);
  if (manifest.repository) {
    console.log(`  - repository: ${manifest.repository.url}`);
  }
  if (manifest.upstream) {
    const packageName = manifest.upstream.package ? ` ${manifest.upstream.package}` : '';
    const registry = manifest.upstream.registry ? ` (${manifest.upstream.registry})` : '';
    console.log(`  - upstream:${packageName}${registry}`);
    if (manifest.upstream.installCommand) {
      console.log(`    install hint: ${manifest.upstream.installCommand}`);
    }
  }
  if (manifest.mcp) {
    const available = manifest.mcp.available ? 'available' : 'not declared available';
    const server = manifest.mcp.server ? ` server=${manifest.mcp.server}` : '';
    const entryPoint = manifest.mcp.entryPoint ? ` entry=${manifest.mcp.entryPoint}` : '';
    console.log(`  - MCP: ${available}${server}${entryPoint}`);
    if (manifest.mcp.installCommand) {
      console.log(`    install hint: ${manifest.mcp.installCommand}`);
    }
  }
  console.log(`${DIM}Squad records this metadata but does not install packages, start MCP servers, or run external commands.${RESET}`);
}

function printProviderContracts(manifest: ReturnType<typeof parsePluginManifestContent>): void {
  const providers = manifest.providers ?? [];
  if (providers.length === 0) {
    return;
  }

  console.log(`\n${BOLD}Provider contracts:${RESET}`);
  for (const provider of providers) {
    const mode = provider.mode ? ` mode=${provider.mode}` : '';
    const protocol = provider.protocol ? ` protocol=${provider.protocol}` : '';
    const artifact = provider.artifact ? ` artifact=.squad/${provider.artifact}` : '';
    const capabilities = provider.capabilities?.length ? ` capabilities=${provider.capabilities.join(',')}` : '';
    console.log(`  - ${provider.id}: type=${provider.type}${mode}${protocol}${artifact}${capabilities}`);
    if (provider.mcp) {
      const server = provider.mcp.server ? ` server=${provider.mcp.server}` : '';
      const tool = provider.mcp.tool ? ` tool=${provider.mcp.tool}` : '';
      const capability = provider.mcp.capability ? ` capability=${provider.mcp.capability}` : '';
      console.log(`    MCP binding:${server}${tool}${capability} ${DIM}(metadata only)${RESET}`);
    }
  }
  console.log(`${DIM}Squad records provider contracts but does not start MCP servers, call provider tools, or query live provider backends.${RESET}`);
}

function bold(value: string): string {
  return `${BOLD}${value}${RESET}`;
}
