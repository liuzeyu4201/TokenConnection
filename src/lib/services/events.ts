import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { events, people, type EventRow } from "@/db/schema";
import { notFound } from "@/lib/api/errors";
import { refreshPersonEmbedding } from "@/lib/llm/embed";
import type { EventCreateInput } from "@/lib/schemas/event";

import { todayIso, type DbClient } from "./db-client";
import { getPersonRow } from "./people";

export async function listEvents(personId: string): Promise<EventRow[]> {
  await getPersonRow(personId);
  return db
    .select()
    .from(events)
    .where(eq(events.person_id, personId))
    .orderBy(desc(events.happened_at), desc(events.created_at));
}

/** `last_contact_at = max(happened_at)` (design.md §7.3). */
export async function recomputeLastContact(personId: string, client: DbClient = db): Promise<void> {
  await client
    .update(people)
    .set({
      last_contact_at: sql`(select max(happened_at)::timestamptz from ${events} where ${events.person_id} = ${personId})`,
      updated_at: new Date(),
    })
    .where(eq(people.id, personId));
}

/** Insert one event without side effects; used inside larger transactions. */
export async function insertEvent(
  personId: string,
  input: EventCreateInput,
  client: DbClient = db,
): Promise<EventRow> {
  const [row] = await client
    .insert(events)
    .values({
      person_id: personId,
      kind: input.kind,
      content: input.content,
      happened_at: input.happened_at ?? todayIso(),
    })
    .returning();
  return row;
}

/** Append an event, update last_contact_at and refresh the embedding. */
export async function addEvent(personId: string, input: EventCreateInput): Promise<EventRow> {
  const row = await db.transaction(async (tx) => {
    await getPersonRow(personId, tx);
    const inserted = await insertEvent(personId, input, tx);
    await recomputeLastContact(personId, tx);
    return inserted;
  });
  await refreshPersonEmbedding(personId);
  return row;
}

/**
 * Events are append-only but may be deleted (decision on design.md §19 Q1).
 * Editing is intentionally not supported.
 */
export async function deleteEvent(personId: string, eventId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(events)
      .where(and(eq(events.id, eventId), eq(events.person_id, personId)))
      .returning({ id: events.id });
    if (deleted.length === 0) throw notFound("事件不存在");
    await recomputeLastContact(personId, tx);
  });
  await refreshPersonEmbedding(personId);
}
