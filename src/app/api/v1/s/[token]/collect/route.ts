import type { NextRequest } from "next/server";

import { clientIp } from "@/lib/audit";
import { json, route } from "@/lib/api/handler";
import { shareCookieMatches, shareUnlockCookieName } from "@/lib/shares/unlock-cookie";
import { collectPublicShare } from "@/lib/services/shares";

type Ctx = { params: Promise<{ token: string }> };

export const POST = route(async (request: NextRequest, ctx: Ctx, auth) => {
  const { token } = await ctx.params;
  const cookie = request.cookies.get(shareUnlockCookieName(token))?.value;
  return json(
    await collectPublicShare(auth, token, shareCookieMatches(token, cookie), {
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    }),
  );
}, { session: "required" });
