import { and, desc, eq, inArray } from "drizzle-orm";

import { inbox, people, shareRecipients, shares, users, type InboxRow } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ApiError, badRequest, conflict, notFound } from "@/lib/api/errors";
import type { ServiceContext } from "@/lib/auth/context";
import { getPrivacySettings } from "@/lib/auth/settings";
import { withTenant } from "@/lib/auth/tenant";
import { consumeQuota } from "@/lib/auth/usage";
import { refreshPersonEmbedding } from "@/lib/llm/embed";
import { extract } from "@/lib/llm/extract";
import { findMentionedPeople } from "@/lib/llm/mock";
import { parseInputPrefix } from "@/lib/llm/prefix";
import { mergeRedactedContacts, redactContacts, restorePlaceholders, type Redaction } from "@/lib/llm/redact";
import type { ExtractOptions, PeopleIndexEntry } from "@/lib/llm/types";
import { composeImageText, describeImage, type ImagePayload } from "@/lib/llm/vision";
import { fallbackDraft, type Draft } from "@/lib/schemas/draft";
import { matchingContactPersonIds, matchingShareItemPersonIds } from "@/lib/shares/dedupe";
import type { InboxCreateInput, InboxImageCreateInput, InboxQuery } from "@/lib/schemas/inbox";

import { insertEvent, recomputeLastContact } from "./events";
import { ensureFollowUpPlan } from "./follow-ups";
import {
  getPeopleIndex,
  getPersonDetail,
  getPersonRow,
  initialGeo,
  mergeContacts,
  resolveGeo,
  type PersonDetail,
} from "./people";
import { searchPeople, type SearchResponse } from "./search";
import { markShareAccepted, noteShareDiscarded } from "./shares";
import { addPersonTags, canonicalizeTagInputs, listTags, replacePersonTags, upsertTags } from "./tags";

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
  results?: SearchResponse;
  error: string | null;
};

export type InboxListItem = InboxRow & {
  share: {
    id: string;
    from_username: string | null;
    kind: "person" | "circle";
    item_count: number;
    revoked: boolean;
  } | null;
};

export async function listInbox(ctx: ServiceContext, query: InboxQuery): Promise<InboxListItem[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(inbox)
      .where(and(eq(inbox.owner_id, ctx.userId), eq(inbox.status, query.status)))
      .orderBy(desc(inbox.created_at))
      .limit(query.limit);
    const recipientIds = rows.flatMap((row) => (row.share_recipient_id ? [row.share_recipient_id] : []));
    if (recipientIds.length === 0) return rows.map((row) => ({ ...row, share: null }));
    const meta = await tx
      .select({
        recipientId: shareRecipients.id,
        shareId: shares.id,
        kind: shares.kind,
        status: shares.status,
        username: users.username,
        fields: shares.fields,
      })
      .from(shareRecipients)
      .innerJoin(shares, eq(shares.id, shareRecipients.share_id))
      .innerJoin(users, eq(users.id, shares.owner_id))
      .where(and(eq(shareRecipients.user_id, ctx.userId), inArray(shareRecipients.id, recipientIds)));
    const byRecipient = new Map(meta.map((row) => [row.recipientId, row]));
    return rows.map((row) => {
      const found = row.share_recipient_id ? byRecipient.get(row.share_recipient_id) : undefined;
      if (!found) return { ...row, share: null };
      const fields = (found.fields ?? {}) as { show_owner_name?: boolean };
      return {
        ...row,
        share: {
          id: found.shareId,
          from_username: fields.show_owner_name === false ? null : found.username,
          kind: found.kind,
          item_count: 1,
          revoked: found.status === "revoked",
        },
      };
    });
  });
}

export async function getInbox(ctx: ServiceContext, id: string): Promise<InboxRow> {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(inbox)
      .where(and(eq(inbox.id, id), eq(inbox.owner_id, ctx.userId)))
      .limit(1);
    if (!row) throw notFound("收件箱条目不存在");
    return row;
  });
}

export async function countPendingInbox(ctx: ServiceContext): Promise<number> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({ id: inbox.id })
      .from(inbox)
      .where(and(eq(inbox.owner_id, ctx.userId), eq(inbox.status, "pending")));
    return rows.length;
  });
}

