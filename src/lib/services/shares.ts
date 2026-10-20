import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import {
  inbox,
  people,
  peopleTags,
  shareItems,
  shareLinks,
  shareRecipients,
  shares,
  tags,
  users,
  type InboxRow,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { getPrivacySettings } from "@/lib/auth/settings";
import { sendMail } from "@/lib/mail/send";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import type { ServiceContext } from "@/lib/auth/context";
import { sha256Hex } from "@/lib/auth/pat";
import { withShareToken, withTenant, withUserAndShareToken } from "@/lib/auth/tenant";
import { draftFromSnapshot, shareRawText } from "@/lib/shares/draft-from-snapshot";
import {
  assertPasscodeShape,
  decideLinkAccess,
  generateShareToken,
  hashPasscode,
  linkExpiresAt,
  verifyPasscode,
  type LinkExpiryDays,
} from "@/lib/shares/link";
import {
  buildShareSnapshot,
  normalizeShareFields,
  type ShareFields,
  type ShareSnapshot,
  type SnapshotPerson,
} from "@/lib/shares/snapshot";
import type { ShareCreateInput, ShareLinkInputSchema } from "@/lib/schemas/share";
import type { z } from "zod";

import type { DbClient } from "./db-client";
import { getPersonDetail, type PersonDetail } from "./people";

type RequestMeta = { ip?: string | null; userAgent?: string | null };
type LinkInput = z.infer<typeof ShareLinkInputSchema>;

const shareGone = () => new ApiError(410, "share_gone", "分享链接已失效");
const passcodeRequired = (message = "需要口令") => new ApiError(401, "share_passcode_required", message);

function member(userId: string): ServiceContext {
  return { userId, role: "member", via: "session" };
}

function asSnapshot(value: unknown): ShareSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as ShareSnapshot;
  if (row.version !== 1 || typeof row.name !== "string") return null;
  return row;
}

function asFields(value: unknown): ShareFields {
  return normalizeShareFields(value as Partial<ShareFields> | null);
}

function toSource(person: PersonDetail): SnapshotPerson {
  return {
    name: person.name,
    gender: person.gender,
    location: person.location,
    tags: person.tags.map((tag) => ({ name: tag.name, kind: tag.kind })),
    how_met: person.how_met,
    met_at: person.met_at,
    summary: person.summary,
    impression: person.impression,
    contacts: person.contacts ?? {},
    events: person.events.map((event) => ({
      kind: event.kind,
      content: event.content,
      happened_at: String(event.happened_at).slice(0, 10),
    })),
    tier: person.tier,
    lat: person.lat,
    lng: person.lng,
  };
}

function parseRecipient(raw: string): { kind: "email" | "username"; value: string } {
  const text = raw.trim();
  if (text.includes("@") && !text.startsWith("@")) return { kind: "email", value: text.toLowerCase() };
  const name = text.replace(/^@/, "").trim();
  if (!name || name.includes(" ")) throw badRequest("请输入 @用户名 或邮箱");
  return { kind: "username", value: name.toLowerCase() };
}

function bitsFromSnapshot(snapshot: ShareSnapshot): string[] {
  return [snapshot.summary, snapshot.location, ...(snapshot.tags ?? []).map((tag) => tag.name)].filter(
    (bit): bit is string => Boolean(bit),
  );
}

async function loadCirclePersonIds(ctx: ServiceContext, tagId: string): Promise<string[]> {
  return withTenant(ctx, async (tx) => {
    const [tag] = await tx
      .select({ id: tags.id, kind: tags.kind })
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.owner_id, ctx.userId)))
      .limit(1);
    if (!tag || tag.kind !== "circle") throw notFound("这个圈子不存在");
    const rows = await tx
      .select({ id: people.id })
      .from(people)
      .where(
        and(
          eq(people.owner_id, ctx.userId),
          or(
            eq(people.primary_circle_tag_id, tagId),
            sql`exists (select 1 from ${peopleTags} pt where pt.person_id = ${people.id} and pt.tag_id = ${tagId})`,
          ),
        ),
      );
    return [...new Set(rows.map((row) => row.id))];
  });
}

