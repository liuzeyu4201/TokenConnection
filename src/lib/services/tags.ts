import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { people, peopleTags, tags, type TagRow } from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import type { TagKind } from "@/lib/schemas/enums";
import type { TagInput } from "@/lib/schemas/person";
import type { TagCreateInput, TagUpdateInput } from "@/lib/schemas/tag";

import type { DbClient } from "./db-client";

export type TagWithCount = TagRow & { people_count: number };

const KIND_ORDER: Record<TagKind, number> = { skill: 0, circle: 1, other: 2 };

export async function listTags(kind?: TagKind): Promise<TagWithCount[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      kind: tags.kind,
      people_count: sql<number>`(select count(*)::int from ${peopleTags} pt where pt.tag_id = ${tags.id})`,
    })
    .from(tags)
    .where(kind ? eq(tags.kind, kind) : undefined)
    .orderBy(asc(tags.kind), asc(tags.name));

  return rows.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      b.people_count - a.people_count ||
      a.name.localeCompare(b.name, "zh-CN"),
  );
}

export async function getTag(id: string): Promise<TagRow> {
  const [row] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  if (!row) throw notFound("标签不存在");
  return row;
}

export async function createTag(input: TagCreateInput): Promise<TagRow> {
  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.name, input.name), eq(tags.kind, input.kind)))
    .limit(1);
  if (existing.length > 0) throw conflict("同名同类型的标签已存在");
  const [row] = await db.insert(tags).values(input).returning();
  return row;
}

export async function updateTag(id: string, input: TagUpdateInput): Promise<TagRow> {
  const current = await getTag(id);
  const next = { name: input.name ?? current.name, kind: input.kind ?? current.kind };
  const duplicate = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.name, next.name), eq(tags.kind, next.kind)))
    .limit(1);
  if (duplicate.length > 0 && duplicate[0].id !== id) {
    throw conflict("同名同类型的标签已存在");
  }
  const [row] = await db.update(tags).set(next).where(eq(tags.id, id)).returning();
  // A tag that is no longer a circle cannot be anyone's primary circle.
  if (current.kind === "circle" && next.kind !== "circle") {
    await db.update(people).set({ primary_circle_tag_id: null }).where(eq(people.primary_circle_tag_id, id));
  }
  return row;
}

export async function deleteTag(id: string): Promise<void> {
  const deleted = await db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
  if (deleted.length === 0) throw notFound("标签不存在");
}

