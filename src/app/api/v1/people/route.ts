import type { NextRequest } from "next/server";

import { json, parseBody, parseQuery, route } from "@/lib/api/handler";
import { PeopleQuerySchema, PersonCreateSchema } from "@/lib/schemas/person";
import { createPerson, listPeople } from "@/lib/services/people";

/** GET /api/v1/people?tier=&tag=&location=&q=&cursor=&limit= */
export const GET = route(async (request: NextRequest) => {
  const query = parseQuery(request, PeopleQuerySchema);
  const result = await listPeople(query);
  return json(result);
});

/** POST /api/v1/people */
export const POST = route(async (request: NextRequest) => {
  const input = await parseBody(request, PersonCreateSchema);
  const person = await createPerson(input);
  return json(person, { status: 201 });
});
