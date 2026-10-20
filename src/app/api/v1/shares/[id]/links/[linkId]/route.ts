import type { NextRequest } from "next/server";

import { clientIp } from "@/lib/audit";
import { json, requireUuid, route } from "@/lib/api/handler";
import { revokeShareLink } from "@/lib/services/shares";

type Ctx = { params: Promise<{ id: string; linkId: string }> };

export const DELETE = route(async (request: NextRequest, ctx: Ctx, auth) => {
  const { id, linkId } = await ctx.params;
  await revokeShareLink(auth, requireUuid(id), requireUuid(linkId), {
    ip: clientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
  });
  return json({ ok: true });
}, { session: "required" });
