import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { describeInbox } from "@/lib/services/inbox";

type Ctx = RouteContext<"/api/v1/inbox/[id]">;

export const GET = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  return json(await describeInbox(auth, requireUuid(id)));
}, { scope: "inbox:read" });
