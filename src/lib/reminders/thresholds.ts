import type { Tier } from "@/lib/schemas/enums";

/**
 * "该联系了" thresholds in days (design.md §14.3). Tiers missing from this map
 * are never reminded about (Interacted contacts, People I know of).
 * Tune here only.
 */
export const REMINDER_THRESHOLD_DAYS: Partial<Record<Tier, number>> = {
  best_bros: 30,
  close_friends: 60,
  friends: 120,
};

export function reminderThresholdFor(tier: Tier): number | null {
  return REMINDER_THRESHOLD_DAYS[tier] ?? null;
}
