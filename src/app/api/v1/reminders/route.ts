import type { NextRequest } from "next/server";

import { json, route } from "@/lib/api/handler";
import { REMINDER_THRESHOLD_DAYS } from "@/lib/reminders/thresholds";
import { listContactReminders, listReminders } from "@/lib/services/reminders";

export const GET = route(async (_request: NextRequest, _ctx, auth) => {
  const [items, feed] = await Promise.all([listReminders(auth), listContactReminders(auth)]);
  return json({
    items,
    follow_ups: feed.filter((item) => item.kind === "follow_up"),
    thresholds: REMINDER_THRESHOLD_DAYS,
  });
}, { scope: "reminders:read" });
