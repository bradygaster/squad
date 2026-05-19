import {
  FSStorageProvider,
  LocalMemoryStore,
  type MemoryClass,
  type MemoryLoadGuidance,
} from '@bradygaster/squad-sdk';

const REAL_COPILOT_UNAVAILABLE_REASON =
  'Real Copilot Memory API unavailable: no concrete callable API was found in installed @github/copilot SDK/tooling. Squad will not fake provider=copilot; use hostInjectedCopilotAdapter only when a host supplies a client.';

function readFlag(args: string[], name: string): string | undefined {
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

export async function runMemoryCommand(projectRoot: string, args: string[]): Promise<void> {
  const operation = args[0] ?? 'help';
  const store = new LocalMemoryStore(new FSStorageProvider(), projectRoot);
  const providerStore = store as LocalMemoryStore & {
    configureHostInjectedCopilotAdapter(options: {
      enabled: boolean;
      requireApproval?: boolean;
      defaultProvider?: 'local' | 'hostInjectedCopilotAdapter';
      actor?: string;
    }): Promise<unknown>;
    providerStatus(): Promise<unknown>;
  };

  if (operation === 'classify') {
    const content = readContent(args);
    const loadGuidance = parseLoadGuidance(readFlag(args, '--load-guidance'));
    const classification = await store.classify({
      content,
      requestedClass: parseClass(readFlag(args, '--class')),
      metadata: loadGuidance ? { loadGuidance } : undefined,
    });
    console.log(JSON.stringify(classification, null, 2));
    return;
  }

  if (operation === 'write') {
    const content = readContent(args);
    const loadGuidance = parseLoadGuidance(readFlag(args, '--load-guidance'));
    const result = await store.write({
      content,
      title: readFlag(args, '--title'),
      author: readFlag(args, '--author'),
      requestedClass: parseClass(readFlag(args, '--class')),
      approved: args.includes('--approved'),
      metadata: loadGuidance ? { loadGuidance } : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (operation === 'search') {
    const query = readFlag(args, '--query') ?? args.slice(1).join(' ');
    console.log(JSON.stringify(await store.search(query), null, 2));
    return;
  }

  if (operation === 'promote') {
    const id = args[1];
    const targetClass = parseClass(readFlag(args, '--class'));
    if (!id || !targetClass || targetClass === 'FORBIDDEN' || targetClass === 'TRANSIENT') {
      throw new Error('Usage: squad memory promote <id> --class LOCAL|DECISION|POLICY|COPILOT_MEMORY');
    }
    console.log(JSON.stringify(await store.promote(id, targetClass, readFlag(args, '--actor')), null, 2));
    return;
  }

  if (operation === 'delete') {
    const id = args[1];
    if (!id) throw new Error('Usage: squad memory delete <id>');
    console.log(JSON.stringify({ deleted: await store.delete(id, readFlag(args, '--actor')) }, null, 2));
    return;
  }

  if (operation === 'audit') {
    console.log(JSON.stringify(await store.auditLog(), null, 2));
    return;
  }

  if (operation === 'provider' || operation === 'providers' || operation === 'status') {
    if (readFlag(args, '--provider') === 'copilot' || args.includes('--default-copilot')) {
      throw new Error(REAL_COPILOT_UNAVAILABLE_REASON);
    }
    if (args.includes('--enable-host-injected-copilot-adapter') || args.includes('--enable-copilot')) {
      console.log(JSON.stringify(await providerStore.configureHostInjectedCopilotAdapter({
        enabled: true,
        requireApproval: parseBoolean(readFlag(args, '--require-approval'), true),
        defaultProvider: args.includes('--default-host-injected-copilot-adapter')
          ? 'hostInjectedCopilotAdapter'
          : undefined,
        actor: readFlag(args, '--actor'),
      }), null, 2));
      return;
    }
    if (args.includes('--disable-host-injected-copilot-adapter') || args.includes('--disable-copilot')) {
      console.log(JSON.stringify(await providerStore.configureHostInjectedCopilotAdapter({
        enabled: false,
        defaultProvider: 'local',
        actor: readFlag(args, '--actor'),
      }), null, 2));
      return;
    }
    console.log(JSON.stringify(await providerStore.providerStatus(), null, 2));
    return;
  }

  console.log([
    'Usage: squad memory <classify|write|search|promote|delete|audit|provider>',
    '  write --content "..." --class LOCAL --title "..." --author scribe [--load-guidance ALWAYS|ON-DEMAND|ARCHIVE|NEVER]',
    '  search --query "testing strategy"',
    '  provider [--enable-host-injected-copilot-adapter|--disable-host-injected-copilot-adapter] [--require-approval true|false]',
    '  provider --provider copilot fails unless a real Copilot Memory API module is present.',
    'hostInjectedCopilotAdapter is not real provider=copilot persistence; enabling config alone never fakes remote memory.',
  ].join('\n'));
}
