import type { NextRequest } from "next/server";

import { json, parseQuery, route } from "@/lib/api/handler";
import { SearchQuerySchema } from "@/lib/schemas/search";
import { searchPeople } from "@/lib/services/search";

/**
 * GET /api/v1/search?q=&tier=&tag=&location=&limit=
 * → { query, hits: [{ person, score, reasons, semantic, keyword_hit }], semantic_skipped }
 */
export const GET = route(async (request: NextRequest) => {
  const query = parseQuery(request, SearchQuerySchema);
  const result = await searchPeople(query);
  return json(result);
});
