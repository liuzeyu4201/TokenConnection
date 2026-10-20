import { and, eq, inArray } from "drizzle-orm";

import { people, type TagRow } from "@/db/schema";
import type { ServiceContext } from "@/lib/auth/context";
import { getPrivacySettings } from "@/lib/auth/settings";
import { withTenant } from "@/lib/auth/tenant";
import { computeReminders, type Reminder } from "@/lib/reminders/compute";
import { buildReminderFeed, type ReminderFeedItem } from "@/lib/reminders/feed";
import { REMINDER_THRESHOLD_DAYS } from "@/lib/reminders/thresholds";
import type { Tier } from "@/lib/schemas/enums";
import { todayIso } from "@/lib/services/db-client";

import { listPendingFollowUps } from "./follow-ups";
import { attachTags, type PersonWithTags } from "./people";

export type ReminderItem = Reminder<PersonWithTags> & { tags: TagRow[] };

export async function listReminders(ctx: ServiceContext, now = new Date()): Promise<ReminderItem[]> {
  const tiers = Object.keys(REMINDER_THRESHOLD_DAYS) as Tier[];
  if (tiers.length === 0) return [];
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(people)
      .where(and(eq(people.owner_id, ctx.userId), inArray(people.tier, tiers)));
    const withTags = await attachTags(rows, tx);
    return computeReminders(withTags, now).map((r) => ({ ...r, tags: r.person.tags }));
  });
}

/** Tier reminders plus due follow-ups. The switch hides follow-ups without deleting them. */
export async function listContactReminders(ctx: ServiceContext, now = new Date()): Promise<ReminderFeedItem[]> {
  const [items, settings, pending] = await Promise.all([
    listReminders(ctx, now),
    getPrivacySettings(ctx.userId),
    listPendingFollowUps(ctx),
  ]);
  return buildReminderFeed(
    items.map((item) => ({
      person: { id: item.person.id, name: item.person.name, tier: item.person.tier },
      basis: item.basis,
      basis_at: item.basis_at,
      threshold_days: item.threshold_days,
      overdue_days: item.overdue_days,
    })),
    pending,
    { enabled: settings.follow_up_enabled, today: todayIso(now) },
  );
}