export async function describeInbox(ctx: ServiceContext, id: string): Promise<InboxParseResult> {
  const row = await getInbox(ctx, id);
  const { text } = parseInputPrefix(row.raw_text);
  const stored = row.parsed ?? fallbackDraft(text);
  const index = await getPeopleIndex(ctx);
  if (row.source === "share") {
    const candidates = stored.intent === "query" ? [] : await candidatesFor(ctx, stored, text, index, row.share_item_id);
    return { inbox: row, draft: stored, candidates, error: row.error };
  }
  const draft = { ...stored, tags: await withTenant(ctx, (tx) => canonicalizeTagInputs(ctx, stored.tags, tx)) };
  const candidates = draft.intent === "query" ? [] : await candidatesFor(ctx, draft, text, index);
  return { inbox: row, draft, candidates, error: row.error };
}

export async function createAndParseInbox(
  ctx: ServiceContext,
  input: InboxCreateInput | InboxImageCreateInput,
  image?: ImagePayload,
): Promise<InboxParseResult> {
  if (input.source === "share") throw badRequest("不能直接创建分享条目");
  const settings = await getPrivacySettings(ctx.userId);
  let rawText = input.raw_text;
  if (image) {
    if (!settings.vision_enabled) throw new ApiError(400, "vision_disabled", "已关闭图片识别");
    const visionQuota = await consumeQuota(ctx.userId, "vision");
    if (!visionQuota.ok) throw new ApiError(429, "quota_exceeded", "今日图片识别次数已用完，可以改成手工填写");
    let caption: string | null = null;
    try {
      caption = await describeImage(image);
    } catch (error) {
      if (!input.raw_text.trim()) {
        const message = error instanceof Error ? error.message : "图片识别失败";
        throw badRequest(message, "vision_failed");
      }
      console.error("[inbox] image read failed, continuing with the typed text:", error);
    }
    rawText = composeImageText(input.raw_text, caption);
  }
  if (!rawText.trim()) throw badRequest("请输入一句话，或上传一张图片");

  const [row] = await withTenant(ctx, (tx) =>
    tx.insert(inbox).values({ owner_id: ctx.userId, raw_text: rawText, source: input.source }).returning(),
  );
  return parseInboxRow(ctx, row, input.person_id, settings);
}

export async function reparseInbox(ctx: ServiceContext, id: string): Promise<InboxParseResult> {
  const row = await getInbox(ctx, id);
  if (row.status !== "pending") throw conflict("只有待处理的条目可以重新解析");
  if (row.source === "share") throw badRequest("分享条目按当时的快照收录，不用重新解析");
  const settings = await getPrivacySettings(ctx.userId);
  return parseInboxRow(ctx, row, undefined, settings);
}

async function candidatesFor(
  ctx: ServiceContext,
  draft: Draft,
  text: string,
  index: PeopleIndexEntry[],
  shareItemId?: string | null,
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
  const extraIds = await withTenant(ctx, async (tx) => {
    const ownedRows = await tx
      .select({ id: people.id, contacts: people.contacts, sourceShareItemId: people.source_share_item_id })
      .from(people)
      .where(eq(people.owner_id, ctx.userId));
    return [
      ...matchingContactPersonIds(ownedRows, draft.person.contacts),
      ...matchingShareItemPersonIds(ownedRows, shareItemId),
    ];
  });
  for (const id of extraIds) ids.add(id);
  const picked = [...ids].slice(0, MAX_CANDIDATES);
  if (picked.length === 0) return [];
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: people.id,
        name: people.name,
        tier: people.tier,
        location: people.location,
        summary: people.summary,
      })
      .from(people)
      .where(and(eq(people.owner_id, ctx.userId), inArray(people.id, picked)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return picked.map((id) => byId.get(id)).filter((c): c is Candidate => Boolean(c));
  });
}

function restoreDraft(draft: Draft, replacements: readonly Redaction[]): Draft {
  const json = restorePlaceholders(JSON.stringify(draft), replacements);
  const parsed = JSON.parse(json) as Draft;
  return {
    ...parsed,
    person: { ...parsed.person, contacts: mergeRedactedContacts(parsed.person.contacts, replacements) },
  };
}

