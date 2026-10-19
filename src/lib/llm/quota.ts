export type QuotaKind = "extract" | "vision" | "embed";

export type QuotaUsage = {
  extract_count: number;
  vision_count: number;
  embed_count: number;
};

export type QuotaLimits = {
  extract: number;
  vision: number;
  embed: number;
};

export const DEFAULT_QUOTA: QuotaLimits = {
  extract: 200,
  vision: 30,
  embed: 500,
};

export function readQuotaLimits(env: NodeJS.ProcessEnv = process.env): QuotaLimits {
  const num = (name: string, fallback: number) => {
    const n = Number(env[name] ?? fallback);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    extract: num("LLM_QUOTA_EXTRACT_PER_DAY", DEFAULT_QUOTA.extract),
    vision: num("LLM_QUOTA_VISION_PER_DAY", DEFAULT_QUOTA.vision),
    embed: num("LLM_QUOTA_EMBED_PER_DAY", DEFAULT_QUOTA.embed),
  };
}

export function usageCount(usage: QuotaUsage, kind: QuotaKind): number {
  if (kind === "extract") return usage.extract_count;
  if (kind === "vision") return usage.vision_count;
  return usage.embed_count;
}

/** True when the next call of `kind` would exceed the daily limit. */
export function isOverQuota(usage: QuotaUsage, limits: QuotaLimits, kind: QuotaKind): boolean {
  return usageCount(usage, kind) >= limits[kind];
}
