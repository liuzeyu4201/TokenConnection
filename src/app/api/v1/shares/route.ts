import type { NextRequest } from "next/server";

import { clientIp } from "@/lib/audit";
import { json, parseBody, route } from "@/lib/api/handler";
import { ShareCreateSchema } from "@/lib/schemas/share";
import { createShare, listSentShares } from "@/lib/services/shares";

function meta(request: NextRequest) {
  return { ip: clientIp(request.headers), userAgent: request.headers.get("user-agent") };
}

export const GET = route(async (_request, _ctx, auth) => {
  return json({ items: await listSentShares(auth) });
}, { session: "required" });

export const POST = route(async (request: NextRequest, _ctx, auth) => {
  const body = await parseBody(request, ShareCreateSchema);
  return json(await createShare(auth, body, meta(request)), { status: 201 });
}, { session: "required" });