async function resolvePeople(ctx: ServiceContext, input: ShareCreateInput): Promise<{ ids: string[]; personId: string | null; circleId: string | null }> {
  if (input.kind === "person") {
    if (!input.person_id) throw badRequest("请选择要分享的人");
    await getPersonDetail(ctx, input.person_id);
    return { ids: [input.person_id], personId: input.person_id, circleId: null };
  }
  if (!input.circle_tag_id) throw badRequest("请选择要分享的圈子");
  const ids = await loadCirclePersonIds(ctx, input.circle_tag_id);
  if (ids.length === 0) throw badRequest("这个圈子里还没有人");
  return { ids, personId: null, circleId: input.circle_tag_id };
}

type ResolvedUser = { id: string; username: string | null; email: string };

async function resolveRecipients(ctx: ServiceContext, tx: DbClient, raws: string[]): Promise<ResolvedUser[]> {
  const found: ResolvedUser[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const parsed = parseRecipient(raw);
    const [user] = await tx
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        status: users.status,
        banned: users.banned,
      })
      .from(users)
      .where(
        parsed.kind === "email"
          ? sql`lower(${users.email}) = ${parsed.value}`
          : sql`lower(${users.username}) = ${parsed.value}`,
      )
      .limit(1);
    if (!user || user.status !== "active" || user.banned) throw badRequest("没有找到这个用户");
    if (user.id === ctx.userId) throw badRequest("不能分享给自己");
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    found.push({ id: user.id, username: user.username, email: user.email });
  }
  return found;
}

