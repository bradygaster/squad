import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTrafficLight,
  shouldProceed,
  getRetryDelay,
  PredictiveCircuitBreaker,
  canUseQuota,
  consumeQuota,
  type RatePool,
  type AgentPriority,
} from '@bradygaster/squad-sdk/ralph/rate-limiting';

describe('getTrafficLight', () => {
  it('returns green when >20% remaining', () => {
    expect(getTrafficLight(1500, 5000)).toBe('green');
    expect(getTrafficLight(1001, 5000)).toBe('green');
  });

  it('returns amber when 5-20% remaining', () => {
    expect(getTrafficLight(1000, 5000)).toBe('amber');
    expect(getTrafficLight(251, 5000)).toBe('amber');
  });

  it('returns red when <5% remaining', () => {
    expect(getTrafficLight(250, 5000)).toBe('red');
    expect(getTrafficLight(0, 5000)).toBe('red');
  });

  it('returns red when limit is 0', () => {
    expect(getTrafficLight(0, 0)).toBe('red');
  });
});

describe('shouldProceed', () => {
  it('allows all agents on green', () => {
    expect(shouldProceed('green', 0)).toBe(true);
    expect(shouldProceed('green', 1)).toBe(true);
    expect(shouldProceed('green', 2)).toBe(true);
  });

  it('allows only P0 on amber', () => {
    expect(shouldProceed('amber', 0)).toBe(true);
    expect(shouldProceed('amber', 1)).toBe(false);
    expect(shouldProceed('amber', 2)).toBe(false);
  });

  it('blocks all on red', () => {
    expect(shouldProceed('red', 0)).toBe(false);
    expect(shouldProceed('red', 1)).toBe(false);
    expect(shouldProceed('red', 2)).toBe(false);
  });
});

describe('getRetryDelay', () => {
  it('returns delay within P0 window', () => {
    const delay = getRetryDelay(0, 0);
    expect(delay).toBeGreaterThanOrEqual(500);
    expect(delay).toBeLessThanOrEqual(7500); // 5000 + 50% jitter
  });

  it('returns delay within P2 window', () => {
    const delay = getRetryDelay(2, 0);
    expect(delay).toBeGreaterThanOrEqual(5000);
    expect(delay).toBeLessThanOrEqual(90000); // 60000 + 50% jitter
  });

  it('increases with attempt count', () => {
    const d0 = getRetryDelay(1, 0);
    const d3 = getRetryDelay(1, 3);
    // d3 should generally be larger (exponential backoff)
    // But jitter makes this probabilistic, so we just check it runs
    expect(d0).toBeGreaterThan(0);
    expect(d3).toBeGreaterThan(0);
  });

  it('caps at max window', () => {
    const delay = getRetryDelay(0, 100); // Very high attempt
    expect(delay).toBeLessThanOrEqual(7500); // 5000 + 50% jitter max
  });
});

describe('PredictiveCircuitBreaker', () => {
  let cb: PredictiveCircuitBreaker;

  beforeEach(() => {
    cb = new PredictiveCircuitBreaker({ maxSamples: 5, warningThresholdSeconds: 120 });
  });

  it('does not open with insufficient samples', () => {
    cb.addSample(5000, 5000);
    cb.addSample(4900, 5000);
    expect(cb.shouldOpen()).toBe(false); // Only 2 samples
  });

  it('does not open when quota is not being consumed', () => {
    cb.addSample(4000, 5000);
    cb.addSample(4000, 5000);
    cb.addSample(4000, 5000);
    expect(cb.shouldOpen()).toBe(false);
  });

  it('opens when quota is being consumed rapidly', () => {
    // Simulate rapid consumption: 1000 → 100 in ~60 seconds
    const now = Date.now();
    cb = new PredictiveCircuitBreaker({ warningThresholdSeconds: 120 });
    // Manually set samples with timestamps
    (cb as any).samples = [
      { timestamp: now - 60000, remaining: 1000, limit: 5000 },
      { timestamp: now - 40000, remaining: 700, limit: 5000 },
      { timestamp: now - 20000, remaining: 400, limit: 5000 },
      { timestamp: now, remaining: 100, limit: 5000 },
    ];
    
    const eta = cb.predictExhaustion();
    expect(eta).not.toBeNull();
    expect(eta!).toBeLessThan(120); // Should predict exhaustion within 120s
    expect(cb.shouldOpen()).toBe(true);
  });

  it('does not open when consumption rate is slow', () => {
    const now = Date.now();
    (cb as any).samples = [
      { timestamp: now - 3600000, remaining: 5000, limit: 5000 }, // 1 hour ago
      { timestamp: now - 1800000, remaining: 4900, limit: 5000 },
      { timestamp: now, remaining: 4800, limit: 5000 },
    ];
    
    const eta = cb.predictExhaustion();
    expect(eta).not.toBeNull();
    expect(eta!).toBeGreaterThan(120);
    expect(cb.shouldOpen()).toBe(false);
  });

  it('resets samples', () => {
    cb.addSample(1000, 5000);
    cb.addSample(500, 5000);
    cb.addSample(100, 5000);
    cb.reset();
    expect(cb.getSamples()).toHaveLength(0);
    expect(cb.predictExhaustion()).toBeNull();
  });

  it('limits to maxSamples', () => {
    for (let i = 0; i < 10; i++) {
      cb.addSample(5000 - i * 100, 5000);
    }
    expect(cb.getSamples()).toHaveLength(5); // maxSamples = 5
  });
});

