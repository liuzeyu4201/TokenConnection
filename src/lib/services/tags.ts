import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { peopleTags, tags, type TagRow } from "@/db/schema";
import { conflict, notFound } from "@/lib/api/errors";
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

/** Insert missing tags and return rows for every requested (name, kind). */
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

/** Replace the whole tag set of one person. */
export async function replacePersonTags(
  personId: string,
  inputs: TagInput[],
  client: DbClient = db,
): Promise<TagRow[]> {
  const rows = await upsertTags(inputs, client);
  await client.delete(peopleTags).where(eq(peopleTags.person_id, personId));
  if (rows.length > 0) {
    await client
      .insert(peopleTags)
      .values(rows.map((t) => ({ person_id: personId, tag_id: t.id })))
      .onConflictDoNothing();
  }
  return rows;
}

/** Add tags to a person without removing existing ones. */
export async function addPersonTags(
  personId: string,
  inputs: TagInput[],
  client: DbClient = db,
): Promise<void> {
  const rows = await upsertTags(inputs, client);
  if (rows.length === 0) return;
  await client
    .insert(peopleTags)
    .values(rows.map((t) => ({ person_id: personId, tag_id: t.id })))
    .onConflictDoNothing();
}
