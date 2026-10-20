import { NextResponse, type NextRequest } from "next/server";

import { clientIp } from "@/lib/audit";
import { errorResponse, handleError, parseBody } from "@/lib/api/handler";
import { consumeMemoryLimit } from "@/lib/auth/rate-limit";
import { ShareUnlockSchema } from "@/lib/schemas/share";
import { shareUnlockCookie } from "@/lib/shares/unlock-cookie";
import { unlockPublicShare } from "@/lib/services/shares";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const ip = clientIp(request.headers) ?? "unknown";
    const decision = consumeMemoryLimit(`share-unlock:${ip}`, Date.now(), 60_000, 5);
    if (!decision.allowed) {
      return errorResponse(429, "rate_limited", "口令试得太频繁，请稍后再试", {
        "Retry-After": String(decision.retryAfterSec),
      });
    }
    const { token } = await ctx.params;
    const body = await parseBody(request, ShareUnlockSchema);
    await unlockPublicShare(token, body.passcode);
    const cookie = shareUnlockCookie(token);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: cookie.maxAge,
    });
    return response;
  } catch (error) {
    return handleError(error);
  }
}
