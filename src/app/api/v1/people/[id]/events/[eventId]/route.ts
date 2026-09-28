import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { deleteEvent } from "@/lib/services/events";

type Ctx = RouteContext<"/api/v1/people/[id]/events/[eventId]">;

/**
 * DELETE /api/v1/people/:id/events/:eventId
 * Events can be deleted but never edited (decision on design.md §19 Q1).
 */
export const DELETE = route(async (_request: NextRequest, ctx: Ctx) => {
  const { id, eventId } = await ctx.params;
  await deleteEvent(requireUuid(id), requireUuid(eventId, "eventId"));
  return json({ ok: true });
});
