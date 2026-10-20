import { z } from "zod";

import { EventKind } from "./enums";

const ShareEvents = z.union([
  z.literal("none"),
  z.literal("all"),
  z.object({ kinds: z.array(EventKind).max(8) }),
]);

export const ShareFieldsInputSchema = z.object({
  gender: z.boolean().optional(),
  location: z.boolean().optional(),
  tags: z.enum(["all", "skills", "none"]).optional(),
  how_met: z.boolean().optional(),
  met_at: z.boolean().optional(),
  summary: z.boolean().optional(),
  impression: z.boolean().optional(),
  contacts: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  events: ShareEvents.optional(),
  tier: z.boolean().optional(),
  show_owner_name: z.boolean().optional(),
  /** Required when `impression` is true. Not stored on the share. */
  confirm_impression: z.boolean().optional(),
});

export const ShareLinkInputSchema = z.object({
  expires_in_days: z.union([z.literal(1), z.literal(7), z.literal(30)]).optional(),
  max_views: z.number().int().positive().max(10000).nullable().optional(),
  passcode: z.string().min(4).max(32).nullable().optional(),
});

export const ShareCreateSchema = z.object({
  kind: z.enum(["person", "circle"]),
  person_id: z.uuid().optional(),
  circle_tag_id: z.uuid().optional(),
  fields: ShareFieldsInputSchema.optional(),
  message: z.string().trim().max(500).optional(),
  recipients: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  link: ShareLinkInputSchema.optional(),
});
export type ShareCreateInput = z.infer<typeof ShareCreateSchema>;

export const ShareLinkCreateSchema = ShareLinkInputSchema;

export const ShareUnlockSchema = z.object({
  passcode: z.string().min(1).max(32),
});