/** Deduplicate by (name, kind); case-sensitive on purpose (tags are short). */
export function normalizeTagInputs(inputs: TagInput[]): TagInput[] {
  const seen = new Set<string>();
  const out: TagInput[] = [];
  for (const raw of inputs) {
    const name = raw.name.trim();
    if (!name) continue;
    const key = `${raw.kind}\u0000${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, kind: raw.kind });
  }
  return out;
}

/** Case- and whitespace-insensitive key; Chinese names compare exactly. */
export function tagNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Map requested (name, kind) pairs onto the existing vocabulary. Never inserts.
 * A circle request only matches a circle; other requests prefer the same kind,
 * then any non-circle kind, then a circle of that name (the LLM often mislabels).
 * Unknown names are dropped, or rejected when `strict` (manual edits).
 */
export async function matchExistingTags(
  inputs: TagInput[],
  client: DbClient = db,
  options: { strict?: boolean } = {},
): Promise<TagRow[]> {
  const wanted = normalizeTagInputs(inputs);
  if (wanted.length === 0) return [];
  const vocabulary = await client.select().from(tags);
  const byKey = new Map<string, TagRow[]>();
  for (const row of vocabulary) {
    const key = tagNameKey(row.name);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  const out: TagRow[] = [];
  const missing: TagInput[] = [];
  for (const input of wanted) {
    const same = byKey.get(tagNameKey(input.name)) ?? [];
    const match =
      input.kind === "circle"
        ? same.find((t) => t.kind === "circle")
        : (same.find((t) => t.kind === input.kind) ??
          same.find((t) => t.kind !== "circle") ??
          same.find((t) => t.kind === "circle"));
    if (!match) missing.push(input);
    else if (!out.some((t) => t.id === match.id)) out.push(match);
  }
  if (options.strict && missing.length > 0) {
    const names = missing.map((t) => `「${t.name}」`).join("、");
    const what = missing.every((t) => t.kind === "circle") ? "圈子" : "标签";
    throw badRequest(`${what}${names}不存在，请先在 设置 › 圈子和标签 里添加`, "unknown_tag");
  }
  return out;
}

/** Existing (name, kind) pairs for draft tags; unknown ones are dropped, at most one circle. */
export async function canonicalizeTagInputs(inputs: TagInput[], client: DbClient = db): Promise<TagInput[]> {
  return keepOneCircle(await matchExistingTags(inputs, client)).map((t) => ({ name: t.name, kind: t.kind }));
}

function keepOneCircle(rows: TagRow[]): TagRow[] {
  const circle = rows.find((t) => t.kind === "circle");
  return rows.filter((t) => t.kind !== "circle" || t === circle);
}

/**
 * Insert missing tags and return rows for every requested (name, kind).
 * Only for defining the vocabulary (seed, maintenance); assigning tags to a
 * person goes through `matchExistingTags`.
 */
export async function upsertTags(inputs: TagInput[], client: DbClient = db): Promise<TagRow[]> {
  const wanted = normalizeTagInputs(inputs);
  if (wanted.length === 0) return [];

  await client
    .insert(tags)
    .values(wanted)
    .onConflictDoNothing({ target: [tags.name, tags.kind] });

  const names = wanted.map((t) => t.name);
  const rows = await client.select().from(tags).where(inArray(tags.name, names));
  const byKey = new Map(rows.map((r) => [`${r.kind}\u0000${r.name}`, r]));
  return wanted
    .map((t) => byKey.get(`${t.kind}\u0000${t.name}`))
    .filter((r): r is TagRow => Boolean(r));
}

/** Tags grouped by person id, ordered skill → circle → other. */
export async function getTagsForPeople(
  personIds: string[],
  client: DbClient = db,
): Promise<Map<string, TagRow[]>> {
  const result = new Map<string, TagRow[]>();
  if (personIds.length === 0) return result;
  const rows = await client
    .select({
      person_id: peopleTags.person_id,
      id: tags.id,
      name: tags.name,
      kind: tags.kind,
    })
    .from(peopleTags)
    .innerJoin(tags, eq(tags.id, peopleTags.tag_id))
    .where(inArray(peopleTags.person_id, personIds));

  for (const row of rows) {
    const list = result.get(row.person_id) ?? [];
    list.push({ id: row.id, name: row.name, kind: row.kind });
    result.set(row.person_id, list);
  }
  for (const list of result.values()) {
    list.sort(
      (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, "zh-CN"),
    );
  }
  return result;
}

/**
 * Replace the whole tag set of one person with existing tags. The single
 * circle, if any, becomes primary.
 */
export async function replacePersonTags(
  personId: string,
  inputs: TagInput[],
  client: DbClient = db,
  options: { strict?: boolean } = {},
): Promise<TagRow[]> {
  const matched = await matchExistingTags(inputs, client, options);
  if (options.strict && matched.filter((t) => t.kind === "circle").length > 1) {
    throw badRequest("一个人只能有一个圈子", "too_many_circles");
  }
  const rows = keepOneCircle(matched);
  await client.delete(peopleTags).where(eq(peopleTags.person_id, personId));
  if (rows.length > 0) {
    await client
      .insert(peopleTags)
      .values(rows.map((t) => ({ person_id: personId, tag_id: t.id })))
      .onConflictDoNothing();
  }
  const circle = rows.find((t) => t.kind === "circle") ?? null;
  await client.update(people).set({ primary_circle_tag_id: circle?.id ?? null }).where(eq(people.id, personId));
  return rows;
}

/**
 * Add existing tags to a person without removing current ones. Unknown names
 * are dropped; a circle is ignored when the person already has one.
 */
export async function addPersonTags(
  personId: string,
  inputs: TagInput[],
  client: DbClient = db,
): Promise<void> {
  const existing = await getTagsForPeople([personId], client);
  const hasCircle = (existing.get(personId) ?? []).some((t) => t.kind === "circle");
  const matched = keepOneCircle(await matchExistingTags(inputs, client));
  const rows = hasCircle ? matched.filter((t) => t.kind !== "circle") : matched;
  if (rows.length === 0) return;
  await client
    .insert(peopleTags)
    .values(rows.map((t) => ({ person_id: personId, tag_id: t.id })))
    .onConflictDoNothing();
  if (!hasCircle) {
    const circle = rows.find((t) => t.kind === "circle");
    if (circle) await client.update(people).set({ primary_circle_tag_id: circle.id }).where(eq(people.id, personId));
  }
}

/**
 * Existing people may have several circle tags. Keep one as the map sector
 * (the primary, else the first by name) and turn the others into ordinary tags.
 */
export async function collapseExtraCircles(): Promise<number> {
  const everyone = await db.select({ id: people.id, primary: people.primary_circle_tag_id }).from(people);
  const tagMap = await getTagsForPeople(everyone.map((p) => p.id));
  let changed = 0;
  for (const person of everyone) {
    const circles = (tagMap.get(person.id) ?? []).filter((t) => t.kind === "circle");
    if (circles.length === 0) continue;
    const keep =
      circles.find((t) => t.id === person.primary) ??
      circles.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))[0];
    const extra = circles.filter((t) => t.id !== keep.id);
    if (extra.length > 0) {
      const ordinary = await upsertTags(extra.map((t) => ({ name: t.name, kind: "other" as const })));
      if (ordinary.length > 0) {
        await db
          .insert(peopleTags)
          .values(ordinary.map((t) => ({ person_id: person.id, tag_id: t.id })))
          .onConflictDoNothing();
      }
      await db
        .delete(peopleTags)
        .where(
          and(
            eq(peopleTags.person_id, person.id),
            inArray(
              peopleTags.tag_id,
              extra.map((t) => t.id),
            ),
          ),
        );
      changed += 1;
    }
    if (person.primary !== keep.id) {
      await db.update(people).set({ primary_circle_tag_id: keep.id }).where(eq(people.id, person.id));
      changed += 1;
    }
  }
  return changed;
}
