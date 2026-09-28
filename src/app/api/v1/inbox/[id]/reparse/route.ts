import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { reparseInbox } from "@/lib/services/inbox";

type Ctx = RouteContext<"/api/v1/inbox/[id]/reparse">;

/** POST /api/v1/inbox/:id/reparse */
export const POST = route(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const result = await reparseInbox(requireUuid(id));
  return json(result);
});
