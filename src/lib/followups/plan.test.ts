import { describe, expect, it } from "vitest";

import { buildReminderFeed } from "@/lib/reminders/feed";

import {
  buildFollowUpUserPrompt,
  followUpPromptFields,
  followUpSchedule,
  normalizeFollowUpSuggestions,
  parseFollowUpModelText,
  suggestFollowUps,
  templateFollowUpSuggestions,
  visibleFollowUps,
} from "./plan";

describe("followUpSchedule", () => {
  it("counts four dates from the day they joined the library", () => {
    expect(followUpSchedule("2026-10-20")).toEqual([
      { offset_days: 1, due_on: "2026-10-21" },
      { offset_days: 3, due_on: "2026-10-23" },
      { offset_days: 7, due_on: "2026-10-27" },
      { offset_days: 30, due_on: "2026-11-19" },
    ]);
    expect(followUpSchedule("2026-12-20T23:30:00").map((step) => step.due_on)).toEqual([
      "2026-12-21",
      "2026-12-23",
      "2026-12-27",
      "2027-01-19",
    ]);
  });
});

describe("suggestFollowUps", () => {
  it("uses the template when outbound models are off", async () => {
    let called = false;
    const result = await suggestFollowUps(
      { howMet: null, summary: "羽毛球教练", llmEnabled: false, redact: true },
      async () => {
        called = true;
        return { suggestions: ["不应该用"] };
      },
    );
    expect(called).toBe(false);
    expect(result.source).toBe("template");
    expect(result.suggestions).toEqual(templateFollowUpSuggestions(null));
    expect(result.suggestions).toHaveLength(4);
    expect(result.suggestions.every((line) => line.trim().length > 0)).toBe(true);
    expect(result.suggestions[0]).toBe("发一条近况，问对方最近怎么样");
  });

  it("uses the template when the model fails, and still fills all four", async () => {
    const result = await suggestFollowUps(
      { howMet: "球馆认识", summary: "印象原文不该出现在建议里", llmEnabled: true, redact: true },
      async () => {
        throw new Error("down");
      },
    );
    expect(result.source).toBe("template");
    expect(result.suggestions).toHaveLength(4);
    expect(result.suggestions.every((line) => line.trim().length > 0)).toBe(true);
    expect(result.suggestions[0]).toContain("球馆认识");
    expect(result.suggestions.join("\n")).not.toContain("印象原文");
  });

  it("keeps contacts out of the prompt and falls back if the model echoes one", async () => {
    const fields = followUpPromptFields({
      howMet: "球馆认识，微信 wxid_abcde",
      summary: "羽毛球教练，电话 13800138000",
      redact: true,
    });
    expect(fields).not.toBeNull();
    const prompt = buildFollowUpUserPrompt(fields!);
    expect(prompt).toContain("球馆认识");
    expect(prompt).toContain("羽毛球教练");
    expect(prompt).not.toContain("wxid_abcde");
    expect(prompt).not.toContain("13800138000");
    expect(prompt).not.toContain("印象");

    const result = await suggestFollowUps(
      { howMet: "球馆认识", summary: "羽毛球教练", llmEnabled: true, redact: true },
      async () => ({
        suggestions: ["问他还去不去球馆", "电话 13800138000 约一场", "发一张球场近况", "问他这个月还打不打"],
      }),
    );
    expect(result.source).toBe("model");
    expect(result.suggestions[1]).toBe(templateFollowUpSuggestions("球馆认识")[1]);
    expect(result.suggestions.join("\n")).not.toContain("13800138000");
    expect(result.suggestions.every((line) => line.trim().length > 0)).toBe(true);
  });
});

describe("parseFollowUpModelText", () => {
  it("accepts a reminders array when the model skips the requested key", () => {
    const parsed = parseFollowUpModelText('{"reminders":["第2天：问他还去不去","乙","丙","丁"]}');
    const suggestions = normalizeFollowUpSuggestions(parsed, templateFollowUpSuggestions("球馆认识"));
    expect(suggestions[0]).toBe("问他还去不去");
    expect(suggestions[1]).toBe("乙");
  });
});

describe("visibleFollowUps", () => {
  const steps = [
    { id: "due", status: "pending" as const, due_on: "2026-10-20" },
    { id: "future", status: "pending" as const, due_on: "2026-10-21" },
    { id: "done", status: "done" as const, due_on: "2026-10-19" },
    { id: "skipped", status: "skipped" as const, due_on: "2026-10-18" },
  ];

  it("shows nothing while the switch is off", () => {
    expect(visibleFollowUps(steps, { enabled: false, today: "2026-10-20" })).toEqual([]);
  });

  it("keeps only pending steps that are due, and leaves tier reminders in the feed", () => {
    expect(visibleFollowUps(steps, { enabled: true, today: "2026-10-20" }).map((step) => step.id)).toEqual(["due"]);
    const feed = buildReminderFeed(
      [
        {
          person: { id: "old", name: "甲", tier: "friends" },
          basis: "last_contact_at",
          basis_at: "2026-01-01T00:00:00.000Z",
          threshold_days: 120,
          overdue_days: 3,
        },
      ],
      [
        {
          id: "due",
          person: { id: "new", name: "乙", tier: "interacted" },
          suggestion: "发一条近况，问对方最近怎么样",
          due_on: "2026-10-20",
          offset_days: 1,
          status: "pending",
        },
        {
          id: "future",
          person: { id: "new", name: "乙", tier: "interacted" },
          suggestion: "再发一句，问对方这几天过得怎样",
          due_on: "2026-10-22",
          offset_days: 3,
          status: "pending",
        },
      ],
      { enabled: false, today: "2026-10-20" },
    );
    expect(feed.map((item) => item.kind)).toEqual(["tier"]);

    const open = buildReminderFeed(
      [
        {
          person: { id: "old", name: "甲", tier: "friends" },
          basis: "last_contact_at",
          basis_at: "2026-01-01T00:00:00.000Z",
          threshold_days: 120,
          overdue_days: 3,
        },
      ],
      [
        {
          id: "due",
          person: { id: "new", name: "乙", tier: "interacted" },
          suggestion: "发一条近况，问对方最近怎么样",
          due_on: "2026-10-20",
          offset_days: 1,
          status: "pending",
        },
        {
          id: "future",
          person: { id: "new", name: "乙", tier: "interacted" },
          suggestion: "再发一句，问对方这几天过得怎样",
          due_on: "2026-10-22",
          offset_days: 3,
          status: "pending",
        },
        {
          id: "done",
          person: { id: "new", name: "乙", tier: "interacted" },
          suggestion: "已完成的不再提醒",
          due_on: "2026-10-19",
          offset_days: 1,
          status: "done",
        },
      ],
      { enabled: true, today: "2026-10-20" },
    );
    expect(open.map((item) => (item.kind === "follow_up" ? item.id : item.person.id))).toEqual(["old", "due"]);
  });
});
