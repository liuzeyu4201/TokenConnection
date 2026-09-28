import type { NextRequest } from "next/server";

import { json, parseBody, parseQuery, route } from "@/lib/api/handler";
import { InboxCreateSchema, InboxQuerySchema } from "@/lib/schemas/inbox";
import { createAndParseInbox, listInbox } from "@/lib/services/inbox";

/** GET /api/v1/inbox?status=pending */
export const GET = route(async (request: NextRequest) => {
  const query = parseQuery(request, InboxQuerySchema);
  const items = await listInbox(query);
  return json({ items });
});

/**
 * POST /api/v1/inbox { raw_text, source }
 * Stores the raw text, parses it immediately and returns
 * { inbox, draft, candidates, results?, error }.
 */
export const POST = route(async (request: NextRequest) => {
  const input = await parseBody(request, InboxCreateSchema);
  const result = await createAndParseInbox(input);
  return json(result, { status: 201 });
});
