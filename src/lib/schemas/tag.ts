import { z } from "zod";

import { NonEmptyString } from "./common";
import { TagKind } from "./enums";

export const TagCreateSchema = z.object({
  name: NonEmptyString.max(50),
  kind: TagKind.default("other"),
});
export type TagCreateInput = z.infer<typeof TagCreateSchema>;

export const TagUpdateSchema = z
  .object({
    name: NonEmptyString.max(50),
    kind: TagKind,
  })
  .partial()
  .refine((value) => value.name !== undefined || value.kind !== undefined, {
    message: "至少提供 name 或 kind",
  });
export type TagUpdateInput = z.infer<typeof TagUpdateSchema>;

export const TagsQuerySchema = z.object({
  kind: z.preprocess(
    (value) => (value === "" ? undefined : value),
    TagKind.optional(),
  ),
});
export type TagsQuery = z.infer<typeof TagsQuerySchema>;
