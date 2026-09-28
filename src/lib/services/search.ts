import { and, cosineDistance, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { people, peopleEmbeddings, type PersonRow } from "@/db/schema";
import { embedText } from "@/lib/llm/embed";
import { TIER_RANK } from "@/lib/schemas/enums";
import type { SearchQuery } from "@/lib/schemas/search";
import { rankCandidates, SEMANTIC_TOP_K, type RankInput } from "@/lib/search/rank";

import { attachTags, keywordFilters, splitTerms, structuredFilters, type PersonWithTags } from "./people";

export type SearchHit = {
  person: PersonWithTags;
  score: number;
  reasons: string[];
  semantic: number | null;
  keyword_hit: boolean;
};

export type SearchResponse = {
  query: string;
  hits: SearchHit[];
  /** True when the semantic layer could not run (embedding failure). */
  semantic_skipped: boolean;
};

const KEYWORD_FIELDS: Array<[keyof PersonRow, string]> = [
  ["name", "keyword:name"],
  ["summary", "keyword:summary"],
  ["impression", "keyword:impression"],
  ["how_met", "keyword:how_met"],
  ["location", "keyword:location"],
];

/** Which fields / tags matched, for the `reasons` array (design.md §8). */
export function keywordReasons(person: PersonWithTags, q: string): string[] {
  const terms = splitTerms(q).map((t) => t.toLowerCase());
  if (terms.length === 0) return [];
  const reasons = new Set<string>();
  for (const term of terms) {
    for (const [field, label] of KEYWORD_FIELDS) {
      const value = person[field];
      if (typeof value === "string" && value.toLowerCase().includes(term)) reasons.add(label);
    }
    for (const tag of person.tags) {
      if (tag.name.toLowerCase().includes(term)) reasons.add(`tag:${tag.name}`);
    }
  }
  return [...reasons];
}

/**
 * Three-layer search (design.md §9.2) + ranking (§10):
 * 1. structured filters, 2. ILIKE keywords, 3. pgvector cosine top-K,
 * then merge, score, threshold and sort.
 */
export async function searchPeople(query: SearchQuery): Promise<SearchResponse> {
  const q = query.q.trim();
  const filters = structuredFilters(query);
  const where = (extra: SQL[] = []) =>
    filters.length + extra.length > 0 ? and(...filters, ...extra) : undefined;

  // No text: plain filtered list ordered by closeness.
  if (!q) {
    const rows = await db
      .select()
      .from(people)
      .where(where())
      .orderBy(desc(people.updated_at))
      .limit(query.limit);
    const items = await attachTags(rows);
    const ranked = rankCandidates(
      items.map<RankInput<PersonWithTags>>((person) => ({
        person,
        tier: person.tier,
        semantic: null,
        keywordHit: true,
        reasons: filters.length > 0 ? ["filter"] : ["all"],
      })),
    );
    return { query: q, hits: ranked.map(toHit), semantic_skipped: false };
  }

  // Layer 2: keyword candidates.
  const keywordRows = await db
    .select({ id: people.id })
    .from(people)
    .where(where(keywordFilters(q)))
    .limit(200);
  const keywordIds = new Set(keywordRows.map((r) => r.id));

  // Layer 3: semantic candidates (cosine similarity = 1 - distance).
  const semantic = new Map<string, number>();
  let semanticSkipped = false;
  try {
    const vector = await embedText(q, "query");
    const similarity = sql<number>`1 - (${cosineDistance(peopleEmbeddings.embedding, vector)})`;
    const semanticRows = await db
      .select({ id: peopleEmbeddings.person_id, similarity })
      .from(peopleEmbeddings)
      .innerJoin(people, eq(people.id, peopleEmbeddings.person_id))
      .where(where())
      .orderBy(desc(similarity))
      .limit(SEMANTIC_TOP_K);
    for (const row of semanticRows) semantic.set(row.id, Number(row.similarity));
  } catch (error) {
    semanticSkipped = true;
    console.error("[search] semantic layer skipped:", error);
  }

  const ids = [...new Set([...keywordIds, ...semantic.keys()])];
  if (ids.length === 0) return { query: q, hits: [], semantic_skipped: semanticSkipped };

  const rows = await db.select().from(people).where(inArray(people.id, ids));
  const items = await attachTags(rows);

  const candidates = items.map<RankInput<PersonWithTags>>((person) => {
    const sim = semantic.get(person.id) ?? null;
    const kwReasons = keywordIds.has(person.id) ? keywordReasons(person, q) : [];
    const keywordHit = keywordIds.has(person.id);
    const reasons: string[] = [];
    if (sim !== null && sim > 0) reasons.push("semantic");
    reasons.push(...(kwReasons.length > 0 ? kwReasons : keywordHit ? ["keyword"] : []));
    return { person, tier: person.tier, semantic: sim, keywordHit, reasons };
  });

  const ranked = rankCandidates(candidates).slice(0, query.limit);
  return { query: q, hits: ranked.map(toHit), semantic_skipped: semanticSkipped };
}

function toHit(item: RankInput<PersonWithTags> & { score: number }): SearchHit {
  return {
    person: item.person,
    score: item.score,
    reasons: item.reasons,
    semantic: item.semantic === null ? null : Number(item.semantic.toFixed(4)),
    keyword_hit: item.keywordHit,
  };
}

/** Sort helper for UI lists: closer people first, then most recently updated. */
export function byCloseness(a: PersonRow, b: PersonRow): number {
  return TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.updated_at.getTime() - a.updated_at.getTime();
}
