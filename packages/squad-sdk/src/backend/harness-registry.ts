import { BackendError } from './types.js';
import type { ExtensionBag, HarnessAdapter, HarnessDescriptor, HarnessRegistry } from './types.js';

const EXTENSION_KEY = /^x-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.[A-Za-z0-9_.-]+$/;

/** Returns the harness namespace of an `x-<harness>.*` key, or undefined if malformed. */
export function extensionNamespace(key: string): string | undefined {
  return EXTENSION_KEY.exec(key)?.[1];
}

/**
 * Validates that every key is `x-<harness>.*`. When `allowed` is given the
 * harness part must be in it. Throws {@link BackendError} `invalid-request`.
 */
export function validateExtensions(extensions: ExtensionBag | undefined, allowed?: Iterable<string>): void {
  if (!extensions) return;
  const allow = allowed ? new Set([...allowed].map(a => a.replace(/^x-/, ''))) : undefined;
  for (const key of Object.keys(extensions)) {
    const ns = extensionNamespace(key);
    if (!ns) throw new BackendError('invalid-request', `Extension key '${key}' must match x-<harness>.*`, 400);
    if (allow && !allow.has(ns)) {
      throw new BackendError('invalid-request', `Extension namespace 'x-${ns}' is not supported here`, 400);
    }
  }
}

export class DefaultHarnessRegistry implements HarnessRegistry {
  private readonly adapters = new Map<string, HarnessAdapter>();

  register(adapter: HarnessAdapter): void {
    if (!/^[a-z][a-z0-9-]*$/.test(adapter.id)) {
      throw new BackendError('invalid-request', `Invalid harness id '${adapter.id}'`, 400);
    }
    if (this.adapters.has(adapter.id)) {
      throw new BackendError('conflict', `Harness '${adapter.id}' already registered`, 409);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): HarnessAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): HarnessDescriptor[] {
    return [...this.adapters.values()].map(a => a.describe());
  }
}
