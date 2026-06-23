import {
  FSStorageProvider,
  LocalMemoryStore,
  type MemoryClass,
  type MemoryLoadGuidance,
} from '@bradygaster/squad-sdk';
import fs from 'node:fs';
import path from 'node:path';

const REAL_COPILOT_UNAVAILABLE_REASON =
  'Real Copilot Memory API unavailable: no concrete callable API was found in installed @github/copilot SDK/tooling. Squad will not fake provider=copilot; use hostInjectedCopilotAdapter only when a host supplies a client.';

type MemoryDiagnosticLevel = 'none' | 'error' | 'info' | 'debug';

type MemoryProviderConfig = {
  defaultProvider: 'local' | 'hostInjectedCopilotAdapter' | 'copilot';
  externalProviders: {
    hostInjectedCopilotAdapter: {
      enabled: boolean;
      requireApproval: boolean;
    };
  };
};

type MemoryProviderStatus = {
  defaultProvider: 'local' | 'hostInjectedCopilotAdapter' | 'copilot';
  realCopilotMemory: { available: false; configured: boolean; reason: string };
  hostInjectedCopilotAdapter: { enabled: boolean; requireApproval: boolean; clientAvailable: boolean; configured: boolean };
};

type SquadConfig = {
  memory?: {
    logLevel?: unknown;
  };
};

const MEMORY_DIAGNOSTIC_LEVELS: Record<MemoryDiagnosticLevel, number> = {
  none: 0,
  error: 1,
  info: 2,
  debug: 3,
};

function readFlag(args: string[], name: string): string | undefined {
  const equalsPrefix = `${name}=`;
  const equalsValue = args.find(arg => arg.startsWith(equalsPrefix));
  if (equalsValue) return equalsValue.slice(equalsPrefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function readContent(args: string[]): string {
  const content = readFlag(args, '--content');
  if (content) return content;
  return args.filter(arg => !arg.startsWith('--')).slice(1).join(' ');
}

function parseClass(value: string | undefined): MemoryClass | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  if (['TRANSIENT', 'LOCAL', 'DECISION', 'POLICY', 'COPILOT_MEMORY', 'FORBIDDEN'].includes(normalized)) {
    return normalized as MemoryClass;
  }
  throw new Error(`Unknown memory class: ${value}`);
}

function parseLoadGuidance(value: string | undefined): MemoryLoadGuidance | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/^\[|\]$/g, '').toUpperCase();
  if (['ALWAYS', 'ON-DEMAND', 'ARCHIVE', 'NEVER'].includes(normalized)) {
    return normalized as MemoryLoadGuidance;
  }
  throw new Error(`Unknown load guidance: ${value}`);
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (['true', '1', 'yes', 'on'].includes(value.toLowerCase())) return true;
  if (['false', '0', 'no', 'off'].includes(value.toLowerCase())) return false;
  throw new Error(`Expected boolean value, got: ${value}`);
}

function parseLogLevel(value: string | undefined): MemoryDiagnosticLevel {
  if (!value) return 'none';
  const normalized = value.toLowerCase();
  if (normalized === 'none' || normalized === 'silent' || normalized === 'off') return 'none';
  if (normalized === 'error') return 'error';
  if (normalized === 'info') return 'info';
  if (normalized === 'debug' || normalized === 'verbose' || normalized === 'all') return 'debug';
  throw new Error(`Unknown memory log level: ${value}. Expected none|error|info|debug.`);
}

function readConfiguredLogLevel(projectRoot: string): MemoryDiagnosticLevel | undefined {
  const configPath = path.join(projectRoot, '.squad', 'config.json');
  if (!fs.existsSync(configPath)) return undefined;

  let parsed: SquadConfig;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as SquadConfig;
  } catch {
    return undefined;
  }

  const logLevel = parsed.memory?.logLevel;
  return typeof logLevel === 'string' ? parseLogLevel(logLevel) : undefined;
}

function parseDiagnostics(projectRoot: string, args: string[]): { args: string[]; logLevel: MemoryDiagnosticLevel } {
  const filtered: string[] = [];
  let logLevel: MemoryDiagnosticLevel | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--verbose' || arg === '-v') {
      logLevel ??= 'debug';
      continue;
    }
    if (arg === '--log-level') {
      logLevel = parseLogLevel(args[index + 1]);
      index++;
      continue;
    }
    if (arg.startsWith('--log-level=')) {
      logLevel = parseLogLevel(arg.slice('--log-level='.length));
      continue;
    }
    filtered.push(arg);
  }

  return {
    args: filtered,
    logLevel: logLevel ?? (
      process.env['SQUAD_MEMORY_LOG_LEVEL'] !== undefined
        ? parseLogLevel(process.env['SQUAD_MEMORY_LOG_LEVEL'])
        : readConfiguredLogLevel(projectRoot) ?? 'none'
    ),
  };
}

