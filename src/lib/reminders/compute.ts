import type { Tier } from "@/lib/schemas/enums";

import { reminderThresholdFor } from "./thresholds";

export type ReminderPersonInput = {
  id: string;
  tier: Tier;
  /** ISO timestamp or Date; null when there are no events yet. */
  last_contact_at: string | Date | null;
  /** YYYY-MM-DD or null. */
  met_at: string | null;
  created_at: string | Date;
};

export type Reminder<T extends ReminderPersonInput = ReminderPersonInput> = {
  person: T;
  /** Which timestamp the computation was based on. */
  basis: "last_contact_at" | "met_at" | "created_at";
  basis_at: string;
  threshold_days: number;
  days_since: number;
  overdue_days: number;
};

const DAY_MS = 86_400_000;

function toTime(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** last_contact_at → met_at → created_at (design.md §14.3 + stage-2 decision). */
export function reminderBasis(person: ReminderPersonInput): { basis: Reminder["basis"]; at: number } {
  if (person.last_contact_at) return { basis: "last_contact_at", at: toTime(person.last_contact_at) };
  if (person.met_at) return { basis: "met_at", at: Date.parse(`${person.met_at}T00:00:00`) };
  return { basis: "created_at", at: toTime(person.created_at) };
}

/** Whole days between two instants (floor). */
export function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / DAY_MS);
}

/**
 * Compute one reminder or null. A person is due when the days since the basis
 * strictly exceed the tier threshold; exactly at the threshold is not yet due.
 */
export function computeReminder<T extends ReminderPersonInput>(person: T, now = new Date()): Reminder<T> | null {
  const threshold = reminderThresholdFor(person.tier);
  if (threshold === null) return null;
  const { basis, at } = reminderBasis(person);
  if (!Number.isFinite(at)) return null;
  const daysSince = daysBetween(at, now.getTime());
  if (daysSince <= threshold) return null;
  return {
    person,
    basis,
    basis_at: new Date(at).toISOString(),
    threshold_days: threshold,
    days_since: daysSince,
    overdue_days: daysSince - threshold,
  };
}

/** All due reminders, most overdue first (ties: closer tier first, then id). */
export function computeReminders<T extends ReminderPersonInput>(people: T[], now = new Date()): Reminder<T>[] {
  return people
    .map((p) => computeReminder(p, now))
    .filter((r): r is Reminder<T> => r !== null)
    .sort((a, b) => b.overdue_days - a.overdue_days || a.person.id.localeCompare(b.person.id));
}
