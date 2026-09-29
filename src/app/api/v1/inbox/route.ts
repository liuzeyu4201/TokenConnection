import type { NextRequest } from "next/server";

import { badRequest } from "@/lib/api/errors";
import { json, parseBody, parseQuery, route } from "@/lib/api/handler";
import { validateImage, type ImagePayload } from "@/lib/llm/vision";
import { InboxCreateSchema, InboxImageCreateSchema, InboxQuerySchema } from "@/lib/schemas/inbox";
import { createAndParseInbox, listInbox } from "@/lib/services/inbox";

/** GET /api/v1/inbox?status=pending */
export const GET = route(async (request: NextRequest) => {
  const query = parseQuery(request, InboxQuerySchema);
  const items = await listInbox(query);
  return json({ items });
});

async function readImage(request: NextRequest): Promise<{ input: ReturnType<typeof InboxImageCreateSchema.parse>; image?: ImagePayload }> {
  const form = await request.formData();
  const file = form.get("image");
  let image: ImagePayload | undefined;
  if (file instanceof File && file.size > 0) {
    let mediaType: ReturnType<typeof validateImage>;
    try {
      mediaType = validateImage({ mediaType: file.type, size: file.size });
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : "图片无法读取");
    }
    image = { bytes: new Uint8Array(await file.arrayBuffer()), mediaType };
  }
  const personId = form.get("person_id");
  const input = InboxImageCreateSchema.parse({
    raw_text: typeof form.get("raw_text") === "string" ? form.get("raw_text") : "",
    source: form.get("source") || undefined,
    person_id: typeof personId === "string" && personId ? personId : undefined,
  });
  if (!input.raw_text.trim() && !image) throw badRequest("请输入一句话，或上传一张图片");
  return { input, image };
}

/**
 * POST /api/v1/inbox
 * JSON `{ raw_text, source }`, or multipart with an `image` file (jpg/png/webp/gif, ≤ 4MB).
 * Stores the text (plus what was read from the image), parses it immediately and returns
 * { inbox, draft, candidates, results?, error }.
 */
export const POST = route(async (request: NextRequest) => {
  const contentType = request.headers.get("content-type") ?? "";
  const { input, image } = contentType.includes("multipart/form-data")
    ? await readImage(request)
    : { input: await parseBody(request, InboxCreateSchema) };
  const result = await createAndParseInbox(input, image);
  return json(result, { status: 201 });
});
