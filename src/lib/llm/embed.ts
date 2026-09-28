import { embed } from "ai";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  events,
  people,
  peopleEmbeddings,
  type EventRow,
  type PersonRow,
  type TagRow,
} from "@/db/schema";
import { EMBEDDING_DIM } from "@/lib/env";

import { mockEmbed } from "./mock";
import { getEmbeddingModel, getEmbeddingModelName, isMockProvider } from "./provider";
import { EmbeddingError } from "./types";

export const EMBED_TIMEOUT_MS = 15_000;
/** How many recent events go into the person's vector text (design.md §7.4). */
export const EMBED_RECENT_EVENTS = 5;

/** embed(text) → number[1024] (design.md §13). */
export async function embedText(text: string): Promise<number[]> {
  const value = text.trim() || " ";
  if (isMockProvider()) return mockEmbed(value);

  try {
    const result = await embed({
      model: getEmbeddingModel(),
      value,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
      providerOptions: { openaiCompatible: { dimensions: EMBEDDING_DIM } },
    });
    if (result.embedding.length !== EMBEDDING_DIM) {
      throw new EmbeddingError(
        `Embedding 维度为 ${result.embedding.length}，期望 ${EMBEDDING_DIM}`,
      );
    }
    return result.embedding;
  } catch (error) {
    if (error instanceof EmbeddingError) throw error;
    throw new EmbeddingError(
      error instanceof Error ? error.message : "embedding 请求失败",
      { cause: error },
    );
  }
}

/** Template from design.md §7.4. Contacts are deliberately excluded. */
export function buildPersonEmbeddingText(
  person: Pick<PersonRow, "name" | "location" | "summary" | "impression">,
  tags: Pick<TagRow, "name" | "kind">[],
  recentEvents: Pick<EventRow, "content" | "happened_at">[],
): string {
  const skills = tags.filter((t) => t.kind === "skill").map((t) => t.name);
  const circles = tags.filter((t) => t.kind === "circle").map((t) => t.name);
  const recent = recentEvents
    .slice(0, EMBED_RECENT_EVENTS)
    .map((e) => `${String(e.happened_at).slice(0, 7)} ${e.content}`);

  return [
    `姓名：${person.name}`,
    `所在地：${person.location ?? ""}`,
    `能力：${skills.join("，")}`,
    `圈子：${circles.join("，")}`,
    `摘要：${person.summary ?? ""}`,
    `印象：${person.impression ?? ""}`,
    `最近：${recent.join("；")}`,
  ].join("\n");
}

/**
 * embedPerson(personId): build the template text, embed it and upsert
 * people_embeddings. Throws on failure.
 */
export async function embedPerson(personId: string): Promise<void> {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (!person) return;

  // Lazy import keeps llm/ free of a static dependency on services/.
  const { getTagsForPeople } = await import("@/lib/services/tags");
  const tagMap = await getTagsForPeople([personId]);
  const recentEvents = await db
    .select({ content: events.content, happened_at: events.happened_at })
    .from(events)
    .where(eq(events.person_id, personId))
    .orderBy(desc(events.happened_at), desc(events.created_at))
    .limit(EMBED_RECENT_EVENTS);

  const sourceText = buildPersonEmbeddingText(person, tagMap.get(personId) ?? [], recentEvents);
  const vector = await embedText(sourceText);
  const model = getEmbeddingModelName();

  await db
    .insert(peopleEmbeddings)
    .values({ person_id: personId, model, embedding: vector, source_text: sourceText })
    .onConflictDoUpdate({
      target: peopleEmbeddings.person_id,
      set: { model, embedding: vector, source_text: sourceText, updated_at: new Date() },
    });
}

/**
 * Safe wrapper used after writes: an embedding failure must never block
 * recording a person (design.md §9.1). Errors are logged and swallowed.
 */
export async function refreshPersonEmbedding(personId: string): Promise<boolean> {
  try {
    await embedPerson(personId);
    return true;
  } catch (error) {
    console.error(`[embed] failed to refresh embedding for ${personId}:`, error);
    return false;
  }
}

/** Recompute every person's vector, e.g. after switching embedding models. */
export async function reembedAllPeople(): Promise<{ total: number; failed: string[] }> {
  const rows = await db.select({ id: people.id }).from(people);
  const failed: string[] = [];
  for (const row of rows) {
    const ok = await refreshPersonEmbedding(row.id);
    if (!ok) failed.push(row.id);
  }
  return { total: rows.length, failed };
}
