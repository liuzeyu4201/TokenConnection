import { describe, expect, it } from "vitest";

import {
  computeScore,
  passesThreshold,
  RANK_WEIGHTS,
  rankCandidates,
  SEMANTIC_THRESHOLD,
  type RankInput,
} from "./rank";

function item(
  name: string,
  tier: RankInput["tier"],
  semantic: number | null,
  keywordHit = false,
): RankInput<string> {
  return { person: name, tier, semantic, keywordHit, reasons: [] };
}

describe("computeScore", () => {
  it("follows 0.60*semantic + 0.25*tier_rank/5 + 0.15*keyword_hit", () => {
    expect(RANK_WEIGHTS).toEqual({ semantic: 0.6, tier: 0.25, keyword: 0.15 });
    expect(computeScore({ semantic: 1, tier: "best_bros", keywordHit: true })).toBeCloseTo(1, 6);
    expect(computeScore({ semantic: 0, tier: "known_of", keywordHit: false })).toBeCloseTo(0.05, 6);
    expect(computeScore({ semantic: 0.5, tier: "friends", keywordHit: false })).toBeCloseTo(
      0.6 * 0.5 + 0.25 * (3 / 5),
      6,
    );
    expect(computeScore({ semantic: 0.5, tier: "friends", keywordHit: true })).toBeCloseTo(
      0.6 * 0.5 + 0.25 * (3 / 5) + 0.15,
      6,
    );
  });

  it("treats a missing semantic score as 0 and clamps out-of-range values", () => {
    expect(computeScore({ semantic: null, tier: "known_of", keywordHit: true })).toBeCloseTo(0.2, 6);
    expect(computeScore({ semantic: 1.7, tier: "known_of", keywordHit: false })).toBeCloseTo(0.65, 6);
    expect(computeScore({ semantic: -0.4, tier: "known_of", keywordHit: false })).toBeCloseTo(0.05, 6);
  });
});

describe("passesThreshold", () => {
  it("drops rows below the semantic threshold without a keyword hit", () => {
    expect(SEMANTIC_THRESHOLD).toBe(0.3);
    expect(passesThreshold({ semantic: 0.29, keywordHit: false })).toBe(false);
    expect(passesThreshold({ semantic: 0.3, keywordHit: false })).toBe(true);
    expect(passesThreshold({ semantic: null, keywordHit: false })).toBe(false);
  });

  it("keeps keyword hits regardless of semantic score", () => {
    expect(passesThreshold({ semantic: 0.1, keywordHit: true })).toBe(true);
    expect(passesThreshold({ semantic: null, keywordHit: true })).toBe(true);
  });
});

describe("rankCandidates", () => {
  it("ranks the closer person first when semantic scores are comparable (scenario C)", () => {
    const ranked = rankCandidates([
      item("小王 · 羽毛球教练", "interacted", 0.74),
      item("老李 · 大学校队", "close_friends", 0.62),
      item("路人", "known_of", 0.2),
    ]);
    expect(ranked.map((r) => r.person)).toEqual(["老李 · 大学校队", "小王 · 羽毛球教练"]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("lets a keyword hit rescue a low semantic score", () => {
    const ranked = rankCandidates([item("陈默", "friends", 0.05, true), item("无关", "friends", 0.1)]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].person).toBe("陈默");
    expect(ranked[0].score).toBeCloseTo(0.6 * 0.05 + 0.25 * 0.6 + 0.15, 4);
  });

  it("sorts by score, then tier, then semantic and rounds scores to 4 decimals", () => {
    const ranked = rankCandidates([
      item("a", "friends", 0.5),
      item("b", "friends", 0.5),
      item("c", "close_friends", 0.5),
    ]);
    expect(ranked[0].person).toBe("c");
    expect(String(ranked[0].score).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });

  it("returns an empty list when nothing passes", () => {
    expect(rankCandidates([item("x", "best_bros", 0.1), item("y", "best_bros", null)])).toEqual([]);
  });
});
