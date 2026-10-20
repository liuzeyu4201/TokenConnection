import { json, route } from "@/lib/api/handler";
import { listReceivedShares } from "@/lib/services/shares";

export const GET = route(async (_request, _ctx, auth) => {
  return json({ items: await listReceivedShares(auth) });
}, { session: "required" });
