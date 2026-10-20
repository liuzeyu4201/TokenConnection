import type { NextRequest } from "next/server";
import { z } from "zod";

import { json, parseBody, route } from "@/lib/api/handler";
import { deleteOwnAccount } from "@/lib/auth/account-data";

const Schema = z.object({
  password: z.string().min(1),
  confirm: z.literal("删除我的账号"),
});

export const POST = route(async (request: NextRequest, _ctx, auth) => {
  const body = await parseBody(request, Schema);
  await deleteOwnAccount(auth, body.password);
  return json({ ok: true });
}, { session: "required" });
