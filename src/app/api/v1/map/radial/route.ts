import type { NextRequest } from "next/server";

import { json, route } from "@/lib/api/handler";
import { getRadialMapData } from "@/lib/services/map";

export const GET = route(async (_request: NextRequest, _ctx, auth) => json(await getRadialMapData(auth)), { scope: "map:read" });
