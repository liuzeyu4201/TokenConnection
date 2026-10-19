import type { NextRequest } from "next/server";
import { z } from "zod";

import { json, parseBody, route } from "@/lib/api/handler";
import { createToken, listTokens } from "@/lib/auth/account";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.string()).min(1),
  expires_in_days: z.number().int().positive().nullable().optional(),
});

export const GET = route(async (_request: NextRequest, _ctx, auth) => {
  return json({ items: await listTokens(auth.userId) });
}, { session: "required" });

export const POST = route(async (request: NextRequest, _ctx, auth) => {
  const body = await parseBody(request, CreateSchema);
  const created = await createToken(auth, {
    name: body.name,
    scopes: body.scopes,
    expiresInDays: body.expires_in_days === undefined ? 365 : body.expires_in_days,
  });
  return json(created, { status: 201 });
}, { session: "required" });
