import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { apiTokens, events, inbox, people, peopleEmbeddings, tags } from "@/db/schema";
import { audit } from "@/lib/audit";

import { ensureUserSettings } from "./settings";
import { LEGACY_TOKEN_DAYS, LEGACY_TOKEN_NAME, allScopes, expiryFromDays, hashPat } from "./pat";

export type ClaimCounts = {
  people: number;
  tags: number;
  events: number;
  embeddings: number;
  inbox: number;
};

/** Give every still-unclaimed content row to `userId`. Idempotent. */
export async function claimUnownedContent(userId: string): Promise<ClaimCounts> {
  return db.transaction(async (tx) => {
    const peopleRows = await tx
      .update(people)
      .set({ owner_id: userId })
      .where(isNull(people.owner_id))
      .returning({ id: people.id });
    const tagRows = await tx.update(tags).set({ owner_id: userId }).where(isNull(tags.owner_id)).returning({ id: tags.id });
    const eventRows = await tx
      .update(events)
      .set({ owner_id: userId })
      .where(isNull(events.owner_id))
      .returning({ id: events.id });
    const embeddingRows = await tx
      .update(peopleEmbeddings)
      .set({ owner_id: userId })
      .where(isNull(peopleEmbeddings.owner_id))
      .returning({ person_id: peopleEmbeddings.person_id });
    const inboxRows = await tx
      .update(inbox)
      .set({ owner_id: userId })
      .where(isNull(inbox.owner_id))
      .returning({ id: inbox.id });
    return {
      people: peopleRows.length,
      tags: tagRows.length,
      events: eventRows.length,
      embeddings: embeddingRows.length,
      inbox: inboxRows.length,
    };
  });
}

/** Insert the env `API_TOKEN` as a 90-day legacy PAT if it is not already stored. */
export async function ensureLegacyPat(userId: string, now = new Date()): Promise<boolean> {
  const raw = process.env.API_TOKEN?.trim();
  if (!raw) return false;
  const hash = hashPat(raw);
  const [existing] = await db.select({ id: apiTokens.id }).from(apiTokens).where(eq(apiTokens.token_hash, hash)).limit(1);
  if (existing) return false;
  await db.insert(apiTokens).values({
    user_id: userId,
    name: LEGACY_TOKEN_NAME,
    token_prefix: raw.slice(0, 12),
    token_hash: hash,
    scopes: allScopes(),
    expires_at: expiryFromDays(LEGACY_TOKEN_DAYS, now),
    legacy: true,
  });
  console.warn("API_TOKEN is deprecated; it was migrated to a legacy personal access token that expires in 90 days.");
  return true;
}

export async function unclaimedContentCount(): Promise<number> {
  const [row] = await db.execute<{ n: number }>(sql`
    select (
      (select count(*) from people where owner_id is null) +
      (select count(*) from tags where owner_id is null) +
      (select count(*) from events where owner_id is null) +
      (select count(*) from people_embeddings where owner_id is null) +
      (select count(*) from inbox where owner_id is null)
    )::int as n
  `);
  return Number(row?.n ?? 0);
}

/** First-user bookkeeping: settings row, claim orphan rows, legacy PAT, audit. */
export async function finishNewUser(input: {
  userId: string;
  inviteCode?: string | null;
  isFirst: boolean;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<ClaimCounts | null> {
  await ensureUserSettings(input.userId);
  if (input.inviteCode) {
    const { hashInviteCode } = await import("./invite");
    const { invites } = await import("@/db/schema");
    await db
      .update(invites)
      .set({ used_by: input.userId, used_at: new Date() })
      .where(and(eq(invites.code_hash, hashInviteCode(input.inviteCode)), isNull(invites.used_at), isNull(invites.revoked_at)));
  }
  if (!input.isFirst) return null;
  const counts = await claimUnownedContent(input.userId);
  const legacy = await ensureLegacyPat(input.userId);
  await audit({
    actorUserId: input.userId,
    action: "admin.setup_completed",
    targetType: "instance",
    meta: {
      people: counts.people,
      tags: counts.tags,
      events: counts.events,
      embeddings: counts.embeddings,
      inbox: counts.inbox,
      legacy_pat: legacy,
    },
    ip: input.ip,
    userAgent: input.userAgent,
  });
  return counts;
}

export async function countUsers(): Promise<number> {
  const [row] = await db.execute<{ n: number }>(sql`select count(*)::int as n from users`);
  return Number(row?.n ?? 0);
}

/** Cached after the first positive answer. Reset in tests via `forgetUserCache`. */
let usersExist: boolean | null = null;

export async function instanceHasUsers(): Promise<boolean> {
  if (usersExist) return true;
  const n = await countUsers();
  usersExist = n > 0;
  return usersExist;
}

export function rememberUsersExist(): void {
  usersExist = true;
}

export function forgetUserCache(): void {
  usersExist = null;
}
