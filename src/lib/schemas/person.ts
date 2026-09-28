import { z } from "zod";

import {
  boundedInt,
  ContactsSchema,
  IsoDateSchema,
  NonEmptyString,
  NullableText,
  OptionalQueryString,
} from "./common";
import { Gender, TagKind, Tier } from "./enums";

export const TagInputSchema = z.object({
  name: NonEmptyString.max(50),
  kind: TagKind.default("other"),
});
export type TagInput = z.infer<typeof TagInputSchema>;

export const PersonCreateSchema = z.object({
  name: NonEmptyString.max(100),
  gender: Gender.default("unknown"),
  location: NullableText.optional(),
  tier: Tier.default("known_of"),
  summary: NullableText.optional(),
  impression: NullableText.optional(),
  contacts: ContactsSchema.optional(),
  how_met: NullableText.optional(),
  met_at: IsoDateSchema.nullable().optional(),
  /** Optional: set tags in the same request. */
  tags: z.array(TagInputSchema).max(50).optional(),
});
export type PersonCreateInput = z.infer<typeof PersonCreateSchema>;

export const PersonUpdateSchema = z
  .object({
    name: NonEmptyString.max(100),
    gender: Gender,
    location: NullableText,
    tier: Tier,
    summary: NullableText,
    impression: NullableText,
    contacts: ContactsSchema,
    how_met: NullableText,
    met_at: IsoDateSchema.nullable(),
    tags: z.array(TagInputSchema).max(50),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个要修改的字段",
  });
export type PersonUpdateInput = z.infer<typeof PersonUpdateSchema>;

export const SetPersonTagsSchema = z.object({
  tags: z.array(TagInputSchema).max(50),
});
export type SetPersonTagsInput = z.infer<typeof SetPersonTagsSchema>;

/** `GET /people?tier=&tag=&location=&q=&cursor=&limit=` */
export const PeopleQuerySchema = z.object({
  tier: z.preprocess(
    (value) => (value === "" ? undefined : value),
    Tier.optional(),
  ),
  tag: OptionalQueryString,
  location: OptionalQueryString,
  q: OptionalQueryString,
  cursor: OptionalQueryString,
  limit: boundedInt(1, 200, 50),
});
export type PeopleQuery = z.infer<typeof PeopleQuerySchema>;
