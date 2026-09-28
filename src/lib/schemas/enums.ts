import { z } from "zod";

// ---------------------------------------------------------------------------
// Enum values (design.md §7.1). This module is dependency-free apart from zod
// so it can be imported from client components, the DB schema and drizzle-kit.
// ---------------------------------------------------------------------------

export const TIER_VALUES = [
  "best_bros",
  "close_friends",
  "friends",
  "interacted",
  "known_of",
] as const;
export const GENDER_VALUES = ["male", "female", "other", "unknown"] as const;
export const TAG_KIND_VALUES = ["skill", "circle", "other"] as const;
export const EVENT_KIND_VALUES = [
  "met",
  "helped_me",
  "i_helped",
  "hangout",
  "note",
] as const;
export const INBOX_STATUS_VALUES = ["pending", "applied", "discarded"] as const;
export const INBOX_INTENT_VALUES = ["add", "update", "query", "unknown"] as const;
export const INBOX_SOURCE_VALUES = ["web", "shortcut", "ios"] as const;

export const Tier = z.enum(TIER_VALUES);
export const Gender = z.enum(GENDER_VALUES);
export const TagKind = z.enum(TAG_KIND_VALUES);
export const EventKind = z.enum(EVENT_KIND_VALUES);
export const InboxStatus = z.enum(INBOX_STATUS_VALUES);
export const InboxIntent = z.enum(INBOX_INTENT_VALUES);
export const InboxSource = z.enum(INBOX_SOURCE_VALUES);

export type Tier = z.infer<typeof Tier>;
export type Gender = z.infer<typeof Gender>;
export type TagKind = z.infer<typeof TagKind>;
export type EventKind = z.infer<typeof EventKind>;
export type InboxStatus = z.infer<typeof InboxStatus>;
export type InboxIntent = z.infer<typeof InboxIntent>;
export type InboxSource = z.infer<typeof InboxSource>;

// ---------------------------------------------------------------------------
// Display helpers. Tier display names keep the original English wording.
// ---------------------------------------------------------------------------

/** Higher rank = closer relationship (design.md §7.1). */
export const TIER_RANK: Record<Tier, number> = {
  best_bros: 5,
  close_friends: 4,
  friends: 3,
  interacted: 2,
  known_of: 1,
};

export const TIER_LABEL: Record<Tier, string> = {
  best_bros: "Best Bros",
  close_friends: "Close friends",
  friends: "Friends",
  interacted: "Interacted contacts",
  known_of: "People I know of",
};

export const GENDER_LABEL: Record<Gender, string> = {
  male: "男",
  female: "女",
  other: "其他",
  unknown: "未知",
};

export const TAG_KIND_LABEL: Record<TagKind, string> = {
  skill: "能力",
  circle: "圈子",
  other: "其他",
};

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  met: "认识",
  helped_me: "帮了我",
  i_helped: "我帮了他",
  hangout: "一起玩",
  note: "备注",
};

export const INBOX_STATUS_LABEL: Record<InboxStatus, string> = {
  pending: "待处理",
  applied: "已入库",
  discarded: "已丢弃",
};

export const INBOX_INTENT_LABEL: Record<InboxIntent, string> = {
  add: "新增",
  update: "更新",
  query: "查询",
  unknown: "未知",
};