async function parseInboxRow(
  ctx: ServiceContext,
  row: InboxRow,
  personHint: string | undefined,
  settings: { llm_enabled: boolean; redact_contacts: boolean },
): Promise<InboxParseResult> {
  const { text, forcedIntent } = parseInputPrefix(row.raw_text);
  const [index, vocabulary] = await Promise.all([getPeopleIndex(ctx), listTags(ctx)]);
  const redacted = settings.redact_contacts ? redactContacts(text) : { text, replacements: [] as Redaction[] };
  const redactedIndex = settings.redact_contacts
    ? index.map((entry) => ({ ...entry, summary_line: redactContacts(entry.summary_line).text }))
    : index;

  const options: ExtractOptions = {
    forcedIntent,
    tagVocabulary: vocabulary.map((t) => ({ name: t.name, kind: t.kind })),
  };
  if (personHint && index.some((p) => p.id === personHint)) {
    options.forcedIntent = "update";
    options.targetPersonId = personHint;
  }

  let draft: Draft;
  let error: string | null = null;
  if (!settings.llm_enabled) {
    draft = fallbackDraft(text);
    error = "已关闭模型，请手工填写";
    if (options.targetPersonId) {
      draft = { ...draft, intent: "update", target_person_id: options.targetPersonId, target_confidence: 1 };
    }
  } else {
    const quota = await consumeQuota(ctx.userId, "extract");
    if (!quota.ok) throw new ApiError(429, "quota_exceeded", "今日抽取次数已用完，请手工填写后再入库");
    try {
      draft = await extract(redacted.text, redactedIndex, options);
      if (settings.redact_contacts) draft = restoreDraft(draft, redacted.replacements);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      draft = fallbackDraft(text);
      if (options.targetPersonId) {
        draft = { ...draft, intent: "update", target_person_id: options.targetPersonId, target_confidence: 1 };
      }
    }
  }
  if (draft.intent !== "query") {
    draft = { ...draft, tags: await withTenant(ctx, (tx) => canonicalizeTagInputs(ctx, draft.tags, tx)) };
  }

  if (draft.intent === "query") {
    const results = await searchPeople(ctx, { q: text, limit: 20 });
    const [updated] = await withTenant(ctx, (tx) =>
      tx
        .update(inbox)
        .set({ intent: "query", parsed: draft, error: null, status: "discarded", applied_at: new Date() })
        .where(and(eq(inbox.id, row.id), eq(inbox.owner_id, ctx.userId)))
        .returning(),
    );
    return { inbox: updated, draft, candidates: [], results, error: null };
  }

  const candidates = await candidatesFor(ctx, draft, text, index);
  const [updated] = await withTenant(ctx, (tx) =>
    tx
      .update(inbox)
      .set({ intent: error ? "unknown" : draft.intent, parsed: draft, error })
      .where(and(eq(inbox.id, row.id), eq(inbox.owner_id, ctx.userId)))
      .returning(),
  );
  return { inbox: updated, draft, candidates, error };
}

