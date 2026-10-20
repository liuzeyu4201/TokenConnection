import type { EventKind, Gender, TagKind, Tier } from "@/lib/schemas/enums";

/**
 * Field switches for a share snapshot (multi-user-design.md §7.2).
 * `name` is always included. Defaults are the "public-safe" set.
 */
export type ShareFields = {
  name: true;
  gender: boolean;
  location: boolean;
  tags: "all" | "skills" | "none";
  how_met: boolean;
  met_at: boolean;
  summary: boolean;
  impression: boolean;
  contacts: string[];
  events: "none" | "all" | { kinds: EventKind[] };
  tier: boolean;
  show_owner_name: boolean;
};

export const DEFAULT_SHARE_FIELDS: ShareFields = {
  name: true,
  gender: true,
  location: true,
  tags: "all",
  how_met: true,
  met_at: true,
  summary: false,
  impression: false,
  contacts: [],
  events: "none",
  tier: false,
  show_owner_name: true,
};

export type SnapshotPerson = {
  name: string;
  gender: Gender;
  location: string | null;
  tags: Array<{ name: string; kind: TagKind }>;
  how_met: string | null;
  met_at: string | null;
  summary: string | null;
  impression: string | null;
  contacts: Record<string, string>;
  events: Array<{ kind: EventKind; content: string; happened_at: string }>;
  tier: Tier;
  lat: number | null;
  lng: number | null;
};

export type ShareSnapshot = {
  version: 1;
  name: string;
  gender?: Gender;
  location?: string | null;
  tags?: Array<{ name: string; kind: TagKind }>;
  how_met?: string | null;
  met_at?: string | null;
  summary?: string | null;
  impression?: string | null;
  contacts?: Record<string, string>;
  events?: Array<{ kind: EventKind; content: string; happened_at: string }>;
  tier?: Tier;
  lat?: number | null;
  lng?: number | null;
};

const CONTACT_KEY = /^[\p{L}\p{N}_.-]{1,40}$/u;

/** Fill omitted switches with the public-safe defaults. `name` cannot be turned off. */
export function normalizeShareFields(input: Partial<ShareFields> | null | undefined): ShareFields {
  const raw = input ?? {};
  const contacts = Array.isArray(raw.contacts)
    ? [...new Set(raw.contacts.map((key) => key.trim()).filter((key) => CONTACT_KEY.test(key)))]
    : [];
  let events: ShareFields["events"] = "none";
  if (raw.events === "all" || raw.events === "none") events = raw.events;
  else if (raw.events && typeof raw.events === "object" && Array.isArray(raw.events.kinds)) {
    events = { kinds: raw.events.kinds };
  }
  const tags = raw.tags === "skills" || raw.tags === "none" || raw.tags === "all" ? raw.tags : "all";
  return {
    name: true,
    gender: raw.gender ?? true,
    location: raw.location ?? true,
    tags,
    how_met: raw.how_met ?? true,
    met_at: raw.met_at ?? true,
    summary: raw.summary ?? false,
    impression: raw.impression ?? false,
    contacts,
    events,
    tier: raw.tier ?? false,
    show_owner_name: raw.show_owner_name ?? true,
  };
}

/**
 * Copy only the checked fields into a versioned snapshot.
 * Unchecked groups are omitted entirely (not stored as empty objects).
 */
export function buildShareSnapshot(source: SnapshotPerson, fields: ShareFields): ShareSnapshot {
  const snapshot: ShareSnapshot = { version: 1, name: source.name.trim() };
  if (fields.gender) snapshot.gender = source.gender;
  if (fields.location) {
    snapshot.location = source.location;
    snapshot.lat = source.lat;
    snapshot.lng = source.lng;
  }
  if (fields.tags === "all") snapshot.tags = source.tags.map((tag) => ({ name: tag.name, kind: tag.kind }));
  else if (fields.tags === "skills") {
    snapshot.tags = source.tags.filter((tag) => tag.kind === "skill").map((tag) => ({ name: tag.name, kind: tag.kind }));
  }
  if (fields.how_met) snapshot.how_met = source.how_met;
  if (fields.met_at) snapshot.met_at = source.met_at;
  if (fields.summary) snapshot.summary = source.summary;
  if (fields.impression) snapshot.impression = source.impression;
  if (fields.contacts.length > 0) {
    const contacts: Record<string, string> = {};
    for (const key of fields.contacts) {
      const value = source.contacts[key];
      if (typeof value === "string" && value.length > 0) contacts[key] = value;
    }
    if (Object.keys(contacts).length > 0) snapshot.contacts = contacts;
  }
  if (fields.events === "all") {
    snapshot.events = source.events.map((event) => ({ ...event }));
  } else if (typeof fields.events === "object") {
    const kinds = new Set(fields.events.kinds);
    snapshot.events = source.events.filter((event) => kinds.has(event.kind)).map((event) => ({ ...event }));
  }
  if (fields.tier) snapshot.tier = source.tier;
  return snapshot;
}

/** Keys that must be absent from a default snapshot (B1). */
export const PRIVATE_SNAPSHOT_KEYS = ["contacts", "summary", "impression", "events", "tier"] as const;
