import type { Metadata } from "next";

import { ReminderList } from "@/components/reminder-list";
import { REMINDER_THRESHOLD_DAYS } from "@/lib/reminders/thresholds";
import { TIER_LABEL, type Tier } from "@/lib/schemas/enums";
import { requireUser } from "@/lib/auth/dal";
import { listContactReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "该联系了" };

export default async function RemindersPage() {
  const user = await requireUser("/reminders");
  const items = await listContactReminders(user);
  const thresholds = Object.entries(REMINDER_THRESHOLD_DAYS) as Array<[Tier, number]>;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">该联系了</h1>
        <p className="text-sm text-muted-foreground">
          {thresholds.map(([tier, days]) => `${TIER_LABEL[tier]} ${days} 天`).join(" · ")}；其余两级不提醒。回访是另一件事：新加入的人到了第 2 天、3 天、1 周、1 个月会标「回访」。没到期的不进这个列表。按逾期天数排序。
        </p>
      </div>
      <ReminderList items={items} />
    </div>
  );
}
