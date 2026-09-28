import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { getInbox } from "@/lib/services/inbox";

type Ctx = RouteContext<"/api/v1/inbox/[id]">;

/** GET /api/v1/inbox/:id */
export const GET = route(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const row = await getInbox(requireUuid(id));
  return json(row);
});
