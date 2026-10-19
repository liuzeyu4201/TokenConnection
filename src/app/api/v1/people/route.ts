import type { NextRequest } from "next/server";

import { json, parseBody, parseQuery, route } from "@/lib/api/handler";
import { PeopleQuerySchema, PersonCreateSchema } from "@/lib/schemas/person";
import { createPerson, listPeople } from "@/lib/services/people";

/** GET /api/v1/people?tier=&tag=&location=&q=&cursor=&limit= */
export const GET = route(async (request: NextRequest, _ctx, auth) => {
  const query = parseQuery(request, PeopleQuerySchema);
  return json(await listPeople(auth, query));
}, { scope: "people:read" });

/** POST /api/v1/people */
export const POST = route(async (request: NextRequest, _ctx, auth) => {
  const input = await parseBody(request, PersonCreateSchema);
  return json(await createPerson(auth, input), { status: 201 });
}, { scope: "people:write" });
