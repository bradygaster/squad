import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryStorageProvider } from '../packages/squad-sdk/src/storage/index.js';
import {
  USAGE_LEDGER_PATH,
  UsageLedger,
} from '../packages/squad-sdk/src/runtime/usage-ledger.js';

describe('UsageLedger', () => {
  let storage: InMemoryStorageProvider;
  let ledger: UsageLedger;

  beforeEach(() => {
    storage = new InMemoryStorageProvider();
    ledger = new UsageLedger(storage);
  });

  it('appends and reads structured usage events', async () => {
    await ledger.recordTurnStart({
      turnId: 'turn-1',
      sessionId: 'session-1',
      agentName: 'fenster',
      timestamp: new Date('2026-09-15T16:59:59.000Z'),
    });
    await ledger.append({
      type: 'usage',
      sessionId: 'session-1',
      turnId: 'turn-1',
      agentName: 'fenster',
      model: 'claude-sonnet-5',
      inputTokens: 1200,
      outputTokens: 300,
      estimatedCost: 0.0125,
      timestamp: new Date('2026-09-15T17:00:00.000Z'),
    });

    const result = await ledger.read();

    expect(result.invalidRecordCount).toBe(0);
    expect(result.turnStarts).toEqual([{
      version: 1,
      kind: 'turn-start',
      turnId: 'turn-1',
      sessionId: 'session-1',
      agentName: 'fenster',
      timestamp: '2026-09-15T16:59:59.000Z',
    }]);
    expect(result.records).toEqual([{
      version: 1,
      kind: 'usage',
      sessionId: 'session-1',
      turnId: 'turn-1',
      agentName: 'fenster',
      model: 'claude-sonnet-5',
      inputTokens: 1200,
      outputTokens: 300,
      estimatedCost: 0.0125,
      timestamp: '2026-09-15T17:00:00.000Z',
    }]);
  });

  it('preserves every event as a separate JSONL record', async () => {
    const baseEvent = {
      type: 'usage' as const,
      sessionId: 'session-1',
      model: 'gpt-5.6-sol',
      inputTokens: 100,
      outputTokens: 25,
      estimatedCost: 0.001,
      timestamp: new Date('2026-09-15T17:00:00.000Z'),
    };

    await ledger.append(baseEvent);
    await ledger.append({ ...baseEvent, inputTokens: 200 });

    const raw = await storage.read(USAGE_LEDGER_PATH);
    expect(raw?.trim().split('\n')).toHaveLength(2);
    expect((await ledger.read()).records).toHaveLength(2);
  });

  it('reports malformed and unsupported records without hiding valid data', async () => {
    await storage.write(
      USAGE_LEDGER_PATH,
      [
        JSON.stringify({
          version: 1,
          kind: 'usage',
          sessionId: 'session-1',
          model: 'gpt-5.6-sol',
          inputTokens: 100,
          outputTokens: 25,
          estimatedCost: 0.001,
          timestamp: '2026-09-15T17:00:00.000Z',
        }),
        '{not-json',
        JSON.stringify({ version: 2, sessionId: 'future' }),
      ].join('\n'),
    );

    const result = await ledger.read();

    expect(result.records).toHaveLength(1);
    expect(result.turnStarts).toHaveLength(0);
    expect(result.invalidRecordCount).toBe(2);
  });

  it('rejects invalid turn starts before writing them', async () => {
    await expect(ledger.recordTurnStart({
      turnId: '',
      sessionId: 'session-1',
      timestamp: new Date('2026-09-15T17:00:00.000Z'),
    })).rejects.toThrow('invalid usage turn start');

    expect(await storage.read(USAGE_LEDGER_PATH)).toBeUndefined();
  });

  it('rejects invalid usage before writing it', async () => {
    await expect(ledger.append({
      type: 'usage',
      sessionId: 'session-1',
      model: 'gpt-5.6-sol',
      inputTokens: -1,
      outputTokens: 25,
      estimatedCost: 0.001,
      timestamp: new Date('2026-09-15T17:00:00.000Z'),
    })).rejects.toThrow('invalid usage event');

    expect(await storage.read(USAGE_LEDGER_PATH)).toBeUndefined();
  });
});
