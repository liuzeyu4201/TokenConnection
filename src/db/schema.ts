import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
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
import { users } from "./auth-schema";

export * from "./auth-schema";

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

export const people = pgTable(
  "people",
  {
  id: uuid().primaryKey().defaultRandom(),
  owner_id: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  aliases: text().array().notNull().default([]),
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
  /** Fork provenance (share). Null for records created in this library. */
  source: jsonb().$type<Record<string, string | null>>(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("people_owner_created_idx").on(t.owner_id, t.created_at, t.id),
    index("people_owner_tier_idx").on(t.owner_id, t.tier),
    index("people_owner_last_contact_idx").on(t.owner_id, t.last_contact_at),
    index("people_owner_name_idx").on(t.owner_id, sql`lower(${t.name})`),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid().primaryKey().defaultRandom(),
    owner_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: tagKindEnum().notNull().default("other"),
  },
  (t) => [
    unique("tags_owner_name_kind_unique").on(t.owner_id, t.name, t.kind),
    index("tags_owner_kind_idx").on(t.owner_id, t.kind),
  ],
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
    owner_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    person_id: uuid()
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: eventKindEnum().notNull().default("note"),
    content: text().notNull(),
    happened_at: date().notNull().defaultNow(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_person_id_idx").on(t.person_id, t.happened_at),
    index("events_owner_person_idx").on(t.owner_id, t.person_id, t.happened_at),
  ],
);

export const peopleEmbeddings = pgTable(
  "people_embeddings",
  {
    person_id: uuid()
      .primaryKey()
      .references(() => people.id, { onDelete: "cascade" }),
    owner_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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

export const inbox = pgTable(
  "inbox",
  {
  id: uuid().primaryKey().defaultRandom(),
  owner_id: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  raw_text: text().notNull(),
  source: text().notNull(),
  status: inboxStatusEnum().notNull().default("pending"),
  intent: inboxIntentEnum(),
  parsed: jsonb().$type<Draft>(),
  applied_to: uuid().references(() => people.id, { onDelete: "set null" }),
  error: text(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  applied_at: timestamp({ withTimezone: true }),
  },
  (t) => [index("inbox_owner_status_idx").on(t.owner_id, t.status, t.created_at)],
);

// ---------------------------------------------------------------------------
// Auth-adjacent tables. These are NOT under RLS: login, token lookup and
// admin actions happen before a tenant is known (multi-user-design.md §2.3).
// ---------------------------------------------------------------------------

export const userSettings = pgTable("user_settings", {
  user_id: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  llm_enabled: boolean().notNull().default(true),
  redact_contacts: boolean().notNull().default(true),
  vision_enabled: boolean().notNull().default(true),
  notify_share_email: boolean().notNull().default(false),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const invites = pgTable("invites", {
  id: uuid().primaryKey().defaultRandom(),
  code_hash: text().notNull().unique(),
  email: text(),
  role: text().notNull().default("member"),
  created_by: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires_at: timestamp({ withTimezone: true }).notNull(),
  used_by: uuid().references(() => users.id, { onDelete: "set null" }),
  used_at: timestamp({ withTimezone: true }),
  revoked_at: timestamp({ withTimezone: true }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    token_prefix: text().notNull(),
    token_hash: text().notNull().unique(),
    scopes: text().array().notNull(),
    expires_at: timestamp({ withTimezone: true }),
    last_used_at: timestamp({ withTimezone: true }),
    last_used_ip: text(),
    revoked_at: timestamp({ withTimezone: true }),
    legacy: boolean().notNull().default(false),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_tokens_user_idx").on(t.user_id)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    actor_user_id: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    target_type: text(),
    target_id: text(),
    subject_user_id: uuid().references(() => users.id, { onDelete: "set null" }),
    ip: text(),
    user_agent: text(),
    meta: jsonb().$type<Record<string, string | number | boolean | null>>(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_actor_idx").on(t.actor_user_id, t.created_at),
    index("audit_subject_idx").on(t.subject_user_id, t.created_at),
    index("audit_created_idx").on(t.created_at),
  ],
);

export const llmUsage = pgTable(
  "llm_usage",
  {
    user_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date().notNull(),
    extract_count: integer().notNull().default(0),
    vision_count: integer().notNull().default(0),
    embed_count: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.day] })],
);

export const pendingResetLinks = pgTable("pending_reset_links", {
  id: uuid().primaryKey().defaultRandom(),
  user_id: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  url_hash: text().notNull(),
  url_encrypted: text().notNull(),
  issued_by: uuid().references(() => users.id, { onDelete: "set null" }),
  expires_at: timestamp({ withTimezone: true }).notNull(),
  consumed_at: timestamp({ withTimezone: true }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
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
