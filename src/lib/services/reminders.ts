import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { people, type TagRow } from "@/db/schema";
import { computeReminders, type Reminder } from "@/lib/reminders/compute";
import { REMINDER_THRESHOLD_DAYS } from "@/lib/reminders/thresholds";
import type { Tier } from "@/lib/schemas/enums";

import { attachTags, type PersonWithTags } from "./people";

export type ReminderItem = Reminder<PersonWithTags> & { tags: TagRow[] };

/**
 * "该联系了" list (design.md §14.3): people whose tier has a threshold and whose
 * last contact (falling back to met_at, then created_at) is older than it.
 * Most overdue first.
 */
export async function listReminders(now = new Date()): Promise<ReminderItem[]> {
  const tiers = Object.keys(REMINDER_THRESHOLD_DAYS) as Tier[];
  if (tiers.length === 0) return [];
  const rows = await db.select().from(people).where(inArray(people.tier, tiers));
  const withTags = await attachTags(rows);
  return computeReminders(withTags, now).map((r) => ({ ...r, tags: r.person.tags }));
}
