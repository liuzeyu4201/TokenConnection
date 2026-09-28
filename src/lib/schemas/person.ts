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

export const LatitudeSchema = z.number().min(-90).max(90);
export const LongitudeSchema = z.number().min(-180).max(180);

/** lat/lng must be given together (both numbers or both null). */
function latLngTogether(value: { lat?: number | null; lng?: number | null }): boolean {
  const hasLat = value.lat !== undefined && value.lat !== null;
  const hasLng = value.lng !== undefined && value.lng !== null;
  if (value.lat === undefined && value.lng === undefined) return true;
  return hasLat === hasLng;
}

export const PersonCreateSchema = z
  .object({
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
    /** Manual coordinates; when given, geo_manual is set and auto-geocoding is skipped. */
    lat: LatitudeSchema.nullable().optional(),
    lng: LongitudeSchema.nullable().optional(),
  })
  .refine(latLngTogether, { message: "lat 和 lng 需要同时提供", path: ["lng"] });
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
    /** Sector on the radial map; must be one of the person's circle tags. */
    primary_circle_tag_id: z.uuid().nullable(),
    /** Manual coordinates. Sending lat/lng implies geo_manual=true. */
    lat: LatitudeSchema.nullable(),
    lng: LongitudeSchema.nullable(),
    /** Explicit false = "恢复自动": re-geocode from location and drop manual coords. */
    geo_manual: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个要修改的字段",
  })
  .refine(latLngTogether, { message: "lat 和 lng 需要同时提供", path: ["lng"] });
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
