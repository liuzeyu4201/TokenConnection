import { json, route } from "@/lib/api/handler";
import { REMINDER_THRESHOLD_DAYS } from "@/lib/reminders/thresholds";
import { listReminders } from "@/lib/services/reminders";

/**
 * GET /api/v1/reminders → { items: [{ person, basis, basis_at, threshold_days, days_since, overdue_days }], thresholds }
 * "该联系了" list (design.md §14.3), most overdue first.
 */
export const GET = route(async () => {
  const items = await listReminders();
  return json({ items, thresholds: REMINDER_THRESHOLD_DAYS });
});