async function ownerLabel(tx: DbClient, userId: string): Promise<string | null> {
  const [row] = await tx.select({ username: users.username, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.username || row?.name || null;
}

async function deliverInbox(input: {
  recipientUserId: string;
  recipientId: string;
  fromUsername: string | null;
  showOwner: boolean;
  message: string | null;
  items: Array<{ id: string; snapshot: ShareSnapshot }>;
}): Promise<string[]> {
  const ids: string[] = [];
  await withTenant(member(input.recipientUserId), async (tx) => {
    for (const item of input.items) {
      const draft = draftFromSnapshot(item.snapshot, input.showOwner ? input.fromUsername : null);
      const [row] = await tx
        .insert(inbox)
        .values({
          owner_id: input.recipientUserId,
          raw_text: shareRawText({
            fromUsername: input.fromUsername,
            showOwner: input.showOwner,
            name: item.snapshot.name,
            bits: bitsFromSnapshot(item.snapshot),
            message: input.message,
          }),
          source: "share",
          status: "pending",
          intent: "add",
          parsed: draft,
          share_recipient_id: input.recipientId,
          share_item_id: item.id,
        })
        .returning({ id: inbox.id });
      ids.push(row.id);
    }
  });
  return ids;
}

function linkRow(shareId: string, ownerId: string, link: LinkInput | undefined, now: Date) {
  if (!link) return null;
  let passcode: string | null = null;
  try {
    passcode = assertPasscodeShape(link.passcode ?? null);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "口令不正确");
  }
  const days = (link.expires_in_days ?? 7) as LinkExpiryDays;
  const token = generateShareToken();
  return {
    token: token.token,
    values: {
      share_id: shareId,
      owner_id: ownerId,
      token_hash: token.hash,
      passcode_hash: passcode ? hashPasscode(passcode) : null,
      expires_at: linkExpiresAt(days, now),
      max_views: link.max_views ?? null,
    },
  };
}

export async function createShare(ctx: ServiceContext, input: ShareCreateInput, meta: RequestMeta = {}) {
  const fields = normalizeShareFields(input.fields);
  if (fields.impression && input.fields?.confirm_impression !== true) {
    throw badRequest("分享印象需要再次确认", "impression_confirmation_required");
  }
  const recipients = input.recipients ?? [];
  if (recipients.length === 0 && !input.link) throw badRequest("请填写接收人，或生成一条链接");
  const target = await resolvePeople(ctx, input);
  const details = await Promise.all(target.ids.map((id) => getPersonDetail(ctx, id)));
  const snapshots = details.map((person) => ({ personId: person.id, snapshot: buildShareSnapshot(toSource(person), fields) }));
  const now = new Date();

  const created = await withTenant(ctx, async (tx) => {
    const peopleUsers = await resolveRecipients(ctx, tx, recipients);
    const fromUsername = await ownerLabel(tx, ctx.userId);
    const [share] = await tx
      .insert(shares)
      .values({
        owner_id: ctx.userId,
        kind: input.kind,
        person_id: target.personId,
        circle_tag_id: target.circleId,
        fields,
        message: input.message?.trim() || null,
        status: "active",
      })
      .returning();
    const items = await tx
      .insert(shareItems)
      .values(snapshots.map((row) => ({ share_id: share.id, owner_id: ctx.userId, person_id: row.personId, snapshot: row.snapshot })))
      .returning();
    const recipientRows =
      peopleUsers.length === 0
        ? []
        : await tx
            .insert(shareRecipients)
            .values(peopleUsers.map((user) => ({ share_id: share.id, owner_id: ctx.userId, user_id: user.id, via: "direct" as const })))
            .returning();
    const link = linkRow(share.id, ctx.userId, input.link, now);
    const [storedLink] = link
      ? await tx.insert(shareLinks).values(link.values).returning({
          id: shareLinks.id,
          expires_at: shareLinks.expires_at,
          max_views: shareLinks.max_views,
        })
      : [undefined];
    return { share, items, recipientRows, peopleUsers, fromUsername, linkToken: link?.token ?? null, storedLink };
  });

  const itemPayload = created.items.flatMap((item) => {
    const snapshot = asSnapshot(item.snapshot);
    return snapshot ? [{ id: item.id, snapshot }] : [];
  });
  for (let index = 0; index < created.recipientRows.length; index += 1) {
    const recipient = created.recipientRows[index];
    await deliverInbox({
      recipientUserId: recipient.user_id,
      recipientId: recipient.id,
      fromUsername: created.fromUsername,
      showOwner: fields.show_owner_name,
      message: created.share.message,
      items: itemPayload,
    });
  }

  await audit({
    actorUserId: ctx.userId,
    action: "share.created",
    targetType: "share",
    targetId: created.share.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { kind: input.kind, recipients: created.recipientRows.length, items: created.items.length },
  });
  const home = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  const who = created.fromUsername ? `@${created.fromUsername}` : "有人";
  for (const user of created.peopleUsers) {
    const privacy = await getPrivacySettings(user.id);
    if (!privacy.notify_share_email) continue;
    await sendMail({
      to: user.email,
      subject: "有人分享了一条人脉给你",
      text: `${who} 分享了一条人脉给你。\n${home}/shared\n`,
    });
  }

  return {
    share: created.share,
    recipients: created.recipientRows.map((row, index) => ({
      ...row,
      username: created.peopleUsers[index]?.username ?? null,
    })),
    link: created.storedLink && created.linkToken
      ? { ...created.storedLink, url: shareUrl(created.linkToken), token: created.linkToken }
      : undefined,
  };
}

function shareUrl(token: string): string {
  const base = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
  return `${base}/s/${token}`;
}

export async function listSentShares(ctx: ServiceContext) {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.select().from(shares).where(eq(shares.owner_id, ctx.userId)).orderBy(desc(shares.created_at));
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const recipients = await tx.select().from(shareRecipients).where(inArray(shareRecipients.share_id, ids));
    const userIds = [...new Set(recipients.map((row) => row.user_id))];
    const accounts =
      userIds.length === 0
        ? []
        : await tx.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, userIds));
    const names = new Map(accounts.map((row) => [row.id, row.username]));
    const links = await tx.select().from(shareLinks).where(inArray(shareLinks.share_id, ids));
    const itemCounts = await tx
      .select({ share_id: shareItems.share_id, id: shareItems.id })
      .from(shareItems)
      .where(inArray(shareItems.share_id, ids));
    return rows.map((share) => ({
      ...share,
      recipients: recipients
        .filter((row) => row.share_id === share.id)
        .map((row) => ({ ...row, username: names.get(row.user_id) ?? null })),
      links: links
        .filter((row) => row.share_id === share.id)
        .map((row) => ({
          id: row.id,
          expires_at: row.expires_at,
          max_views: row.max_views,
          view_count: row.view_count,
          revoked_at: row.revoked_at,
          has_passcode: Boolean(row.passcode_hash),
        })),
      item_count: itemCounts.filter((row) => row.share_id === share.id).length,
      accepted_count: recipients.filter((row) => row.share_id === share.id && row.status === "accepted").length,
    }));
  });
}

