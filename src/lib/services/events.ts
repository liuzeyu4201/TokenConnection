import { and, desc, eq, sql } from "drizzle-orm";

import { events, people, type EventRow } from "@/db/schema";
import { notFound } from "@/lib/api/errors";
import type { ServiceContext } from "@/lib/auth/context";
import { inTenant, withTenant } from "@/lib/auth/tenant";
import { refreshPersonEmbedding } from "@/lib/llm/embed";
import type { EventCreateInput } from "@/lib/schemas/event";

import { todayIso, type DbClient } from "./db-client";
import { getPersonRow } from "./people";

export async function listEvents(ctx: ServiceContext, personId: string): Promise<EventRow[]> {
  return withTenant(ctx, async (tx) => {
    await getPersonRow(ctx, personId, tx);
    return tx
      .select()
      .from(events)
      .where(and(eq(events.person_id, personId), eq(events.owner_id, ctx.userId)))
      .orderBy(desc(events.happened_at), desc(events.created_at));
  });
}

export async function recomputeLastContact(ctx: ServiceContext, personId: string, client?: DbClient): Promise<void> {
  await inTenant(ctx, client, async (tx) => {
    await tx
      .update(people)
      .set({
        last_contact_at: sql`(select max(happened_at)::timestamptz from ${events} where ${events.person_id} = ${personId})`,
        updated_at: new Date(),
      })
      .where(and(eq(people.id, personId), eq(people.owner_id, ctx.userId)));
  });
}

export async function insertEvent(
  ctx: ServiceContext,
  personId: string,
  input: EventCreateInput,
  client: DbClient,
): Promise<EventRow> {
  const [row] = await client
    .insert(events)
    .values({
      owner_id: ctx.userId,
      person_id: personId,
      kind: input.kind,
      content: input.content,
      happened_at: input.happened_at ?? todayIso(),
    })
    .returning();
  return row;
}

export async function addEvent(ctx: ServiceContext, personId: string, input: EventCreateInput): Promise<EventRow> {
  const row = await withTenant(ctx, async (tx) => {
    await getPersonRow(ctx, personId, tx);
    const inserted = await insertEvent(ctx, personId, input, tx);
    await recomputeLastContact(ctx, personId, tx);
    return inserted;
  });
  await refreshPersonEmbedding(ctx, personId);
  return row;
}

export async function deleteEvent(ctx: ServiceContext, personId: string, eventId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const deleted = await tx
      .delete(events)
      .where(and(eq(events.id, eventId), eq(events.person_id, personId), eq(events.owner_id, ctx.userId)))
      .returning({ id: events.id });
    if (deleted.length === 0) throw notFound("事件不存在");
    await recomputeLastContact(ctx, personId, tx);
  });
  await refreshPersonEmbedding(ctx, personId);
}
