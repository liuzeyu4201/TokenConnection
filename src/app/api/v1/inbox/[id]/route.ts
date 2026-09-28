import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { describeInbox } from "@/lib/services/inbox";

type Ctx = RouteContext<"/api/v1/inbox/[id]">;

/**
 * GET /api/v1/inbox/:id → { inbox, draft, candidates, error }
 * Returns the stored draft (or a fallback) plus candidates; no LLM call.
 */
export const GET = route(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const result = await describeInbox(requireUuid(id));
  return json(result);
});