export async function getSentShare(ctx: ServiceContext, id: string) {
  const rows = await listSentShares(ctx);
  const share = rows.find((row) => row.id === id);
  if (!share) throw notFound("分享不存在");
  const items = await withTenant(ctx, (tx) => tx.select().from(shareItems).where(eq(shareItems.share_id, id)));
  return { ...share, items };
}

export async function listReceivedShares(ctx: ServiceContext) {
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        recipient: shareRecipients,
        share: shares,
        username: users.username,
      })
      .from(shareRecipients)
      .innerJoin(shares, eq(shares.id, shareRecipients.share_id))
      .innerJoin(users, eq(users.id, shares.owner_id))
      .where(eq(shareRecipients.user_id, ctx.userId))
      .orderBy(desc(shareRecipients.created_at));
    const recipientIds = rows.map((row) => row.recipient.id);
    const inboxRows =
      recipientIds.length === 0
        ? []
        : await tx
            .select({
              id: inbox.id,
              status: inbox.status,
              share_recipient_id: inbox.share_recipient_id,
              error: inbox.error,
            })
            .from(inbox)
            .where(and(eq(inbox.owner_id, ctx.userId), inArray(inbox.share_recipient_id, recipientIds)));
    return rows.map((row) => ({
      id: row.share.id,
      kind: row.share.kind,
      status: row.share.status,
      message: row.share.status === "revoked" ? null : row.share.message,
      created_at: row.share.created_at,
      from_username: asFields(row.share.fields).show_owner_name ? row.username : null,
      recipient_status: row.recipient.status,
      inbox: inboxRows.filter((item) => item.share_recipient_id === row.recipient.id),
    }));
  });
}

async function ownedShare(ctx: ServiceContext, tx: DbClient, id: string) {
  const [share] = await tx.select().from(shares).where(and(eq(shares.id, id), eq(shares.owner_id, ctx.userId))).limit(1);
  if (!share) throw notFound("分享不存在");
  return share;
}

