import type { NextRequest } from "next/server";

import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { InboxApplySchema } from "@/lib/schemas/inbox";
import { applyInbox } from "@/lib/services/inbox";

type Ctx = RouteContext<"/api/v1/inbox/[id]/apply">;

export const POST = route(async (request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, InboxApplySchema);
  return json(await applyInbox(auth, requireUuid(id), input.draft));
}, { scope: "inbox:write" });
