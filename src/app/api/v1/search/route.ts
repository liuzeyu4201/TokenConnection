import type { NextRequest } from "next/server";

import { json, parseQuery, route } from "@/lib/api/handler";
import { SearchQuerySchema } from "@/lib/schemas/search";
import { searchPeople } from "@/lib/services/search";

export const GET = route(async (request: NextRequest, _ctx, auth) => {
  const query = parseQuery(request, SearchQuerySchema);
  return json(await searchPeople(auth, query));
}, { scope: "search:read" });
