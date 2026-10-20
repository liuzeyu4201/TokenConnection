import type { NextRequest } from "next/server";

import { clientIp } from "@/lib/audit";
import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { ShareLinkCreateSchema } from "@/lib/schemas/share";
import { createShareLink } from "@/lib/services/shares";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  const body = await parseBody(request, ShareLinkCreateSchema);
  return json(
    await createShareLink(auth, requireUuid(id), body, {
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    }),
    { status: 201 },
  );
}, { session: "required" });
