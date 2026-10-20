import type { NextRequest } from "next/server";

import { json, requireUuid, route } from "@/lib/api/handler";
import { getSentShare } from "@/lib/services/shares";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  return json(await getSentShare(auth, requireUuid(id)));
}, { session: "required" });