export async function refreshShare(ctx: ServiceContext, id: string, meta: RequestMeta = {}) {
  const share = await withTenant(ctx, (tx) => ownedShare(ctx, tx, id));
  if (share.status !== "active") throw badRequest("已撤销的分享不能刷新");
  const fields = asFields(share.fields);
  const ids = share.kind === "person"
    ? share.person_id
      ? [share.person_id]
      : []
    : share.circle_tag_id
      ? await loadCirclePersonIds(ctx, share.circle_tag_id)
      : [];
  const details = await Promise.all(ids.map((personId) => getPersonDetail(ctx, personId).catch(() => null)));
  const live = details.filter((person): person is PersonDetail => Boolean(person));
  const snapshots = new Map(live.map((person) => [person.id, buildShareSnapshot(toSource(person), fields)]));

  const written = await withTenant(ctx, async (tx) => {
    const existing = await tx.select().from(shareItems).where(eq(shareItems.share_id, id));
    const fromUsername = await ownerLabel(tx, ctx.userId);
    const kept = new Set<string>();
    for (const item of existing) {
      const next = item.person_id ? snapshots.get(item.person_id) : undefined;
      if (!next) {
        await tx.delete(shareItems).where(eq(shareItems.id, item.id));
        continue;
      }
      kept.add(item.person_id as string);
      await tx
        .update(shareItems)
        .set({ snapshot: next, snapshot_at: new Date(), purged_at: null })
        .where(eq(shareItems.id, item.id));
    }
    const fresh = [...snapshots.entries()].filter(([personId]) => !kept.has(personId));
    if (fresh.length > 0) {
      await tx
        .insert(shareItems)
        .values(fresh.map(([personId, snapshot]) => ({ share_id: id, owner_id: ctx.userId, person_id: personId, snapshot })));
    }
    await tx.update(shares).set({ refreshed_at: new Date() }).where(eq(shares.id, id));
    const recipients = await tx
      .select()
      .from(shareRecipients)
      .where(and(eq(shareRecipients.share_id, id), inArray(shareRecipients.status, ["pending", "accepted"])));
    const items = await tx.select().from(shareItems).where(eq(shareItems.share_id, id));
    return {
      fromUsername,
      recipients,
      items: items.flatMap((item) => {
        const snapshot = asSnapshot(item.snapshot);
        return snapshot ? [{ id: item.id, snapshot }] : [];
      }),
    };
  });

  for (const recipient of written.recipients) {
    await withTenant(member(recipient.user_id), async (tx) => {
      const pending = await tx
        .select()
        .from(inbox)
        .where(and(eq(inbox.owner_id, recipient.user_id), eq(inbox.share_recipient_id, recipient.id), eq(inbox.status, "pending")));
      const seen = new Set(pending.map((row) => row.share_item_id));
      for (const row of pending) {
        const item = written.items.find((candidate) => candidate.id === row.share_item_id);
        if (!item) {
          await tx
            .update(inbox)
            .set({ status: "discarded", error: "分享已更新", applied_at: new Date() })
            .where(eq(inbox.id, row.id));
          continue;
        }
        await tx
          .update(inbox)
          .set({
            parsed: draftFromSnapshot(item.snapshot, fields.show_owner_name ? written.fromUsername : null),
            raw_text: shareRawText({
              fromUsername: written.fromUsername,
              showOwner: fields.show_owner_name,
              name: item.snapshot.name,
              bits: bitsFromSnapshot(item.snapshot),
              message: share.message,
            }),
          })
          .where(eq(inbox.id, row.id));
      }
      for (const item of written.items) {
        if (seen.has(item.id)) continue;
        const draft = draftFromSnapshot(item.snapshot, fields.show_owner_name ? written.fromUsername : null);
        await tx.insert(inbox).values({
          owner_id: recipient.user_id,
          raw_text: shareRawText({
            fromUsername: written.fromUsername,
            showOwner: fields.show_owner_name,
            name: item.snapshot.name,
            bits: bitsFromSnapshot(item.snapshot),
            message: share.message,
          }),
          source: "share",
          status: "pending",
          intent: "add",
          parsed: draft,
          share_recipient_id: recipient.id,
          share_item_id: item.id,
        });
      }
    });
  }

  await audit({
    actorUserId: ctx.userId,
    action: "share.refreshed",
    targetType: "share",
    targetId: id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { items: written.items.length },
  });
  return getSentShare(ctx, id);
}

