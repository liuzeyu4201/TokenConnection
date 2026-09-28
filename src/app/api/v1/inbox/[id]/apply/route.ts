import type { NextRequest } from "next/server";

import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { InboxApplySchema } from "@/lib/schemas/inbox";
import { applyInbox } from "@/lib/services/inbox";

type Ctx = RouteContext<"/api/v1/inbox/[id]/apply">;

/** POST /api/v1/inbox/:id/apply { draft } → { inbox, person } */
export const POST = route(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, InboxApplySchema);
  const result = await applyInbox(requireUuid(id), input.draft);
  return json(result);
});
