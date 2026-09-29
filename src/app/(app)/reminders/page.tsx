import type { Metadata } from "next";

import { ReminderList } from "@/components/reminder-list";
import { REMINDER_THRESHOLD_DAYS } from "@/lib/reminders/thresholds";
import { TIER_LABEL, type Tier } from "@/lib/schemas/enums";
import { listReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "该联系了" };

export default async function RemindersPage() {
  const items = await listReminders();
  const thresholds = Object.entries(REMINDER_THRESHOLD_DAYS) as Array<[Tier, number]>;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">该联系了</h1>
        <p className="text-sm text-muted-foreground">
          {thresholds.map(([tier, days]) => `${TIER_LABEL[tier]} ${days} 天`).join(" · ")}；其余两级不提醒。按逾期天数排序。点一个人进入详情。
        </p>
      </div>
      <ReminderList items={items.map((r) => ({ ...r, person: r.person }))} />
    </div>
  );
}
