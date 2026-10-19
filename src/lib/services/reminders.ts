import { and, eq, inArray } from "drizzle-orm";

import { people, type TagRow } from "@/db/schema";
import type { ServiceContext } from "@/lib/auth/context";
import { withTenant } from "@/lib/auth/tenant";
import { computeReminders, type Reminder } from "@/lib/reminders/compute";
import { REMINDER_THRESHOLD_DAYS } from "@/lib/reminders/thresholds";
import type { Tier } from "@/lib/schemas/enums";

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
