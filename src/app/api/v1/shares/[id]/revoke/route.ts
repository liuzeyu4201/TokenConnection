import type { NextRequest } from "next/server";

import { clientIp } from "@/lib/audit";
import { json, requireUuid, route } from "@/lib/api/handler";
import { revokeShare } from "@/lib/services/shares";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  return json(
    await revokeShare(auth, requireUuid(id), {
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    }),
  );
}, { session: "required" });
