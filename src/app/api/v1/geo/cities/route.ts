import type { NextRequest } from "next/server";
import { z } from "zod";

import { json, parseQuery, route } from "@/lib/api/handler";
import { geocode, searchCities } from "@/lib/geo/geocode";

const QuerySchema = z.object({
  q: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(100)),
  limit: z.preprocess((v) => (v === undefined || v === "" ? 10 : Number(v)), z.number().int().min(1).max(50)),
});

/**
 * GET /api/v1/geo/cities?q= → { match, items }
 * `match` is what geocode() would resolve `q` to (or null); `items` are cities
 * whose names contain `q`, for the "pick a city" UI. Fully offline.
 */
export const GET = route(async (request: NextRequest) => {
  const { q, limit } = parseQuery(request, QuerySchema);
  const match = geocode(q);
  return json({
    match: match ? { name: match.city.name, lat: match.lat, lng: match.lng, how: match.how } : null,
    items: searchCities(q, limit).map((c) => ({ name: c.name, en: c.en, country: c.country, lat: c.lat, lng: c.lng })),
  });
});
