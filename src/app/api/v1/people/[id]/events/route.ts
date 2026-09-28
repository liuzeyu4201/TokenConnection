import type { NextRequest } from "next/server";

import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { EventCreateSchema } from "@/lib/schemas/event";
import { addEvent, listEvents } from "@/lib/services/events";

type Ctx = RouteContext<"/api/v1/people/[id]/events">;

/** GET /api/v1/people/:id/events */
export const GET = route(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const items = await listEvents(requireUuid(id));
  return json({ items });
});

/** POST /api/v1/people/:id/events — append; updates last_contact_at + embedding */
export const POST = route(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, EventCreateSchema);
  const event = await addEvent(requireUuid(id), input);
  return json(event, { status: 201 });
});