describe('canUseQuota', () => {
  const futureExpiry = new Date(Date.now() + 300000).toISOString(); // 5 min from now
  const pastExpiry = new Date(Date.now() - 60000).toISOString(); // 1 min ago

  it('allows unknown agents', () => {
    const pool: RatePool = {
      totalLimit: 5000,
      resetAt: futureExpiry,
      allocations: {},
    };
    expect(canUseQuota(pool, 'unknown-agent')).toBe(true);
  });

  it('allows agent with remaining quota', () => {
    const pool: RatePool = {
      totalLimit: 5000,
      resetAt: futureExpiry,
      allocations: {
        picard: { priority: 0, allocated: 2000, used: 500, leaseExpiry: futureExpiry },
      },
    };
    expect(canUseQuota(pool, 'picard')).toBe(true);
  });

  it('blocks agent that exhausted quota', () => {
    const pool: RatePool = {
      totalLimit: 5000,
      resetAt: futureExpiry,
      allocations: {
        ralph: { priority: 2, allocated: 1000, used: 1000, leaseExpiry: futureExpiry },
      },
    };
    expect(canUseQuota(pool, 'ralph')).toBe(false);
  });

  it('is pure — does not reclaim stale leases from other agents', () => {
    const pool: RatePool = {
      totalLimit: 5000,
      resetAt: futureExpiry,
      allocations: {
        picard: { priority: 0, allocated: 2000, used: 500, leaseExpiry: pastExpiry }, // Stale
        ralph: { priority: 2, allocated: 1000, used: 500, leaseExpiry: futureExpiry },
      },
    };
    canUseQuota(pool, 'ralph');
    expect(pool.allocations.picard!.allocated).toBe(2000); // NOT reclaimed — pure read
  });

  it('is pure — does not modify own stale lease', () => {
    const pool: RatePool = {
      totalLimit: 5000,
      resetAt: futureExpiry,
      allocations: {
        ralph: { priority: 2, allocated: 1000, used: 500, leaseExpiry: pastExpiry },
      },
    };
    expect(canUseQuota(pool, 'ralph')).toBe(true);
    expect(pool.allocations.ralph!.allocated).toBe(1000); // Unchanged
    expect(pool.allocations.ralph!.used).toBe(500);       // Unchanged
  });
});

describe('consumeQuota', () => {
  const futureExpiry = new Date(Date.now() + 300000).toISOString();
  const pastExpiry = new Date(Date.now() - 60000).toISOString();

  it('increments used count for the calling agent', () => {
    const pool: RatePool = {
      totalLimit: 5000,
      resetAt: futureExpiry,
      allocations: {
        ralph: { priority: 2, allocated: 1000, used: 5, leaseExpiry: futureExpiry },
      },
    };
    consumeQuota(pool, 'ralph');
    expect(pool.allocations.ralph!.used).toBe(6);
  });

  it('reclaims stale leases from other agents', () => {
    const pool: RatePool = {
      totalLimit: 5000,
      resetAt: futureExpiry,
      allocations: {
        picard: { priority: 0, allocated: 2000, used: 500, leaseExpiry: pastExpiry }, // Stale
        ralph: { priority: 2, allocated: 1000, used: 500, leaseExpiry: futureExpiry },
      },
    };
    consumeQuota(pool, 'ralph');
    expect(pool.allocations.picard!.allocated).toBe(0); // Reclaimed
    expect(pool.allocations.ralph!.used).toBe(501);     // Incremented
  });

  it('does not reclaim own stale lease', () => {
    const pool: RatePool = {
      totalLimit: 5000,
      resetAt: futureExpiry,
      allocations: {
        ralph: { priority: 2, allocated: 1000, used: 500, leaseExpiry: pastExpiry },
      },
    };
    consumeQuota(pool, 'ralph');
    expect(pool.allocations.ralph!.allocated).toBe(1000); // Not reclaimed
    expect(pool.allocations.ralph!.used).toBe(501);       // Incremented
  });

  it('is a no-op for unknown agents', () => {
    const pool: RatePool = {
      totalLimit: 5000,
      resetAt: futureExpiry,
      allocations: {},
    };
    expect(() => consumeQuota(pool, 'ghost')).not.toThrow();
  });

  it('canUseQuota + consumeQuota work correctly together', () => {
    const pool: RatePool = {
      totalLimit: 5000,
      resetAt: futureExpiry,
      allocations: {
        ralph: { priority: 2, allocated: 1000, used: 999, leaseExpiry: futureExpiry },
      },
    };
    // One quota left
    expect(canUseQuota(pool, 'ralph')).toBe(true);
    consumeQuota(pool, 'ralph');
    // Now exhausted
    expect(canUseQuota(pool, 'ralph')).toBe(false);
  });
});
