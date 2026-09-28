import type { Draft } from "@/lib/schemas/draft";
import type {
  EventKind,
  Gender,
  InboxIntent,
  InboxStatus,
  TagKind,
  Tier,
} from "@/lib/schemas/enums";

/**
 * JSON-shaped types shared by client components. Server components receive
 * Date objects from the DB, client fetches receive ISO strings, hence the
 * `string | Date` unions on timestamps.
 */

export type DateValue = string | Date;

export type ApiTag = { id: string; name: string; kind: TagKind };

export type ApiPerson = {
  id: string;
  name: string;
  gender: Gender;
  location: string | null;
  tier: Tier;
  summary: string | null;
  impression: string | null;
  contacts: Record<string, string>;
  how_met: string | null;
  met_at: string | null;
  last_contact_at: DateValue | null;
  primary_circle_tag_id: string | null;
  lat: number | null;
  lng: number | null;
  geo_manual: boolean;
  created_at: DateValue;
  updated_at: DateValue;
  tags: ApiTag[];
};

// ---- Stage 2: maps & reminders --------------------------------------------

export type ApiMapPerson = {
  id: string;
  name: string;
  tier: Tier;
  location: string | null;
  summary: string | null;
  last_contact_at: string | null;
  tags: ApiTag[];
  sector: string;
  primary_circle_tag_id: string | null;
};

export type ApiRadialLayout = {
  rings: Array<{ tier: Tier; rank: number; radius: number; innerRadius: number; outerRadius: number }>;
  sectors: Array<{ name: string; startAngle: number; endAngle: number; count: number }>;
  points: Array<{ id: string; x: number; y: number; angle: number; radius: number; tier: Tier; sector: string }>;
};

export type ApiRadialMap = {
  people: ApiMapPerson[];
  layout: ApiRadialLayout;
  skills: string[];
  locations: string[];
};

export type ApiGeoCluster = { key: string; lat: number; lng: number; label: string; people: ApiMapPerson[] };

export type ApiGeoMap = {
  clusters: ApiGeoCluster[];
  unlocated: Array<{ id: string; name: string; tier: Tier; location: string | null }>;
  no_location_count: number;
  located_count: number;
  skills: string[];
};

export type ApiReminder = {
  person: ApiPerson;
  basis: "last_contact_at" | "met_at" | "created_at";
  basis_at: string;
  threshold_days: number;
  days_since: number;
  overdue_days: number;
};

export type ApiEvent = {
  id: string;
  person_id: string;
  kind: EventKind;
  content: string;
  happened_at: string;
  created_at: DateValue;
};

export type ApiPersonDetail = ApiPerson & { events: ApiEvent[] };

export type ApiSearchHit = {
  person: ApiPerson;
  score: number;
  reasons: string[];
  semantic: number | null;
  keyword_hit: boolean;
};

export type ApiSearchResponse = {
  query: string;
  hits: ApiSearchHit[];
  semantic_skipped: boolean;
};

export type ApiInbox = {
  id: string;
  raw_text: string;
  source: string;
  status: InboxStatus;
  intent: InboxIntent | null;
  parsed: Draft | null;
  applied_to: string | null;
  error: string | null;
  created_at: DateValue;
  applied_at: DateValue | null;
};

export type ApiCandidate = {
  id: string;
  name: string;
  tier: Tier;
  location: string | null;
  summary: string | null;
};

export type ApiInboxParseResult = {
  inbox: ApiInbox;
  draft: Draft;
  candidates: ApiCandidate[];
  results?: ApiSearchResponse;
  error: string | null;
};

export type ApiInboxApplyResult = {
  inbox: ApiInbox;
  person: ApiPersonDetail;
};

export type ApiTagWithCount = ApiTag & { people_count: number };
