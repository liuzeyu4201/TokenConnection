import { json, route } from "@/lib/api/handler";
import { getGeoMapData } from "@/lib/services/map";

/**
 * GET /api/v1/map/geo → { clusters, unlocated, no_location_count, located_count, skills }
 * Geographic map data (design.md §14.2): people bucketed by coordinates.
 */
export const GET = route(async () => json(await getGeoMapData()));