function createMemoryDiagnostics(logLevel: MemoryDiagnosticLevel) {
  const emit = (level: Exclude<MemoryDiagnosticLevel, 'none'>, event: string, data: Record<string, unknown> = {}) => {
    if (MEMORY_DIAGNOSTIC_LEVELS[logLevel] < MEMORY_DIAGNOSTIC_LEVELS[level]) return;
    const details = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    console.error(`[memory:${level}] ${event}${details ? ` ${details}` : ''}`);
  };

  return {
    error: (event: string, data?: Record<string, unknown>) => emit('error', event, data),
    info: (event: string, data?: Record<string, unknown>) => emit('info', event, data),
    debug: (event: string, data?: Record<string, unknown>) => emit('debug', event, data),
  };
}

export async function runMemoryCommand(projectRoot: string, args: string[]): Promise<void> {
  const diagnosticsConfig = parseDiagnostics(projectRoot, args);
  const commandArgs = diagnosticsConfig.args;
  const diagnostics = createMemoryDiagnostics(diagnosticsConfig.logLevel);
  const operation = commandArgs[0] ?? 'help';
  const startedAt = Date.now();
  const store = new LocalMemoryStore(new FSStorageProvider(), projectRoot);
  const providerStore = store as LocalMemoryStore & {
    configureHostInjectedCopilotAdapter(options: {
      enabled: boolean;
      requireApproval?: boolean;
      defaultProvider?: 'local' | 'hostInjectedCopilotAdapter';
      actor?: string;
    }): Promise<MemoryProviderConfig>;
    providerStatus(): Promise<MemoryProviderStatus>;
  };

  diagnostics.info('command.start', { command: operation, projectRoot });

  try {
    if (operation === 'classify') {
      const content = readContent(commandArgs);
      const loadGuidance = parseLoadGuidance(readFlag(commandArgs, '--load-guidance'));
      const requestedClass = parseClass(readFlag(commandArgs, '--class'));
      diagnostics.debug('classify.request', { contentLength: content.length, requestedClass, loadGuidance });
      const classification = await store.classify({
        content,
        requestedClass,
        metadata: loadGuidance ? { loadGuidance } : undefined,
      });
      diagnostics.info('classify.complete', {
        class: classification.class,
        allowed: classification.allowed,
        destination: classification.destination,
        loadGuidance: classification.loadGuidance,
        elapsedMs: Date.now() - startedAt,
      });
      console.log(JSON.stringify(classification, null, 2));
      return;
    }

    if (operation === 'write') {
      const content = readContent(commandArgs);
      const loadGuidance = parseLoadGuidance(readFlag(commandArgs, '--load-guidance'));
      const requestedClass = parseClass(readFlag(commandArgs, '--class'));
      diagnostics.debug('write.request', {
        contentLength: content.length,
        requestedClass,
        loadGuidance,
        titleProvided: readFlag(commandArgs, '--title') !== undefined,
        authorProvided: readFlag(commandArgs, '--author') !== undefined,
        approved: commandArgs.includes('--approved'),
      });
      const result = await store.write({
        content,
        title: readFlag(commandArgs, '--title'),
        author: readFlag(commandArgs, '--author'),
        requestedClass,
        approved: commandArgs.includes('--approved'),
        metadata: loadGuidance ? { loadGuidance } : undefined,
      });
      diagnostics.info('write.complete', {
        stored: result.stored,
        class: result.classification.class,
        provider: result.classification.class === 'COPILOT_MEMORY' ? 'hostInjectedCopilotAdapter' : 'local',
        loadGuidance: result.classification.loadGuidance,
        path: result.path,
        elapsedMs: Date.now() - startedAt,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (operation === 'search') {
      const query = readFlag(commandArgs, '--query') ?? commandArgs.slice(1).join(' ');
      diagnostics.debug('search.request', { queryLength: query.length });
      const results = await store.search(query);
      diagnostics.info('search.complete', {
        count: results.length,
        providers: [...new Set(results.map(result => result.provider ?? 'local'))].join(',') || 'none',
        elapsedMs: Date.now() - startedAt,
      });
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (operation === 'promote') {
      const id = commandArgs[1];
      const targetClass = parseClass(readFlag(commandArgs, '--class'));
      if (!id || !targetClass || targetClass === 'FORBIDDEN' || targetClass === 'TRANSIENT') {
        throw new Error('Usage: squad memory promote <id> --class LOCAL|DECISION|POLICY|COPILOT_MEMORY');
      }
      diagnostics.debug('promote.request', { id, targetClass, actorProvided: readFlag(commandArgs, '--actor') !== undefined });
      const result = await store.promote(id, targetClass, readFlag(commandArgs, '--actor'));
      diagnostics.info('promote.complete', {
        id,
        stored: result.stored,
        class: result.classification.class,
        path: result.path,
        elapsedMs: Date.now() - startedAt,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (operation === 'delete') {
      const id = commandArgs[1];
      if (!id) throw new Error('Usage: squad memory delete <id>');
      diagnostics.debug('delete.request', { id, actorProvided: readFlag(commandArgs, '--actor') !== undefined });
      const deleted = await store.delete(id, readFlag(commandArgs, '--actor'));
      diagnostics.info('delete.complete', { id, deleted, elapsedMs: Date.now() - startedAt });
      console.log(JSON.stringify({ deleted }, null, 2));
      return;
    }

    if (operation === 'audit') {
      const audit = await store.auditLog();
      diagnostics.info('audit.complete', { count: audit.length, elapsedMs: Date.now() - startedAt });
      console.log(JSON.stringify(audit, null, 2));
      return;
    }

    if (operation === 'provider' || operation === 'providers' || operation === 'status') {
      if (readFlag(commandArgs, '--provider') === 'copilot' || commandArgs.includes('--default-copilot')) {
        throw new Error(REAL_COPILOT_UNAVAILABLE_REASON);
      }
      if (commandArgs.includes('--enable-host-injected-copilot-adapter') || commandArgs.includes('--enable-copilot')) {
        const requireApproval = parseBoolean(readFlag(commandArgs, '--require-approval'), true);
        diagnostics.debug('provider.configure.request', {
          enabled: true,
          requireApproval,
          defaultProvider: commandArgs.includes('--default-host-injected-copilot-adapter') ? 'hostInjectedCopilotAdapter' : undefined,
        });
        const config = await providerStore.configureHostInjectedCopilotAdapter({
          enabled: true,
          requireApproval,
          defaultProvider: commandArgs.includes('--default-host-injected-copilot-adapter')
            ? 'hostInjectedCopilotAdapter'
            : undefined,
          actor: readFlag(commandArgs, '--actor'),
        });
        diagnostics.info('provider.configure.complete', {
          defaultProvider: config.defaultProvider,
          hostInjectedCopilotAdapterEnabled: config.externalProviders.hostInjectedCopilotAdapter.enabled,
          requireApproval: config.externalProviders.hostInjectedCopilotAdapter.requireApproval,
          elapsedMs: Date.now() - startedAt,
        });
        console.log(JSON.stringify(config, null, 2));
        return;
      }
      if (commandArgs.includes('--disable-host-injected-copilot-adapter') || commandArgs.includes('--disable-copilot')) {
        diagnostics.debug('provider.configure.request', { enabled: false, defaultProvider: 'local' });
        const config = await providerStore.configureHostInjectedCopilotAdapter({
          enabled: false,
          defaultProvider: 'local',
          actor: readFlag(commandArgs, '--actor'),
        });
        diagnostics.info('provider.configure.complete', {
          defaultProvider: config.defaultProvider,
          hostInjectedCopilotAdapterEnabled: config.externalProviders.hostInjectedCopilotAdapter.enabled,
          elapsedMs: Date.now() - startedAt,
        });
        console.log(JSON.stringify(config, null, 2));
        return;
      }
      const status = await providerStore.providerStatus();
      diagnostics.info('provider.status.complete', {
        defaultProvider: status.defaultProvider,
        realCopilotConfigured: status.realCopilotMemory.configured,
        hostInjectedCopilotAdapterConfigured: status.hostInjectedCopilotAdapter.configured,
        hostInjectedCopilotAdapterClientAvailable: status.hostInjectedCopilotAdapter.clientAvailable,
        elapsedMs: Date.now() - startedAt,
      });
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    diagnostics.info('help.complete', { elapsedMs: Date.now() - startedAt });
    console.log([
      'Usage: squad memory <classify|write|search|promote|delete|audit|provider>',
      '  write --content "..." --class LOCAL --title "..." --author scribe [--load-guidance ALWAYS|ON-DEMAND|ARCHIVE|NEVER]',
      '  search --query "testing strategy"',
      '  provider [--enable-host-injected-copilot-adapter|--disable-host-injected-copilot-adapter] [--require-approval true|false]',
      '  provider --provider copilot fails unless a real Copilot Memory API module is present.',
      '  diagnostics: --log-level none|error|info|debug, --verbose, SQUAD_MEMORY_LOG_LEVEL, or .squad/config.json memory.logLevel (stderr; never logs raw memory content or search text).',
      'hostInjectedCopilotAdapter is not real provider=copilot persistence; enabling config alone never fakes remote memory.',
    ].join('\n'));
  } catch (error) {
    diagnostics.error('command.error', {
      command: operation,
      message: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - startedAt,
    });
    throw error;
  }
}
