import type { NextRequest } from "next/server";

import { json, route } from "@/lib/api/handler";
import { getProfile } from "@/lib/auth/account";

export const GET = route(async (_request: NextRequest, _ctx, auth) => {
  const profile = await getProfile(auth.userId);
  return json({
    user: profile ? { id: profile.id, username: profile.username, name: profile.name, role: profile.role } : null,
    via: auth.via,
    scopes: auth.scopes,
  });
});
