import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { inbox, people, type InboxRow } from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { refreshPersonEmbedding } from "@/lib/llm/embed";
import { extract } from "@/lib/llm/extract";
import { findMentionedPeople } from "@/lib/llm/mock";
import { parseInputPrefix } from "@/lib/llm/prefix";
import type { ExtractOptions, PeopleIndexEntry } from "@/lib/llm/types";
import { fallbackDraft, type Draft } from "@/lib/schemas/draft";
import type { InboxCreateInput, InboxQuery } from "@/lib/schemas/inbox";

import { insertEvent, recomputeLastContact } from "./events";
import { getPeopleIndex, getPersonDetail, getPersonRow, mergeContacts, type PersonDetail } from "./people";
import { searchPeople, type SearchResponse } from "./search";
import { addPersonTags, replacePersonTags } from "./tags";

/** Below this confidence the UI shows the candidate picker (design.md §9.1). */
export const TARGET_CONFIDENCE_THRESHOLD = 0.7;
const MAX_CANDIDATES = 5;

export type Candidate = {
  id: string;
  name: string;
  tier: (typeof people.$inferSelect)["tier"];
  location: string | null;
  summary: string | null;
};

export type InboxParseResult = {
  inbox: InboxRow;
  draft: Draft;
  candidates: Candidate[];
  /** Present when the intent is `query`: the search already ran. */
  results?: SearchResponse;
  /** Human-readable reason when the LLM failed and the draft is a fallback. */
  error: string | null;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listInbox(query: InboxQuery): Promise<InboxRow[]> {
  return db
    .select()
    .from(inbox)
    .where(eq(inbox.status, query.status))
    .orderBy(desc(inbox.created_at))
    .limit(query.limit);
}

export async function getInbox(id: string): Promise<InboxRow> {
  const [row] = await db.select().from(inbox).where(eq(inbox.id, id)).limit(1);
  if (!row) throw notFound("收件箱条目不存在");
  return row;
}

export async function countPendingInbox(): Promise<number> {
  const rows = await db.select({ id: inbox.id }).from(inbox).where(eq(inbox.status, "pending"));
  return rows.length;
}

// ---------------------------------------------------------------------------
// Create + parse
// ---------------------------------------------------------------------------

export async function createAndParseInbox(input: InboxCreateInput): Promise<InboxParseResult> {
  const [row] = await db
    .insert(inbox)
    .values({ raw_text: input.raw_text, source: input.source })
    .returning();
  return parseInboxRow(row, input.person_id);
}

export async function reparseInbox(id: string): Promise<InboxParseResult> {
  const row = await getInbox(id);
  if (row.status !== "pending") throw conflict("只有待处理的条目可以重新解析");
  return parseInboxRow(row);
}

async function candidatesFor(
  draft: Draft,
  text: string,
  index: PeopleIndexEntry[],
): Promise<Candidate[]> {
  const ids = new Set<string>();
  if (draft.target_person_id) ids.add(draft.target_person_id);
  for (const p of findMentionedPeople(text, index)) ids.add(p.id);
  const draftName = draft.person.name?.trim();
  if (draftName && draftName.length >= 2) {
    for (const p of index) {
      if (p.name.includes(draftName) || draftName.includes(p.name)) ids.add(p.id);
    }
  }
  const picked = [...ids].slice(0, MAX_CANDIDATES);
  if (picked.length === 0) return [];
  const rows = await db
    .select({
      id: people.id,
      name: people.name,
      tier: people.tier,
      location: people.location,
      summary: people.summary,
    })
    .from(people);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return picked.map((id) => byId.get(id)).filter((c): c is Candidate => Boolean(c));
}

/**
 * Parse one inbox row: prefix handling → LLM extraction (with people index for
 * disambiguation) → persist intent/parsed. Never throws because of the LLM:
 * failures are recorded in `error` and a fallback draft is returned
 * (design.md §9.1 失败退化).
 */
async function parseInboxRow(row: InboxRow, personHint?: string): Promise<InboxParseResult> {
  const { text, forcedIntent } = parseInputPrefix(row.raw_text);
  const index = await getPeopleIndex();

  const options: ExtractOptions = { forcedIntent };
  if (personHint && index.some((p) => p.id === personHint)) {
    options.forcedIntent = "update";
    options.targetPersonId = personHint;
  }

  let draft: Draft;
  let error: string | null = null;
  try {
    draft = await extract(text, index, options);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    draft = fallbackDraft(text);
    if (options.targetPersonId) {
      draft = { ...draft, intent: "update", target_person_id: options.targetPersonId, target_confidence: 1 };
    }
  }

  if (draft.intent === "query") {
    const results = await searchPeople({ q: text, limit: 20 });
    // Queries are kept for the record (原文永存) but never wait in the inbox.
    const [updated] = await db
      .update(inbox)
      .set({ intent: "query", parsed: draft, error: null, status: "discarded", applied_at: new Date() })
      .where(eq(inbox.id, row.id))
      .returning();
    return { inbox: updated, draft, candidates: [], results, error: null };
  }

  const candidates = await candidatesFor(draft, text, index);
  const [updated] = await db
    .update(inbox)
    .set({ intent: error ? "unknown" : draft.intent, parsed: draft, error })
    .where(eq(inbox.id, row.id))
    .returning();

  return { inbox: updated, draft, candidates, error };
}

// ---------------------------------------------------------------------------
// Apply / discard
// ---------------------------------------------------------------------------

export async function applyInbox(
  id: string,
  draft: Draft,
): Promise<{ inbox: InboxRow; person: PersonDetail }> {
  const row = await getInbox(id);
  if (row.status !== "pending") throw conflict("这条记录已经处理过了");
  if (draft.intent === "query") throw badRequest("查询不能入库", "invalid_intent");

  const isUpdate = draft.intent === "update" && draft.target_person_id;

  const personId = await db.transaction(async (tx) => {
    let targetId: string;
    if (isUpdate) {
      targetId = draft.target_person_id as string;
      const existing = await getPersonRow(targetId, tx);
      const p = draft.person;
      await tx
        .update(people)
        .set({
          name: p.name ?? existing.name,
          gender: p.gender ?? existing.gender,
          location: p.location ?? existing.location,
          tier: p.tier ?? existing.tier,
          summary: p.summary ?? existing.summary,
          impression: p.impression ?? existing.impression,
          contacts: mergeContacts(existing.contacts, p.contacts),
          how_met: p.how_met ?? existing.how_met,
          met_at: p.met_at ?? existing.met_at,
          updated_at: new Date(),
        })
        .where(eq(people.id, targetId));
      if (draft.tags.length > 0) await addPersonTags(targetId, draft.tags, tx);
    } else {
      const name = draft.person.name?.trim();
      if (!name) throw badRequest("请填写姓名再入库", "validation_error");
      const p = draft.person;
      const [created] = await tx
        .insert(people)
        .values({
          name,
          gender: p.gender ?? "unknown",
          location: p.location,
          tier: p.tier ?? "known_of",
          summary: p.summary,
          impression: p.impression,
          contacts: p.contacts ?? {},
          how_met: p.how_met,
          met_at: p.met_at,
        })
        .returning({ id: people.id });
      targetId = created.id;
      if (draft.tags.length > 0) await replacePersonTags(targetId, draft.tags, tx);
    }

    for (const event of draft.events) {
      await insertEvent(targetId, event, tx);
    }
    if (draft.events.length > 0) await recomputeLastContact(targetId, tx);

    await tx
      .update(inbox)
      .set({
        status: "applied",
        intent: isUpdate ? "update" : "add",
        parsed: draft,
        applied_to: targetId,
        applied_at: new Date(),
        error: null,
      })
      .where(eq(inbox.id, id));

    return targetId;
  });

  await refreshPersonEmbedding(personId);
  const [updatedInbox, person] = await Promise.all([getInbox(id), getPersonDetail(personId)]);
  return { inbox: updatedInbox, person };
}

export async function discardInbox(id: string): Promise<InboxRow> {
  const row = await getInbox(id);
  if (row.status !== "pending") throw conflict("这条记录已经处理过了");
  const [updated] = await db
    .update(inbox)
    .set({ status: "discarded", applied_at: new Date() })
    .where(eq(inbox.id, id))
    .returning();
  return updated;
}
