import { z } from "zod";

import { boundedInt, OptionalQueryString } from "./common";
import { Tier } from "./enums";

/** `GET /search?q=&tier=&tag=&location=&limit=` */
export const SearchQuerySchema = z.object({
  q: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value ?? ""),
    z.string().max(500),
  ),
  tier: z.preprocess(
    (value) => (value === "" ? undefined : value),
    Tier.optional(),
  ),
  tag: OptionalQueryString,
  location: OptionalQueryString,
  limit: boundedInt(1, 100, 20),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
