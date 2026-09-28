import { json, route } from "@/lib/api/handler";
import { getRadialMapData } from "@/lib/services/map";

/**
 * GET /api/v1/map/radial → { people, layout: { rings, sectors, points }, skills, locations }
 * Concentric-ring map data (design.md §14.1). Points are unit-circle coordinates.
 */
export const GET = route(async () => json(await getRadialMapData()));
