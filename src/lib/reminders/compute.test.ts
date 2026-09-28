import { describe, expect, it } from "vitest";

import { computeReminder, computeReminders, daysBetween, reminderBasis, type ReminderPersonInput } from "./compute";
import { REMINDER_THRESHOLD_DAYS, reminderThresholdFor } from "./thresholds";

const NOW = new Date("2026-09-28T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const make = (over: Partial<ReminderPersonInput> & Pick<ReminderPersonInput, "tier">): ReminderPersonInput => ({
  id: over.id ?? "p",
  tier: over.tier,
  last_contact_at: over.last_contact_at ?? null,
  met_at: over.met_at ?? null,
  created_at: over.created_at ?? daysAgo(400),
});

describe("thresholds", () => {
  it("are 30 / 60 / 120 days and absent for the two outer tiers", () => {
    expect(REMINDER_THRESHOLD_DAYS).toEqual({ best_bros: 30, close_friends: 60, friends: 120 });
    expect(reminderThresholdFor("interacted")).toBeNull();
    expect(reminderThresholdFor("known_of")).toBeNull();
  });
});

describe("computeReminder", () => {
  it("is due only when strictly past the threshold", () => {
    expect(computeReminder(make({ tier: "best_bros", last_contact_at: daysAgo(29) }), NOW)).toBeNull();
    expect(computeReminder(make({ tier: "best_bros", last_contact_at: daysAgo(30) }), NOW)).toBeNull();
    const due = computeReminder(make({ tier: "best_bros", last_contact_at: daysAgo(31) }), NOW);
    expect(due).toMatchObject({ threshold_days: 30, days_since: 31, overdue_days: 1, basis: "last_contact_at" });
  });

  it("uses tier-specific thresholds", () => {
    expect(computeReminder(make({ tier: "close_friends", last_contact_at: daysAgo(59) }), NOW)).toBeNull();
    expect(computeReminder(make({ tier: "close_friends", last_contact_at: daysAgo(61) }), NOW)?.overdue_days).toBe(1);
    expect(computeReminder(make({ tier: "friends", last_contact_at: daysAgo(119) }), NOW)).toBeNull();
    expect(computeReminder(make({ tier: "friends", last_contact_at: daysAgo(200) }), NOW)?.overdue_days).toBe(80);
  });

  it("never reminds about interacted / known_of", () => {
    expect(computeReminder(make({ tier: "interacted", last_contact_at: daysAgo(1000) }), NOW)).toBeNull();
    expect(computeReminder(make({ tier: "known_of", created_at: daysAgo(1000) }), NOW)).toBeNull();
  });

  it("falls back last_contact_at → met_at → created_at", () => {
    expect(reminderBasis(make({ tier: "friends", last_contact_at: daysAgo(5), met_at: "2020-01-01" })).basis).toBe("last_contact_at");
    expect(reminderBasis(make({ tier: "friends", met_at: "2020-01-01" })).basis).toBe("met_at");
    expect(reminderBasis(make({ tier: "friends" })).basis).toBe("created_at");

    const viaMet = computeReminder(make({ tier: "friends", met_at: "2026-01-01", created_at: daysAgo(1) }), NOW);
    expect(viaMet?.basis).toBe("met_at");
    expect(viaMet?.days_since).toBeGreaterThan(120);

    const viaCreated = computeReminder(make({ tier: "best_bros", created_at: daysAgo(45) }), NOW);
    expect(viaCreated).toMatchObject({ basis: "created_at", overdue_days: 15 });
  });

  it("daysBetween floors whole days", () => {
    expect(daysBetween(NOW.getTime() - 86_400_000 * 2.9, NOW.getTime())).toBe(2);
  });
});

describe("computeReminders", () => {
  it("sorts by overdue days descending and drops the not-due", () => {
    const list = computeReminders(
      [
        make({ id: "a", tier: "friends", last_contact_at: daysAgo(150) }), // overdue 30
        make({ id: "b", tier: "best_bros", last_contact_at: daysAgo(100) }), // overdue 70
        make({ id: "c", tier: "close_friends", last_contact_at: daysAgo(10) }), // not due
        make({ id: "d", tier: "interacted", last_contact_at: daysAgo(999) }), // never
      ],
      NOW,
    );
    expect(list.map((r) => r.person.id)).toEqual(["b", "a"]);
    expect(list[0].overdue_days).toBe(70);
  });
});
