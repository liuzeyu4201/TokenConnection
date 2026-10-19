export type WindowDecision = {
  allowed: boolean;
  retryAfterSec: number;
  hits: number[];
};

/** Sliding window. `hits` are timestamps (ms) of recent calls, oldest first. */
export function consumeWindow(now: number, hits: readonly number[], windowMs: number, max: number): WindowDecision {
  const fresh = hits.filter((t) => now - t < windowMs);
  if (fresh.length >= max) {
    const oldest = fresh[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, retryAfterSec, hits: fresh };
  }
  return { allowed: true, retryAfterSec: 0, hits: [...fresh, now] };
}

const buckets = new Map<string, number[]>();

export function consumeMemoryLimit(key: string, now: number, windowMs: number, max: number): WindowDecision {
  const decision = consumeWindow(now, buckets.get(key) ?? [], windowMs, max);
  buckets.set(key, decision.hits);
  return decision;
}

export function resetMemoryLimits(): void {
  buckets.clear();
}
