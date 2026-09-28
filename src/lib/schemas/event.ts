import { z } from "zod";

import { IsoDateSchema, NonEmptyString } from "./common";
import { EventKind } from "./enums";

export const EventCreateSchema = z.object({
  kind: EventKind.default("note"),
  content: NonEmptyString.max(2000),
  /** Defaults to today (server time) when omitted. */
  happened_at: IsoDateSchema.optional(),
});
export type EventCreateInput = z.infer<typeof EventCreateSchema>;
