import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { discardInbox } from "@/lib/services/inbox";

type Ctx = RouteContext<"/api/v1/inbox/[id]/discard">;

export const POST = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  return json(await discardInbox(auth, requireUuid(id)));
}, { scope: "inbox:write" });
