import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { reparseInbox } from "@/lib/services/inbox";

type Ctx = RouteContext<"/api/v1/inbox/[id]/reparse">;

export const POST = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  return json(await reparseInbox(auth, requireUuid(id)));
}, { scope: "inbox:write" });
