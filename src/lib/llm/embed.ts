import { embed } from "ai";
import { and, desc, eq } from "drizzle-orm";

import { getAdminDb } from "@/db";
import { events, people, peopleEmbeddings } from "@/db/schema";
import type { ServiceContext } from "@/lib/auth/context";
import { getPrivacySettings } from "@/lib/auth/settings";
import { withTenant } from "@/lib/auth/tenant";
import { consumeQuota } from "@/lib/auth/usage";
import { EMBEDDING_DIM } from "@/lib/env";

import { mockEmbed } from "./mock";
import { buildPersonEmbeddingText, EMBED_RECENT_EVENTS } from "./person-text";
import { getEmbeddingModel, getEmbeddingModelName, isMockProvider } from "./provider";
import { EmbeddingError } from "./types";

export { buildPersonEmbeddingText, EMBED_RECENT_EVENTS };

export const EMBED_TIMEOUT_MS = 15_000;

export const QUERY_INSTRUCTION =
  "Instruct: 给定一个用户的找人需求，检索最能满足这个需求的人的资料\nQuery: ";

export type EmbedKind = "document" | "query";

export async function embedText(text: string, kind: EmbedKind = "document"): Promise<number[]> {
  const trimmed = text.trim() || " ";
  if (isMockProvider()) return mockEmbed(trimmed);

  const value = kind === "query" ? QUERY_INSTRUCTION + trimmed : trimmed;
  try {
    const result = await embed({
      model: getEmbeddingModel(),
      value,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
      providerOptions: { openaiCompatible: { dimensions: EMBEDDING_DIM } },
    });
    if (result.embedding.length !== EMBEDDING_DIM) {
      throw new EmbeddingError(`Embedding 维度为 ${result.embedding.length}，期望 ${EMBEDDING_DIM}`);
    }
    return result.embedding;
  } catch (error) {
    if (error instanceof EmbeddingError) throw error;
    throw new EmbeddingError(error instanceof Error ? error.message : "embedding 请求失败", { cause: error });
  }
}

async function loadEmbeddingSource(ctx: ServiceContext, personId: string): Promise<string | null> {
  return withTenant(ctx, async (tx) => {
    const [person] = await tx
      .select()
      .from(people)
      .where(and(eq(people.id, personId), eq(people.owner_id, ctx.userId)))
      .limit(1);
    if (!person) return null;
    const { getTagsForPeople } = await import("@/lib/services/tags");
    const tagMap = await getTagsForPeople([personId], tx);
    const recentEvents = await tx
      .select({ content: events.content, happened_at: events.happened_at })
      .from(events)
      .where(and(eq(events.person_id, personId), eq(events.owner_id, ctx.userId)))
      .orderBy(desc(events.happened_at), desc(events.created_at))
      .limit(EMBED_RECENT_EVENTS);
    return buildPersonEmbeddingText(person, tagMap.get(personId) ?? [], recentEvents);
  });
}

export async function embedPerson(
  ctx: ServiceContext,
  personId: string,
  options: { quota?: boolean } = {},
): Promise<void> {
  if (options.quota !== false) {
    const settings = await getPrivacySettings(ctx.userId);
    if (!settings.llm_enabled) return;
    const quota = await consumeQuota(ctx.userId, "embed");
    if (!quota.ok) return;
  }
  const sourceText = await loadEmbeddingSource(ctx, personId);
  if (!sourceText) return;
  const vector = await embedText(sourceText);
  const model = getEmbeddingModelName();
  await withTenant(ctx, async (tx) => {
    await tx
      .insert(peopleEmbeddings)
      .values({ person_id: personId, owner_id: ctx.userId, model, embedding: vector, source_text: sourceText })
      .onConflictDoUpdate({
        target: peopleEmbeddings.person_id,
        set: { owner_id: ctx.userId, model, embedding: vector, source_text: sourceText, updated_at: new Date() },
      });
  });
}

export async function refreshPersonEmbedding(ctx: ServiceContext, personId: string): Promise<boolean> {
  try {
    await embedPerson(ctx, personId);
    return true;
  } catch (error) {
    console.error(`[embed] failed to refresh embedding for ${personId}:`, error);
    return false;
  }
}

/** Maintenance: walk every owner using the admin connection, then embed as that user. */
export async function reembedAllPeople(): Promise<{ total: number; failed: string[] }> {
  const admin = getAdminDb();
  const rows = await admin.select({ id: people.id, owner_id: people.owner_id }).from(people);
  const failed: string[] = [];
  for (const row of rows) {
    const ok = await refreshPersonEmbedding({ userId: row.owner_id, role: "admin", via: "session" }, row.id);
    if (!ok) failed.push(row.id);
  }
  return { total: rows.length, failed };
}
