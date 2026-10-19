import type { NextRequest } from "next/server";

import { json, route } from "@/lib/api/handler";
import { REMINDER_THRESHOLD_DAYS } from "@/lib/reminders/thresholds";
import { listReminders } from "@/lib/services/reminders";

export const GET = route(async (_request: NextRequest, _ctx, auth) => {
  return json({ items: await listReminders(auth), thresholds: REMINDER_THRESHOLD_DAYS });
}, { scope: "reminders:read" });
