import type { NextRequest } from "next/server";

import { clientIp } from "@/lib/audit";
import { errorResponse, handleError, json } from "@/lib/api/handler";
import { consumeMemoryLimit } from "@/lib/auth/rate-limit";
import { SHARE_PUBLIC_READS_PER_MINUTE } from "@/lib/shares/link";
import { shareCookieMatches, shareUnlockCookieName } from "@/lib/shares/unlock-cookie";
import { readPublicShare } from "@/lib/services/shares";

type Ctx = { params: Promise<{ token: string }> };

/** Public card. Each successful read counts as one view. */
export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const ip = clientIp(request.headers) ?? "unknown";
    const decision = consumeMemoryLimit(`share-read:${ip}`, Date.now(), 60_000, SHARE_PUBLIC_READS_PER_MINUTE);
    if (!decision.allowed) {
      return errorResponse(429, "rate_limited", "打开太频繁，请稍后再试", {
        "Retry-After": String(decision.retryAfterSec),
      });
    }
    const { token } = await ctx.params;
    const cookie = request.cookies.get(shareUnlockCookieName(token))?.value;
    return json(
      await readPublicShare(token, shareCookieMatches(token, cookie), {
        ip,
        userAgent: request.headers.get("user-agent"),
      }),
    );
  } catch (error) {
    return handleError(error);
  }
}
