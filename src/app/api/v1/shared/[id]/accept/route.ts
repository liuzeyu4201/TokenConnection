import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { applyShareGroup } from "@/lib/services/inbox";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  return json(await applyShareGroup(auth, requireUuid(id)));
}, { session: "required" });
