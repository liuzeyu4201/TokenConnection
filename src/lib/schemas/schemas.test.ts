import { describe, expect, it } from "vitest";

import { DraftSchema, fallbackDraft } from "./draft";
import { EventCreateSchema } from "./event";
import { InboxApplySchema, InboxCreateSchema, InboxQuerySchema } from "./inbox";
import { PeopleQuerySchema, PersonCreateSchema, PersonUpdateSchema, SetPersonTagsSchema } from "./person";
import { SearchQuerySchema } from "./search";
import { TagCreateSchema, TagUpdateSchema } from "./tag";

const UUID = "3984ac00-28a1-484e-9647-1609743747b8";

const validDraft = {
  intent: "add",
  target_person_id: null,
  target_confidence: 0,
  person: {
    name: "小王",
    gender: "male",
    location: "深圳",
    tier: "interacted",
    summary: "羽毛球教练",
    impression: "人很热情",
    contacts: { wechat: "wx123" },
    how_met: "球馆认识",
    met_at: "2026-09-28",
  },
  tags: [{ name: "羽毛球", kind: "skill" }],
  events: [{ kind: "met", content: "球馆认识", happened_at: "2026-09-28" }],
};

describe("DraftSchema (design.md §9.1)", () => {
  it("accepts a well-formed draft", () => {
    const parsed = DraftSchema.parse(validDraft);
    expect(parsed.person.name).toBe("小王");
    expect(parsed.person.contacts).toEqual({ wechat: "wx123" });
  });

  it("accepts an update draft pointing at an existing person", () => {
    const parsed = DraftSchema.parse({
      ...validDraft,
      intent: "update",
      target_person_id: UUID,
      target_confidence: 0.9,
    });
    expect(parsed.target_person_id).toBe(UUID);
  });

  it("rejects invalid enum values, confidence out of range and bad dates", () => {
    expect(DraftSchema.safeParse({ ...validDraft, intent: "delete" }).success).toBe(false);
    expect(DraftSchema.safeParse({ ...validDraft, target_confidence: 1.5 }).success).toBe(false);
    expect(DraftSchema.safeParse({ ...validDraft, target_person_id: "not-a-uuid" }).success).toBe(false);
    expect(
      DraftSchema.safeParse({ ...validDraft, person: { ...validDraft.person, tier: "bestie" } }).success,
    ).toBe(false);
    expect(
      DraftSchema.safeParse({ ...validDraft, person: { ...validDraft.person, met_at: "2026/09/28" } }).success,
    ).toBe(false);
    expect(
      DraftSchema.safeParse({ ...validDraft, events: [{ kind: "met", content: "x", happened_at: "昨天" }] })
        .success,
    ).toBe(false);
  });

  it("normalizes empty strings to null and drops empty contact values", () => {
    const parsed = DraftSchema.parse({
      ...validDraft,
      person: { ...validDraft.person, summary: "   ", location: "", contacts: { wechat: "", phone: " 138 " } },
    });
    expect(parsed.person.summary).toBeNull();
    expect(parsed.person.location).toBeNull();
    expect(parsed.person.contacts).toEqual({ phone: "138" });
  });

  it("defaults contacts to {} when missing", () => {
    const { contacts: _omit, ...personWithoutContacts } = validDraft.person;
    void _omit;
    const parsed = DraftSchema.parse({ ...validDraft, person: personWithoutContacts });
    expect(parsed.person.contacts).toEqual({});
  });

  it("fallbackDraft puts the raw text into summary", () => {
    const draft = fallbackDraft("  今天认识了一个人  ");
    expect(draft.intent).toBe("add");
    expect(draft.person.summary).toBe("今天认识了一个人");
    expect(DraftSchema.safeParse(draft).success).toBe(true);
  });
});

describe("person schemas", () => {
  it("PersonCreateSchema requires a name and applies defaults", () => {
    const parsed = PersonCreateSchema.parse({ name: " 老李 " });
    expect(parsed).toMatchObject({ name: "老李", gender: "unknown", tier: "known_of" });
    expect(PersonCreateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(PersonCreateSchema.safeParse({ tier: "friends" }).success).toBe(false);
  });

  it("PersonUpdateSchema rejects empty patches and unknown tiers", () => {
    expect(PersonUpdateSchema.safeParse({}).success).toBe(false);
    expect(PersonUpdateSchema.safeParse({ tier: "nope" }).success).toBe(false);
    expect(PersonUpdateSchema.parse({ location: "" })).toEqual({ location: null });
  });

  it("SetPersonTagsSchema defaults tag kind to other", () => {
    expect(SetPersonTagsSchema.parse({ tags: [{ name: "x" }] }).tags[0].kind).toBe("other");
  });

  it("PeopleQuerySchema coerces query-string values", () => {
    const parsed = PeopleQuerySchema.parse({ tier: "", tag: "球友", location: "", q: " 教练 ", limit: "500" });
    expect(parsed.tier).toBeUndefined();
    expect(parsed.location).toBeUndefined();
    expect(parsed.tag).toBe("球友");
    expect(parsed.q).toBe("教练");
    expect(parsed.limit).toBe(200);
    expect(PeopleQuerySchema.parse({}).limit).toBe(50);
    expect(PeopleQuerySchema.safeParse({ tier: "vip" }).success).toBe(false);
  });
});

describe("tag / event / inbox / search schemas", () => {
  it("TagCreateSchema and TagUpdateSchema", () => {
    expect(TagCreateSchema.parse({ name: "羽毛球" })).toEqual({ name: "羽毛球", kind: "other" });
    expect(TagUpdateSchema.safeParse({}).success).toBe(false);
    expect(TagUpdateSchema.parse({ kind: "circle" })).toEqual({ kind: "circle" });
  });

  it("EventCreateSchema", () => {
    expect(EventCreateSchema.parse({ content: "帮我修了球拍" })).toEqual({ kind: "note", content: "帮我修了球拍" });
    expect(EventCreateSchema.safeParse({ content: "" }).success).toBe(false);
    expect(EventCreateSchema.safeParse({ content: "x", happened_at: "2026-13-01" }).success).toBe(false);
  });

  it("InboxCreateSchema", () => {
    expect(InboxCreateSchema.parse({ raw_text: "小王" })).toEqual({ raw_text: "小王", source: "web" });
    expect(InboxCreateSchema.parse({ raw_text: "x", source: "shortcut", person_id: UUID }).person_id).toBe(UUID);
    expect(InboxCreateSchema.safeParse({ raw_text: "x", source: "email" }).success).toBe(false);
    expect(InboxCreateSchema.safeParse({ raw_text: "   " }).success).toBe(false);
  });

  it("InboxQuerySchema defaults to pending", () => {
    expect(InboxQuerySchema.parse({})).toEqual({ status: "pending", limit: 50 });
    expect(InboxQuerySchema.parse({ status: "applied", limit: "10" })).toEqual({ status: "applied", limit: 10 });
  });

  it("InboxApplySchema wraps a draft", () => {
    expect(InboxApplySchema.safeParse({ draft: validDraft }).success).toBe(true);
    expect(InboxApplySchema.safeParse({}).success).toBe(false);
  });

  it("SearchQuerySchema trims q and bounds limit", () => {
    expect(SearchQuerySchema.parse({ q: " 羽毛球教练 " })).toMatchObject({ q: "羽毛球教练", limit: 20 });
    expect(SearchQuerySchema.parse({ q: "x", limit: "1000" }).limit).toBe(100);
    expect(SearchQuerySchema.parse({}).q).toBe("");
  });
});
