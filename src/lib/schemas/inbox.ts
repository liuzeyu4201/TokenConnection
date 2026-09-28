import { z } from "zod";

import { NonEmptyString } from "./common";
import { DraftSchema } from "./draft";
import { InboxSource, InboxStatus } from "./enums";

export const InboxCreateSchema = z.object({
  raw_text: NonEmptyString.max(4000),
  source: InboxSource.default("web"),
  /**
   * Optional hint used by the person detail page ("追加一句"): forces the
   * extraction to treat the text as an update of this person.
   */
  person_id: z.uuid().optional(),
});
export type InboxCreateInput = z.infer<typeof InboxCreateSchema>;

export const InboxQuerySchema = z.object({
  status: z.preprocess(
    (value) => (value === "" || value === undefined ? "pending" : value),
    InboxStatus,
  ),
  limit: z.preprocess(
    (value) => (value === undefined || value === "" ? 50 : Number(value)),
    z.number().int().min(1).max(200),
  ),
});
export type InboxQuery = z.infer<typeof InboxQuerySchema>;

export const InboxApplySchema = z.object({
  draft: DraftSchema,
});
export type InboxApplyInput = z.infer<typeof InboxApplySchema>;