export async function revokeShare(ctx: ServiceContext, id: string, meta: RequestMeta = {}) {
  const result = await withTenant(ctx, async (tx) => {
    const share = await ownedShare(ctx, tx, id);
    if (share.status === "revoked") return { accepted: 0, recipients: [] as { id: string; user_id: string }[] };
    const recipients = await tx.select().from(shareRecipients).where(eq(shareRecipients.share_id, id));
    await tx.update(shares).set({ status: "revoked", revoked_at: new Date() }).where(eq(shares.id, id));
    await tx.update(shareItems).set({ snapshot: null, purged_at: new Date() }).where(eq(shareItems.share_id, id));
    await tx.update(shareLinks).set({ revoked_at: new Date() }).where(and(eq(shareLinks.share_id, id), sql`${shareLinks.revoked_at} is null`));
    return {
      accepted: recipients.filter((row) => row.status === "accepted").length,
      recipients: recipients.map((row) => ({ id: row.id, user_id: row.user_id })),
    };
  });

  for (const recipient of result.recipients) {
    await withTenant(member(recipient.user_id), (tx) =>
      tx
        .update(inbox)
        .set({ status: "discarded", error: "分享已撤销", applied_at: new Date() })
        .where(and(eq(inbox.owner_id, recipient.user_id), eq(inbox.share_recipient_id, recipient.id), eq(inbox.status, "pending"))),
    );
  }

  await audit({
    actorUserId: ctx.userId,
    action: "share.revoked",
    targetType: "share",
    targetId: id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { accepted_copies: result.accepted },
  });
  return { accepted_count: result.accepted };
}

