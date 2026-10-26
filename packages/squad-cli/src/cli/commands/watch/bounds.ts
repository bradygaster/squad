/** Parse a positive watch duration with an explicit unit. */
export function parseWatchDuration(value: string): number | undefined {
  const match = /^([1-9]\d*)(ms|s|m|h|d)$/.exec(value);
  if (!match) return undefined;

  const units: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  const milliseconds = Number(match[1]) * units[match[2]!]!;
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}

export function watchBoundReason(
  completedRounds: number,
  now: number,
  maxRounds?: number,
  deadline?: number,
  maxDuration?: string,
): string | undefined {
  if (maxRounds !== undefined && completedRounds >= maxRounds) {
    return `max rounds reached (${completedRounds}/${maxRounds})`;
  }
  if (deadline !== undefined && now >= deadline) {
    return `max duration reached (${maxDuration})`;
  }
  return undefined;
}
