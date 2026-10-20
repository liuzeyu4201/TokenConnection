import {
  calendarDaysBetween,
  visibleFollowUps,
  type FollowUpOffset,
} from "@/lib/followups/plan";
import type { FollowUpStatus, Tier } from "@/lib/schemas/enums";

export type ReminderPerson = { id: string; name: string; tier: Tier };

export type TierReminderSeed = {
  person: ReminderPerson;
  basis: "last_contact_at" | "met_at" | "created_at";
  basis_at: string;
  threshold_days: number;
  overdue_days: number;
};

export type FollowUpSeed = {
  id: string;
  person: ReminderPerson;
  suggestion: string;
  due_on: string;
  offset_days: number;
  status: FollowUpStatus;
};

export type ReminderFeedItem =
  | ({ kind: "tier"; key: string } & TierReminderSeed)
  | {
      kind: "follow_up";
      key: string;
      id: string;
      person: ReminderPerson;
      suggestion: string;
      due_on: string;
      offset_days: FollowUpOffset | number;
      overdue_days: number;
    };

/**
 * Tier reminders stay as they are. Follow-ups join only when the switch is on,
 * the step is still pending, and the due day is today or earlier.
 */
export function buildReminderFeed(
  tiers: TierReminderSeed[],
  followUps: FollowUpSeed[],
  opts: { enabled: boolean; today: string },
): ReminderFeedItem[] {
  const today = opts.today.slice(0, 10);
  const tierItems: ReminderFeedItem[] = tiers.map((item) => ({
    kind: "tier",
    key: `tier:${item.person.id}`,
    ...item,
  }));
  const followItems: ReminderFeedItem[] = visibleFollowUps(followUps, { enabled: opts.enabled, today }).map((step) => ({
    kind: "follow_up",
    key: `follow:${step.id}`,
    id: step.id,
    person: step.person,
    suggestion: step.suggestion,
    due_on: step.due_on.slice(0, 10),
    offset_days: step.offset_days,
    overdue_days: Math.max(0, calendarDaysBetween(step.due_on, today)),
  }));
  return [...tierItems, ...followItems].sort(
    (a, b) => b.overdue_days - a.overdue_days || a.key.localeCompare(b.key),
  );
}
