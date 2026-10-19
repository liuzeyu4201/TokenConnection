import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { deleteEvent } from "@/lib/services/events";

type Ctx = RouteContext<"/api/v1/people/[id]/events/[eventId]">;

export const DELETE = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id, eventId } = await ctx.params;
  await deleteEvent(auth, requireUuid(id), requireUuid(eventId, "eventId"));
  return json({ ok: true });
}, { scope: "people:write" });