export async function createShareLink(ctx: ServiceContext, shareId: string, input: LinkInput, meta: RequestMeta = {}) {
  const now = new Date();
  const created = await withTenant(ctx, async (tx) => {
    const share = await ownedShare(ctx, tx, shareId);
    if (share.status !== "active") throw badRequest("已撤销的分享不能再建链接");
    const link = linkRow(shareId, share.owner_id, input, now);
    if (!link) throw badRequest("请设置链接有效期");
    const [row] = await tx.insert(shareLinks).values(link.values).returning({
      id: shareLinks.id,
      expires_at: shareLinks.expires_at,
      max_views: shareLinks.max_views,
    });
    return { row, token: link.token };
  });
  await audit({
    actorUserId: ctx.userId,
    action: "share.link.created",
    targetType: "share_link",
    targetId: created.row.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { ...created.row, url: shareUrl(created.token), token: created.token };
}

export async function revokeShareLink(ctx: ServiceContext, shareId: string, linkId: string, meta: RequestMeta = {}) {
  await withTenant(ctx, async (tx) => {
    await ownedShare(ctx, tx, shareId);
    const [link] = await tx
      .select({ id: shareLinks.id })
      .from(shareLinks)
      .where(and(eq(shareLinks.id, linkId), eq(shareLinks.share_id, shareId)))
      .limit(1);
    if (!link) throw notFound("链接不存在");
    await tx.update(shareLinks).set({ revoked_at: new Date() }).where(eq(shareLinks.id, linkId));
  });
  await audit({
    actorUserId: ctx.userId,
    action: "share.link.revoked",
    targetType: "share_link",
    targetId: linkId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

async function loadLink(token: string, tx: DbClient) {
  const hash = sha256Hex(token);
  const [link] = await tx.select().from(shareLinks).where(eq(shareLinks.token_hash, hash)).limit(1);
  if (!link) throw shareGone();
  const [share] = await tx.select().from(shares).where(eq(shares.id, link.share_id)).limit(1);
  if (!share || share.status !== "active") throw shareGone();
  return { link, share, hash };
}

export async function readPublicShare(token: string, unlocked: boolean, meta: RequestMeta = {}, now = new Date()) {
  const hash = sha256Hex(token);
  const payload = await withShareToken(hash, async (tx) => {
    const loaded = await loadLink(token, tx);
    const decision = decideLinkAccess({
      revokedAt: loaded.link.revoked_at,
      expiresAt: loaded.link.expires_at,
      maxViews: loaded.link.max_views,
      viewCount: loaded.link.view_count,
      passcodeHash: loaded.link.passcode_hash,
      passcodeFailures: loaded.link.passcode_failures,
      unlocked,
      now,
    });
    if (!decision.ok) {
      if (decision.code === "share_passcode_required") throw passcodeRequired();
      throw shareGone();
    }
    await tx
      .update(shareLinks)
      .set({ view_count: loaded.link.view_count + 1, last_viewed_at: now })
      .where(eq(shareLinks.id, loaded.link.id));
    const items = await tx.select().from(shareItems).where(eq(shareItems.share_id, loaded.share.id));
    const fields = asFields(loaded.share.fields);
    const owner = fields.show_owner_name ? await ownerLabel(tx, loaded.share.owner_id) : null;
    return {
      share: {
        kind: loaded.share.kind,
        owner_name: owner,
        message: loaded.share.message,
        expires_at: loaded.link.expires_at,
      },
      items: items.flatMap((item) => {
        const snapshot = asSnapshot(item.snapshot);
        return snapshot ? [snapshot] : [];
      }),
      shareId: loaded.share.id,
    };
  });
  await audit({
    action: "share.link.viewed",
    targetType: "share",
    targetId: payload.shareId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { share: payload.share, items: payload.items };
}

export async function unlockPublicShare(token: string, passcode: string, now = new Date()) {
  const hash = sha256Hex(token);
  await withShareToken(hash, async (tx) => {
    const loaded = await loadLink(token, tx);
    const decision = decideLinkAccess({
      revokedAt: loaded.link.revoked_at,
      expiresAt: loaded.link.expires_at,
      maxViews: loaded.link.max_views,
      viewCount: loaded.link.view_count,
      passcodeHash: loaded.link.passcode_hash,
      passcodeFailures: loaded.link.passcode_failures,
      unlocked: false,
      now,
    });
    if (!decision.ok && decision.code === "share_gone") throw shareGone();
    if (!loaded.link.passcode_hash) return;
    if (!verifyPasscode(passcode, loaded.link.passcode_hash)) {
      const failures = loaded.link.passcode_failures + 1;
      await tx
        .update(shareLinks)
        .set({
          passcode_failures: failures,
          revoked_at: failures >= 10 ? now : loaded.link.revoked_at,
        })
        .where(eq(shareLinks.id, loaded.link.id));
      if (failures >= 10) throw shareGone();
      throw passcodeRequired("口令不正确");
    }
  });
}

export async function collectPublicShare(ctx: ServiceContext, token: string, unlocked: boolean, meta: RequestMeta = {}, now = new Date()) {
  const hash = sha256Hex(token);
  const preview = await withShareToken(hash, async (tx) => {
    const loaded = await loadLink(token, tx);
    const decision = decideLinkAccess({
      revokedAt: loaded.link.revoked_at,
      expiresAt: loaded.link.expires_at,
      maxViews: loaded.link.max_views,
      viewCount: loaded.link.view_count,
      passcodeHash: loaded.link.passcode_hash,
      passcodeFailures: loaded.link.passcode_failures,
      unlocked: unlocked || !loaded.link.passcode_hash,
      now,
    });
    if (!decision.ok) {
      if (decision.code === "share_passcode_required") throw passcodeRequired();
      throw shareGone();
    }
    const items = await tx.select().from(shareItems).where(eq(shareItems.share_id, loaded.share.id));
    const fromUsername = asFields(loaded.share.fields).show_owner_name ? await ownerLabel(tx, loaded.share.owner_id) : null;
    return {
      share: loaded.share,
      fromUsername,
      items: items.flatMap((item) => {
        const snapshot = asSnapshot(item.snapshot);
        return snapshot ? [{ id: item.id, snapshot }] : [];
      }),
    };
  });

  return withUserAndShareToken(ctx, hash, async (tx) => {
    const [existing] = await tx
      .select()
      .from(shareRecipients)
      .where(and(eq(shareRecipients.share_id, preview.share.id), eq(shareRecipients.user_id, ctx.userId)))
      .limit(1);
    if (existing) {
      const rows = await tx
        .select({ id: inbox.id })
        .from(inbox)
        .where(and(eq(inbox.owner_id, ctx.userId), eq(inbox.share_recipient_id, existing.id)));
      return { inbox_ids: rows.map((row) => row.id), already: true };
    }
    if (preview.share.owner_id === ctx.userId) throw badRequest("不能收录自己发出的分享");
    const [recipient] = await tx
      .insert(shareRecipients)
      .values({ share_id: preview.share.id, owner_id: preview.share.owner_id, user_id: ctx.userId, via: "link" })
      .returning();
    const ids: string[] = [];
    const showOwner = asFields(preview.share.fields).show_owner_name;
    for (const item of preview.items) {
      const [row] = await tx
        .insert(inbox)
        .values({
          owner_id: ctx.userId,
          raw_text: shareRawText({
            fromUsername: preview.fromUsername,
            showOwner,
            name: item.snapshot.name,
            bits: bitsFromSnapshot(item.snapshot),
            message: preview.share.message,
          }),
          source: "share",
          status: "pending",
          intent: "add",
          parsed: draftFromSnapshot(item.snapshot, showOwner ? preview.fromUsername : null),
          share_recipient_id: recipient.id,
          share_item_id: item.id,
        })
        .returning({ id: inbox.id });
      ids.push(row.id);
    }
    await audit({
      actorUserId: ctx.userId,
      action: "share.link.collected",
      targetType: "share",
      targetId: preview.share.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { inbox_ids: ids, already: false };
  });
}

export async function markShareAccepted(ctx: ServiceContext, recipientId: string, client: DbClient): Promise<void> {
  await client
    .update(shareRecipients)
    .set({ status: "accepted", responded_at: new Date() })
    .where(and(eq(shareRecipients.id, recipientId), eq(shareRecipients.user_id, ctx.userId)));
}

export async function noteShareDiscarded(ctx: ServiceContext, row: InboxRow, client: DbClient): Promise<string | null> {
  if (row.source !== "share" || !row.share_recipient_id) return null;
  const [recipient] = await client
    .select()
    .from(shareRecipients)
    .where(and(eq(shareRecipients.id, row.share_recipient_id), eq(shareRecipients.user_id, ctx.userId)))
    .limit(1);
  if (!recipient || recipient.status === "accepted") return recipient?.share_id ?? null;
  const pending = await client
    .select({ id: inbox.id })
    .from(inbox)
    .where(
      and(
        eq(inbox.owner_id, ctx.userId),
        eq(inbox.share_recipient_id, recipient.id),
        eq(inbox.status, "pending"),
      ),
    );
  const stillPending = pending.filter((item) => item.id !== row.id);
  if (stillPending.length === 0) {
    await client
      .update(shareRecipients)
      .set({ status: "ignored", responded_at: new Date() })
      .where(eq(shareRecipients.id, recipient.id));
  }
  return recipient.share_id;
}

/** Used by the person page to know which contact keys can be ticked. */
export async function personSharePreview(ctx: ServiceContext, personId: string) {
  const person = await getPersonDetail(ctx, personId);
  return {
    id: person.id,
    name: person.name,
    contacts: Object.keys(person.contacts ?? {}),
    has_summary: Boolean(person.summary),
    has_impression: Boolean(person.impression),
    event_count: person.events.length,
  };
}

export async function circleSharePreview(ctx: ServiceContext, tagId: string) {
  const ids = await loadCirclePersonIds(ctx, tagId);
  return { circle_tag_id: tagId, people_count: ids.length };
}
