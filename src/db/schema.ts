import {
  type AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// Relative imports on purpose: drizzle-kit loads this file outside of Next.js
// and does not resolve the `@/` alias.
import type { Draft } from "../lib/schemas/draft";
import {
  EVENT_KIND_VALUES,
  GENDER_VALUES,
  INBOX_INTENT_VALUES,
  INBOX_STATUS_VALUES,
  TAG_KIND_VALUES,
  TIER_VALUES,
} from "../lib/schemas/enums";

// ---------------------------------------------------------------------------
// Enums (design.md §7.1). Values live in src/lib/schemas/enums.ts and are
// shared with the zod schemas.
// ---------------------------------------------------------------------------

export const tierEnum = pgEnum("tier", TIER_VALUES);
export const genderEnum = pgEnum("gender", GENDER_VALUES);
export const tagKindEnum = pgEnum("tag_kind", TAG_KIND_VALUES);
export const eventKindEnum = pgEnum("event_kind", EVENT_KIND_VALUES);
export const inboxStatusEnum = pgEnum("inbox_status", INBOX_STATUS_VALUES);
export const inboxIntentEnum = pgEnum("inbox_intent", INBOX_INTENT_VALUES);

// ---------------------------------------------------------------------------
// Tables (design.md §7.2). Property names deliberately equal column names
// (snake_case) so DB rows can be returned from the API without remapping.
// ---------------------------------------------------------------------------

export const people = pgTable("people", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  gender: genderEnum().notNull().default("unknown"),
  location: text(),
  tier: tierEnum().notNull().default("known_of"),
  summary: text(),
  impression: text(),
  contacts: jsonb().$type<Record<string, string>>().notNull().default({}),
  how_met: text(),
  met_at: date(),
  last_contact_at: timestamp({ withTimezone: true }),
  // Stage 2 (design.md §14, §19 Q2/Q5):
  /** Sector on the radial map; must point at a kind=circle tag of this person. */
  primary_circle_tag_id: uuid().references((): AnyPgColumn => tags.id, { onDelete: "set null" }),
  /** Geocoded (or manually set) coordinates for the geo map. */
  lat: doublePrecision(),
  lng: doublePrecision(),
  /** True when lat/lng were entered by hand and must not be auto-overwritten. */
  geo_manual: boolean().notNull().default(false),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const tags = pgTable(
  "tags",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    kind: tagKindEnum().notNull().default("other"),
  },
  (t) => [unique("tags_name_kind_unique").on(t.name, t.kind)],
);

export const peopleTags = pgTable(
  "people_tags",
  {
    person_id: uuid()
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    tag_id: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.person_id, t.tag_id] })],
);

export const events = pgTable(
  "events",
  {
    id: uuid().primaryKey().defaultRandom(),
    person_id: uuid()
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: eventKindEnum().notNull().default("note"),
    content: text().notNull(),
    happened_at: date().notNull().defaultNow(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_person_id_idx").on(t.person_id, t.happened_at)],
);

export const peopleEmbeddings = pgTable(
  "people_embeddings",
  {
    person_id: uuid()
      .primaryKey()
      .references(() => people.id, { onDelete: "cascade" }),
    model: text().notNull(),
    embedding: vector({ dimensions: 1024 }).notNull(),
    source_text: text().notNull(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("people_embeddings_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const inbox = pgTable("inbox", {
  id: uuid().primaryKey().defaultRandom(),
  raw_text: text().notNull(),
  source: text().notNull(),
  status: inboxStatusEnum().notNull().default("pending"),
  intent: inboxIntentEnum(),
  parsed: jsonb().$type<Draft>(),
  applied_to: uuid().references(() => people.id, { onDelete: "set null" }),
  error: text(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  applied_at: timestamp({ withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type PersonRow = typeof people.$inferSelect;
export type NewPersonRow = typeof people.$inferInsert;
export type TagRow = typeof tags.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type InboxRow = typeof inbox.$inferSelect;
export type PersonEmbeddingRow = typeof peopleEmbeddings.$inferSelect;
