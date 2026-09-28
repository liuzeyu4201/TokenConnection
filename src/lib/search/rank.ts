import { TIER_RANK, type Tier } from "@/lib/schemas/enums";

/**
 * Ranking rules from design.md §10. All tunables live here.
 *
 *   score = 0.60 * semantic          // cosine similarity in [0, 1]
 *         + 0.25 * tier_rank / 5     // closer relationships first
 *         + 0.15 * keyword_hit       // 1 when any keyword matched
 */
export const RANK_WEIGHTS = {
  semantic: 0.6,
  tier: 0.25,
  keyword: 0.15,
} as const;

/** Rows with semantic < threshold and no keyword hit are dropped. */
export const SEMANTIC_THRESHOLD = 0.3;

/** K for the pgvector top-K query (design.md §9.2 step 3). */
export const SEMANTIC_TOP_K = 30;

export const MAX_TIER_RANK = 5;

export type RankInput<T = unknown> = {
  person: T;
  tier: Tier;
  /** Cosine similarity in [0, 1]; null when the semantic layer had no hit. */
  semantic: number | null;
  keywordHit: boolean;
  /** e.g. ['semantic', 'keyword:name', 'tag:羽毛球'] */
  reasons: string[];
};

export type RankOutput<T = unknown> = RankInput<T> & { score: number };

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function computeScore(params: {
  semantic: number | null;
  tier: Tier;
  keywordHit: boolean;
}): number {
  const semantic = clamp01(params.semantic ?? 0);
  const tierRank = TIER_RANK[params.tier] ?? 1;
  return (
    RANK_WEIGHTS.semantic * semantic +
    RANK_WEIGHTS.tier * (tierRank / MAX_TIER_RANK) +
    RANK_WEIGHTS.keyword * (params.keywordHit ? 1 : 0)
  );
}

/** Whether a candidate survives the relevance cut-off. */
export function passesThreshold(item: Pick<RankInput, "semantic" | "keywordHit">): boolean {
  if (item.keywordHit) return true;
  return item.semantic !== null && item.semantic >= SEMANTIC_THRESHOLD;
}

/**
 * Score, filter and sort candidates. Ties are broken by tier (closer first)
 * and then by semantic similarity so the order is deterministic.
 */
export function rankCandidates<T>(items: RankInput<T>[]): RankOutput<T>[] {
  return items
    .filter(passesThreshold)
    .map((item) => ({
      ...item,
      score: Number(computeScore(item).toFixed(4)),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
        (b.semantic ?? 0) - (a.semantic ?? 0),
    );
}
