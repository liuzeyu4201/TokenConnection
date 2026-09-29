import { and, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { events, people, peopleTags, tags, type EventRow, type PersonRow, type TagRow } from "@/db/schema";
import { badRequest, notFound } from "@/lib/api/errors";
import { geocode } from "@/lib/geo/geocode";
import { refreshPersonEmbedding } from "@/lib/llm/embed";
import type { PeopleIndexEntry } from "@/lib/llm/types";
import { TIER_LABEL } from "@/lib/schemas/enums";
import type { PeopleQuery, PersonCreateInput, PersonUpdateInput, TagInput } from "@/lib/schemas/person";

import { likePattern, type DbClient } from "./db-client";
import { getTagsForPeople, replacePersonTags } from "./tags";

export type PersonWithTags = PersonRow & { tags: TagRow[] };
export type PersonDetail = PersonWithTags & { events: EventRow[] };

const DETAIL_EVENTS_LIMIT = 200;

// ---------------------------------------------------------------------------
// Query helpers shared with search.ts
// ---------------------------------------------------------------------------

/** `exists (...)` for "person has a tag named X" (case-insensitive). */
export function hasTagNamed(pattern: SQL | string, exact = true): SQL {
  const cmp = exact
    ? sql`lower(t.name) = lower(${pattern})`
    : sql`t.name ilike ${pattern}`;
  return sql`exists (select 1 from ${peopleTags} pt join ${tags} t on t.id = pt.tag_id where pt.person_id = ${people.id} and ${cmp})`;
}

/** Structured filters (design.md §9.2 step 1). */
export function structuredFilters(query: {
  tier?: PersonRow["tier"];
  tag?: string;
  location?: string;
}): SQL[] {
  const conditions: SQL[] = [];
  if (query.tier) conditions.push(eq(people.tier, query.tier));
  if (query.location) conditions.push(ilike(people.location, likePattern(query.location)));
  if (query.tag) conditions.push(hasTagNamed(query.tag));
  return conditions;
}

/**
 * Keyword filter (design.md §9.2 step 2): every whitespace-separated term must
 * match at least one of name / summary / impression / how_met / tag name.
 */
export function keywordFilters(q: string): SQL[] {
  return splitTerms(q).map((term) => {
    const pattern = likePattern(term);
    return or(
      ilike(people.name, pattern),
      ilike(people.summary, pattern),
      ilike(people.impression, pattern),
      ilike(people.how_met, pattern),
      // location is not in design.md §9.2's list but "深圳" typed into the
      // universal input clearly means the city too.
      ilike(people.location, pattern),
      hasTagNamed(pattern, false),
    ) as SQL;
  });
}

export function splitTerms(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function attachTags(rows: PersonRow[], client: DbClient = db): Promise<PersonWithTags[]> {
  const tagMap = await getTagsForPeople(
    rows.map((r) => r.id),
    client,
  );
  return rows.map((row) => ({ ...row, tags: tagMap.get(row.id) ?? [] }));
}

// ---------------------------------------------------------------------------
// Cursor pagination: keyset on (created_at desc, id desc)
// ---------------------------------------------------------------------------

function encodeCursor(row: PersonRow): string {
  return Buffer.from(JSON.stringify([row.created_at.toISOString(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string): { created_at: Date; id: string } | null {
  try {
    const [iso, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [string, string];
    const created_at = new Date(iso);
    if (Number.isNaN(created_at.getTime()) || typeof id !== "string") return null;
    return { created_at, id };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listPeople(
  query: PeopleQuery,
): Promise<{ items: PersonWithTags[]; next_cursor: string | null }> {
  const conditions: SQL[] = [...structuredFilters(query), ...keywordFilters(query.q ?? "")];

  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (decoded) {
      conditions.push(
        or(
          lt(people.created_at, decoded.created_at),
          and(eq(people.created_at, decoded.created_at), lt(people.id, decoded.id)),
        ) as SQL,
      );
    }
  }

  const rows = await db
    .select()
    .from(people)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(people.created_at), desc(people.id))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const items = await attachTags(page);
  return { items, next_cursor: hasMore ? encodeCursor(page[page.length - 1]) : null };
}

/** Numbered pages over the same ordering as `listPeople`; `page` is clamped to the last page. */
export async function listPeoplePage(
  query: Pick<PeopleQuery, "tier" | "tag" | "location" | "q">,
  page: number,
  pageSize: number,
): Promise<{ items: PersonWithTags[]; total: number; page: number; pageCount: number }> {
  const conditions: SQL[] = [...structuredFilters(query), ...keywordFilters(query.q ?? "")];
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(people).where(where);
  const total = countRow?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);

  const rows = await db
    .select()
    .from(people)
    .where(where)
    .orderBy(desc(people.created_at), desc(people.id))
    .limit(pageSize)
    .offset((current - 1) * pageSize);

  return { items: await attachTags(rows), total, page: current, pageCount };
}

export async function getPersonRow(id: string, client: DbClient = db): Promise<PersonRow> {
  const [row] = await client.select().from(people).where(eq(people.id, id)).limit(1);
  if (!row) throw notFound("这个人不存在");
  return row;
}

export async function getPersonWithTags(id: string): Promise<PersonWithTags> {
  const row = await getPersonRow(id);
  const [withTags] = await attachTags([row]);
  return withTags;
}

export async function getPersonDetail(id: string): Promise<PersonDetail> {
  const person = await getPersonWithTags(id);
  const personEvents = await db
    .select()
    .from(events)
    .where(eq(events.person_id, id))
    .orderBy(desc(events.happened_at), desc(events.created_at))
    .limit(DETAIL_EVENTS_LIMIT);
  return { ...person, events: personEvents };
}

export async function listRecentlyAdded(limit = 8): Promise<PersonWithTags[]> {
  const rows = await db.select().from(people).orderBy(desc(people.created_at)).limit(limit);
  return attachTags(rows);
}

export async function countPeople(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(people);
  return row?.count ?? 0;
}

/**
 * id + name + one-line summary for LLM disambiguation (design.md §9.1).
 * Summary and impression are included (capped) so that an "update" draft can
 * return a merged full sentence instead of overwriting them with a fragment.
 */
export async function getPeopleIndex(): Promise<PeopleIndexEntry[]> {
  const rows = await db
    .select({
      id: people.id,
      name: people.name,
      location: people.location,
      tier: people.tier,
      summary: people.summary,
      impression: people.impression,
    })
    .from(people)
    .orderBy(desc(people.updated_at));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    summary_line: [
      row.location,
      TIER_LABEL[row.tier],
      row.summary?.slice(0, 80),
      row.impression ? `印象：${row.impression.slice(0, 40)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Geo helpers (design.md §14.2). Coordinates come from the offline geocoder
// unless the user pinned them by hand (geo_manual).
// ---------------------------------------------------------------------------

export type GeoFields = { lat: number | null; lng: number | null; geo_manual: boolean };

/** Coordinates for a brand-new person: manual if given, else geocode the location. */
export function initialGeo(input: { location?: string | null; lat?: number | null; lng?: number | null }): GeoFields {
  if (input.lat != null && input.lng != null) return { lat: input.lat, lng: input.lng, geo_manual: true };
  const hit = geocode(input.location ?? null);
  return { lat: hit?.lat ?? null, lng: hit?.lng ?? null, geo_manual: false };
}

/**
 * Coordinates after an update:
 * - explicit lat/lng → manual pin
 * - geo_manual=false ("恢复自动") → re-geocode from the (new) location
 * - location changed and not manual → re-geocode
 * - otherwise unchanged
 */
export function resolveGeo(
  existing: Pick<PersonRow, "location" | "lat" | "lng" | "geo_manual">,
  patch: { location?: string | null; lat?: number | null; lng?: number | null; geo_manual?: boolean },
): GeoFields {
  const nextLocation = patch.location !== undefined ? patch.location : existing.location;
  if (patch.lat != null && patch.lng != null && patch.geo_manual !== false) {
    return { lat: patch.lat, lng: patch.lng, geo_manual: true };
  }
  const forceAuto = patch.geo_manual === false;
  const locationChanged = patch.location !== undefined && patch.location !== existing.location;
  if (forceAuto || (locationChanged && !existing.geo_manual) || (patch.lat === null && patch.lng === null)) {
    const hit = geocode(nextLocation);
    return { lat: hit?.lat ?? null, lng: hit?.lng ?? null, geo_manual: false };
  }
  return { lat: existing.lat, lng: existing.lng, geo_manual: existing.geo_manual };
}

/**
 * Validate a primary circle choice: the tag must be a kind=circle tag that the
 * person currently has (design.md §19 Q2).
 */
async function assertPrimaryCircle(personId: string, tagId: string, client: DbClient): Promise<void> {
  const rows = await client
    .select({ id: tags.id, kind: tags.kind })
    .from(peopleTags)
    .innerJoin(tags, eq(tags.id, peopleTags.tag_id))
    .where(and(eq(peopleTags.person_id, personId), eq(peopleTags.tag_id, tagId)))
    .limit(1);
  if (rows.length === 0) throw badRequest("主圈子必须是这个人已有的标签", "invalid_primary_circle");
  if (rows[0].kind !== "circle") throw badRequest("主圈子必须是圈子（circle）类型的标签", "invalid_primary_circle");
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createPerson(input: PersonCreateInput): Promise<PersonDetail> {
  const { tags: tagInputs, ...fields } = input;
  const geo = initialGeo(fields);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(people)
      .values({
        name: fields.name,
        gender: fields.gender,
        location: fields.location ?? null,
        tier: fields.tier,
        summary: fields.summary ?? null,
        impression: fields.impression ?? null,
        contacts: fields.contacts ?? {},
        how_met: fields.how_met ?? null,
        met_at: fields.met_at ?? null,
        ...geo,
      })
      .returning({ id: people.id });
    if (tagInputs && tagInputs.length > 0) {
      await replacePersonTags(row.id, tagInputs, tx, { strict: true });
    }
    return row.id;
  });
  await refreshPersonEmbedding(id);
  return getPersonDetail(id);
}

export async function updatePerson(id: string, input: PersonUpdateInput): Promise<PersonDetail> {
  const { tags: tagInputs, ...fields } = input;
  await db.transaction(async (tx) => {
    const existing = await getPersonRow(id, tx);
    const patch: Partial<typeof people.$inferInsert> = { updated_at: new Date() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.gender !== undefined) patch.gender = fields.gender;
    if (fields.location !== undefined) patch.location = fields.location;
    if (fields.tier !== undefined) patch.tier = fields.tier;
    if (fields.summary !== undefined) patch.summary = fields.summary;
    if (fields.impression !== undefined) patch.impression = fields.impression;
    if (fields.contacts !== undefined) patch.contacts = fields.contacts;
    if (fields.how_met !== undefined) patch.how_met = fields.how_met;
    if (fields.met_at !== undefined) patch.met_at = fields.met_at;
    if (
      fields.location !== undefined ||
      fields.lat !== undefined ||
      fields.lng !== undefined ||
      fields.geo_manual !== undefined
    ) {
      Object.assign(patch, resolveGeo(existing, fields));
    }
    await tx.update(people).set(patch).where(eq(people.id, id));
    if (tagInputs !== undefined) {
      await replacePersonTags(id, tagInputs, tx, { strict: true });
    }
    if (fields.primary_circle_tag_id !== undefined) {
      if (fields.primary_circle_tag_id) await assertPrimaryCircle(id, fields.primary_circle_tag_id, tx);
      await tx.update(people).set({ primary_circle_tag_id: fields.primary_circle_tag_id }).where(eq(people.id, id));
    }
  });
  await refreshPersonEmbedding(id);
  return getPersonDetail(id);
}

export async function deletePerson(id: string): Promise<void> {
  const deleted = await db.delete(people).where(eq(people.id, id)).returning({ id: people.id });
  if (deleted.length === 0) throw notFound("这个人不存在");
}

export async function setPersonTags(id: string, tagInputs: TagInput[]): Promise<PersonWithTags> {
  await db.transaction(async (tx) => {
    await getPersonRow(id, tx);
    await replacePersonTags(id, tagInputs, tx, { strict: true });
  });
  await refreshPersonEmbedding(id);
  return getPersonWithTags(id);
}

/** Merge helper used by inbox apply: keep existing values unless the draft has one. */
export function mergeContacts(
  existing: Record<string, string>,
  incoming: Record<string, string> | undefined,
): Record<string, string> {
  return { ...existing, ...(incoming ?? {}) };
}
