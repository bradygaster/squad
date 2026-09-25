/**
 * Persistent structured usage ledger.
 *
 * Turn-start and usage records are stored as JSON Lines so writers can append
 * telemetry without rewriting the full history.
 *
 * @module runtime/usage-ledger
 */

import type { UsageEvent } from './streaming.js';

export const USAGE_LEDGER_PATH = 'log/usage.jsonl';
export const USAGE_LEDGER_VERSION = 1;

export interface UsageLedgerRecord {
  version: typeof USAGE_LEDGER_VERSION;
  kind: 'usage';
  sessionId: string;
  turnId?: string;
  agentName?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  timestamp: string;
}

export interface UsageLedgerTurnStart {
  version: typeof USAGE_LEDGER_VERSION;
  kind: 'turn-start';
  turnId: string;
  sessionId: string;
  agentName?: string;
  timestamp: string;
}

export interface UsageTurnStart {
  turnId: string;
  sessionId: string;
  agentName?: string;
  timestamp: Date;
}

export interface UsageLedgerReadResult {
  records: UsageLedgerRecord[];
  turnStarts: UsageLedgerTurnStart[];
  invalidRecordCount: number;
}

export interface UsageLedgerStorage {
  read(filePath: string): string | undefined | Promise<string | undefined>;
  append(filePath: string, data: string): void | Promise<void>;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isUsageLedgerRecord(value: unknown): value is UsageLedgerRecord {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  return record.version === USAGE_LEDGER_VERSION
    && record.kind === 'usage'
    && typeof record.sessionId === 'string'
    && record.sessionId.length > 0
    && (record.turnId === undefined || (typeof record.turnId === 'string' && record.turnId.length > 0))
    && (record.agentName === undefined || typeof record.agentName === 'string')
    && typeof record.model === 'string'
    && record.model.length > 0
    && Number.isInteger(record.inputTokens)
    && isNonNegativeFiniteNumber(record.inputTokens)
    && Number.isInteger(record.outputTokens)
    && isNonNegativeFiniteNumber(record.outputTokens)
    && isNonNegativeFiniteNumber(record.estimatedCost)
    && typeof record.timestamp === 'string'
    && Number.isFinite(Date.parse(record.timestamp));
}

function isUsageLedgerTurnStart(value: unknown): value is UsageLedgerTurnStart {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  return record.version === USAGE_LEDGER_VERSION
    && record.kind === 'turn-start'
    && typeof record.turnId === 'string'
    && record.turnId.length > 0
    && typeof record.sessionId === 'string'
    && record.sessionId.length > 0
    && (record.agentName === undefined || typeof record.agentName === 'string')
    && typeof record.timestamp === 'string'
    && Number.isFinite(Date.parse(record.timestamp));
}

function toRecord(event: UsageEvent): UsageLedgerRecord {
  const record: UsageLedgerRecord = {
    version: USAGE_LEDGER_VERSION,
    kind: 'usage',
    sessionId: event.sessionId,
    model: event.model,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    estimatedCost: event.estimatedCost,
    timestamp: event.timestamp.toISOString(),
    ...(event.turnId ? { turnId: event.turnId } : {}),
    ...(event.agentName ? { agentName: event.agentName } : {}),
  };

  if (!isUsageLedgerRecord(record)) {
    throw new TypeError('Cannot persist an invalid usage event');
  }

  return record;
}

function toTurnStart(turn: UsageTurnStart): UsageLedgerTurnStart {
  const record: UsageLedgerTurnStart = {
    version: USAGE_LEDGER_VERSION,
    kind: 'turn-start',
    turnId: turn.turnId,
    sessionId: turn.sessionId,
    timestamp: turn.timestamp.toISOString(),
    ...(turn.agentName ? { agentName: turn.agentName } : {}),
  };

  if (!isUsageLedgerTurnStart(record)) {
    throw new TypeError('Cannot persist an invalid usage turn start');
  }

  return record;
}

export class UsageLedger {
  constructor(
    private readonly storage: UsageLedgerStorage,
    private readonly ledgerPath: string = USAGE_LEDGER_PATH,
  ) {}

  async append(event: UsageEvent): Promise<void> {
    await Promise.resolve(this.storage.append(this.ledgerPath, `${JSON.stringify(toRecord(event))}\n`));
  }

  async recordTurnStart(turn: UsageTurnStart): Promise<void> {
    await Promise.resolve(this.storage.append(this.ledgerPath, `${JSON.stringify(toTurnStart(turn))}\n`));
  }

  async read(): Promise<UsageLedgerReadResult> {
    const content = await Promise.resolve(this.storage.read(this.ledgerPath));
    if (!content) {
      return { records: [], turnStarts: [], invalidRecordCount: 0 };
    }

    const records: UsageLedgerRecord[] = [];
    const turnStarts: UsageLedgerTurnStart[] = [];
    let invalidRecordCount = 0;

    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;

      try {
        const candidate: unknown = JSON.parse(line);
        if (isUsageLedgerRecord(candidate)) {
          records.push(candidate);
        } else if (isUsageLedgerTurnStart(candidate)) {
          turnStarts.push(candidate);
        } else {
          invalidRecordCount += 1;
        }
      } catch {
        invalidRecordCount += 1;
      }
    }

    return { records, turnStarts, invalidRecordCount };
  }
}
