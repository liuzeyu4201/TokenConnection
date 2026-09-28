import { z } from "zod";

import { ContactsSchema, IsoDateSchema, NullableText } from "./common";
import { EventKind, Gender, InboxIntent, TagKind, Tier } from "./enums";

// ---------------------------------------------------------------------------
// Draft = structured output of the LLM extraction step (design.md §9.1).
// The same schema validates what the user sends back on apply.
// ---------------------------------------------------------------------------

export const DraftPersonSchema = z.object({
  name: NullableText,
  gender: Gender.nullable(),
  location: NullableText,
  tier: Tier.nullable(),
  summary: NullableText,
  impression: NullableText,
  contacts: ContactsSchema.default({}),
  how_met: NullableText,
  met_at: IsoDateSchema.nullable(),
});
export type DraftPerson = z.infer<typeof DraftPersonSchema>;

export const DraftTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  kind: TagKind,
});
export type DraftTag = z.infer<typeof DraftTagSchema>;

export const DraftEventSchema = z.object({
  kind: EventKind,
  content: z.string().trim().min(1).max(2000),
  happened_at: IsoDateSchema,
});
export type DraftEvent = z.infer<typeof DraftEventSchema>;

export const DraftSchema = z.object({
  intent: InboxIntent,
  /** Existing person when intent is `update`; null for `add`. */
  target_person_id: z.uuid().nullable(),
  /** Model confidence that the target is right; < 0.7 asks the user to pick. */
  target_confidence: z.number().min(0).max(1),
  person: DraftPersonSchema,
  tags: z.array(DraftTagSchema).max(50),
  events: z.array(DraftEventSchema).max(50),
});
export type Draft = z.infer<typeof DraftSchema>;

/**
 * Shape sent to the LLM (via JSON mode). Identical to DraftSchema but without
 * preprocessing so the JSON schema stays plain.
 */
export const DraftLlmSchema = z.object({
  intent: InboxIntent,
  target_person_id: z.string().nullable(),
  target_confidence: z.number().min(0).max(1),
  person: z.object({
    name: z.string().nullable(),
    gender: Gender.nullable(),
    location: z.string().nullable(),
    tier: Tier.nullable(),
    summary: z.string().nullable(),
    impression: z.string().nullable(),
    contacts: z.record(z.string(), z.string()),
    how_met: z.string().nullable(),
    met_at: z.string().nullable(),
  }),
  tags: z.array(z.object({ name: z.string(), kind: TagKind })),
  events: z.array(
    z.object({ kind: EventKind, content: z.string(), happened_at: z.string() }),
  ),
});

export const EMPTY_DRAFT_PERSON: DraftPerson = {
  name: null,
  gender: null,
  location: null,
  tier: null,
  summary: null,
  impression: null,
  contacts: {},
  how_met: null,
  met_at: null,
};

/** Degraded draft used when the LLM fails: raw text pre-filled as summary. */
export function fallbackDraft(rawText: string): Draft {
  return {
    intent: "add",
    target_person_id: null,
    target_confidence: 0,
    person: { ...EMPTY_DRAFT_PERSON, summary: rawText.trim() || null },
    tags: [],
    events: [],
  };
}