export async function applyInbox(
  ctx: ServiceContext,
  id: string,
  draft: Draft,
): Promise<{ inbox: InboxRow; person: PersonDetail }> {
  const row = await getInbox(ctx, id);
  if (row.status !== "pending") throw conflict("这条记录已经处理过了");
  if (draft.intent === "query") throw badRequest("查询不能入库", "invalid_intent");

  const isUpdate = draft.intent === "update" && Boolean(draft.target_person_id);
  const personId = await withTenant(ctx, async (tx) => {
    const fork = await shareFork(ctx, row, tx);
    let targetId: string;
    if (isUpdate) {
      targetId = draft.target_person_id as string;
      const existing = await getPersonRow(ctx, targetId, tx);
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
          ...(p.location ? resolveGeo(existing, { location: p.location }) : {}),
          updated_at: new Date(),
        })
        .where(and(eq(people.id, targetId), eq(people.owner_id, ctx.userId)));
      if (row.source === "share" && draft.tags.length > 0) await upsertTags(ctx, draft.tags, tx);
      if (draft.tags.length > 0) await addPersonTags(ctx, targetId, draft.tags, tx);
      if (fork) {
        await tx
          .update(people)
          .set({ source: fork.source, source_share_item_id: fork.source_share_item_id })
          .where(and(eq(people.id, targetId), eq(people.owner_id, ctx.userId)));
      }
    } else {
      const name = draft.person.name?.trim();
      if (!name) throw badRequest("请填写姓名再入库", "validation_error");
      const p = draft.person;
      const [created] = await tx
        .insert(people)
        .values({
          owner_id: ctx.userId,
          name,
          gender: p.gender ?? "unknown",
          location: p.location,
          tier: p.tier ?? "known_of",
          summary: p.summary,
          impression: p.impression,
          contacts: p.contacts ?? {},
          how_met: p.how_met,
          met_at: p.met_at,
          source: fork?.source,
          source_share_item_id: fork?.source_share_item_id,
          ...initialGeo({ location: p.location }),
        })
        .returning({ id: people.id });
      targetId = created.id;
      if (row.source === "share" && draft.tags.length > 0) await upsertTags(ctx, draft.tags, tx);
      if (draft.tags.length > 0) await replacePersonTags(ctx, targetId, draft.tags, tx);
    }

    for (const event of draft.events) await insertEvent(ctx, targetId, event, tx);
    if (draft.events.length > 0) await recomputeLastContact(ctx, targetId, tx);

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
      .where(and(eq(inbox.id, id), eq(inbox.owner_id, ctx.userId)));
    if (fork) await markShareAccepted(ctx, row.share_recipient_id as string, tx);
    return { targetId, shareId: fork?.shareId ?? null };
  });

  if (personId.shareId) {
    await audit({
      actorUserId: ctx.userId,
      action: "share.accepted",
      targetType: "share",
      targetId: personId.shareId,
    });
  }
  try {
    await refreshPersonEmbedding(ctx, personId.targetId);
  } finally {
    if (!isUpdate) await ensureFollowUpPlan(ctx, personId.targetId);
  }
  const [updatedInbox, person] = await Promise.all([getInbox(ctx, id), getPersonDetail(ctx, personId.targetId)]);
  return { inbox: updatedInbox, person };
}

export async function discardInbox(ctx: ServiceContext, id: string): Promise<InboxRow> {
  const row = await getInbox(ctx, id);
  if (row.status !== "pending") throw conflict("这条记录已经处理过了");
  let shareId: string | null = null;
  const [updated] = await withTenant(ctx, async (tx) => {
    const rows = await tx
      .update(inbox)
      .set({ status: "discarded", applied_at: new Date() })
      .where(and(eq(inbox.id, id), eq(inbox.owner_id, ctx.userId)))
      .returning();
    shareId = await noteShareDiscarded(ctx, row, tx);
    return rows;
  });
  if (shareId) {
    await audit({ actorUserId: ctx.userId, action: "share.ignored", targetType: "share", targetId: shareId });
  }
  return updated;
}

async function shareFork(ctx: ServiceContext, row: InboxRow, tx: Parameters<typeof markShareAccepted>[2]) {
  if (row.source !== "share" || !row.share_recipient_id) return null;
  const [found] = await tx
    .select({
      shareId: shares.id,
      status: shares.status,
      ownerId: shares.owner_id,
      username: users.username,
      sharedAt: shares.created_at,
    })
    .from(shareRecipients)
    .innerJoin(shares, eq(shares.id, shareRecipients.share_id))
    .innerJoin(users, eq(users.id, shares.owner_id))
    .where(and(eq(shareRecipients.id, row.share_recipient_id), eq(shareRecipients.user_id, ctx.userId)))
    .limit(1);
  if (!found) return null;
  if (found.status === "revoked") throw conflict("分享已撤销");
  return {
    shareId: found.shareId,
    source_share_item_id: row.share_item_id,
    source: {
      kind: "share",
      share_id: found.shareId,
      share_item_id: row.share_item_id,
      from_user_id: found.ownerId,
      from_username: found.username,
      shared_at: found.sharedAt.toISOString(),
      accepted_at: new Date().toISOString(),
    },
  };
}

export async function applyShareGroup(ctx: ServiceContext, shareId: string): Promise<{ applied: number }> {
  const pending = await listInbox(ctx, { status: "pending", limit: 200 });
  const mine = pending.filter((row) => row.share?.id === shareId && row.parsed);
  for (const row of mine) {
    if (!row.parsed) continue;
    await applyInbox(ctx, row.id, row.parsed);
  }
  return { applied: mine.length };
}
