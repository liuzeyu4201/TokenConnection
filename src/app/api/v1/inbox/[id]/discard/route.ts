import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { discardInbox } from "@/lib/services/inbox";

type Ctx = RouteContext<"/api/v1/inbox/[id]/discard">;

/** POST /api/v1/inbox/:id/discard */
export const POST = route(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const row = await discardInbox(requireUuid(id));
  return json(row);
});
