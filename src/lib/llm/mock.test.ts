import { describe, expect, it } from "vitest";

import { EMBEDDING_DIM } from "@/lib/env";
import { DraftSchema } from "@/lib/schemas/draft";

import { normalizeDraft } from "./extract";
import {
  extractContacts,
  extractName,
  looksLikeQuery,
  mockEmbed,
  mockExtract,
  mockTokenize,
  parseDateHint,
} from "./mock";
import { parseInputPrefix } from "./prefix";
import type { PeopleIndexEntry } from "./types";

const TODAY = "2026-09-28";
const INDEX: PeopleIndexEntry[] = [
  { id: "3984ac00-28a1-484e-9647-1609743747b8", name: "老李", summary_line: "杭州 · Close friends" },
  { id: "18884fea-fc4d-43e8-b740-fd1cbcda6274", name: "小王", summary_line: "深圳 · 羽毛球教练" },
];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

describe("parseInputPrefix", () => {
  it("+ forces record, ? forces query, full-width variants included", () => {
    expect(parseInputPrefix("+小王")).toEqual({ text: "小王", forcedIntent: "add" });
    expect(parseInputPrefix("＋ 小王 ")).toEqual({ text: "小王", forcedIntent: "add" });
    expect(parseInputPrefix("?小王")).toEqual({ text: "小王", forcedIntent: "query" });
    expect(parseInputPrefix("？谁会修球拍")).toEqual({ text: "谁会修球拍", forcedIntent: "query" });
    expect(parseInputPrefix("  小王  ")).toEqual({ text: "小王" });
  });
});

describe("mockExtract – scenario A: add", () => {
  const draft = mockExtract("今天球馆认识小王，羽毛球教练，深圳，微信 wx123，人很热情", [], { today: TODAY });

  it("produces a schema-valid add draft", () => {
    expect(DraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.intent).toBe("add");
    expect(draft.target_person_id).toBeNull();
  });

  it("extracts name, location, tier, contacts, impression and tags", () => {
    expect(draft.person.name).toBe("小王");
    expect(draft.person.location).toBe("深圳");
    expect(draft.person.tier).toBe("interacted");
    expect(draft.person.contacts).toEqual({ wechat: "wx123" });
    expect(draft.person.impression).toBe("人很热情");
    expect(draft.person.met_at).toBe(TODAY);
    expect(draft.tags).toEqual(
      expect.arrayContaining([
        { name: "羽毛球", kind: "skill" },
        { name: "教练", kind: "skill" },
        { name: "球友", kind: "circle" },
      ]),
    );
    expect(draft.person.summary).toContain("羽毛球教练");
    expect(draft.person.summary).not.toContain("wx123");
  });

  it("adds a `met` event dated today", () => {
    expect(draft.events).toHaveLength(1);
    expect(draft.events[0]).toMatchObject({ kind: "met", happened_at: TODAY });
  });
});

describe("mockExtract – scenario B: update of an existing person", () => {
  it("recognizes a known name and generates a helped_me event dated last week", () => {
    const draft = mockExtract("小王上周帮我修了球拍", INDEX, { today: TODAY });
    expect(DraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.intent).toBe("update");
    expect(draft.target_person_id).toBe(INDEX[1].id);
    expect(draft.target_confidence).toBeGreaterThanOrEqual(0.7);
    expect(draft.events[0]).toMatchObject({ kind: "helped_me", happened_at: "2026-09-21" });
    // Updates must not silently downgrade the tier.
    expect(draft.person.tier).toBeNull();
  });

  it("honours the target hint from the person detail page", () => {
    const draft = mockExtract("他搬去上海了", INDEX, { today: TODAY, targetPersonId: INDEX[0].id });
    expect(draft.intent).toBe("update");
    expect(draft.target_person_id).toBe(INDEX[0].id);
    expect(draft.target_confidence).toBe(1);
    expect(draft.person.location).toBe("上海");
  });

  it("lowers confidence when several known people are mentioned", () => {
    const draft = mockExtract("老李和小王一起打了球", INDEX, { today: TODAY });
    expect(draft.intent).toBe("update");
    expect(draft.target_confidence).toBeLessThan(0.7);
  });
});

describe("mockExtract – scenario C: query and prefixes", () => {
  it("detects query wording", () => {
    expect(looksLikeQuery("想找个人教我打羽毛球")).toBe(true);
    expect(looksLikeQuery("谁会修球拍？")).toBe(true);
    expect(looksLikeQuery("今天认识了一个律师")).toBe(false);
    const draft = mockExtract("想找个人教我打羽毛球", INDEX, { today: TODAY });
    expect(draft.intent).toBe("query");
    expect(draft.events).toEqual([]);
    expect(draft.tags).toContainEqual({ name: "羽毛球", kind: "skill" });
  });

  it("leans towards recording when ambiguous (design.md §19 Q3)", () => {
    expect(mockExtract("陈静，做供应链的", [], { today: TODAY }).intent).toBe("add");
  });

  it("? prefix forces query even for record-like text", () => {
    const { text, forcedIntent } = parseInputPrefix("?小王");
    expect(mockExtract(text, INDEX, { today: TODAY, forcedIntent }).intent).toBe("query");
  });

  it("+ prefix forces record even for query-like text", () => {
    const { text, forcedIntent } = parseInputPrefix("+想找个人教我打羽毛球");
    const draft = mockExtract(text, [], { today: TODAY, forcedIntent });
    expect(draft.intent).toBe("add");
    expect(DraftSchema.safeParse(draft).success).toBe(true);
  });
});

describe("mock helpers", () => {
  it("extractContacts finds wechat, phone and email", () => {
    expect(extractContacts("微信 wx_123，手机 13812345678，邮箱 a@b.com")).toEqual({
      wechat: "wx_123",
      phone: "13812345678",
      email: "a@b.com",
    });
    expect(extractContacts("没有联系方式")).toEqual({});
  });

  it("extractName handles common patterns and rejects stopwords", () => {
    expect(extractName("认识了一个叫陈静的姑娘")).toBe("陈静");
    expect(extractName("今天见到老陈，做供应链")).toBe("老陈");
    expect(extractName("张老师是我们的班主任")).toBe("张老师");
    expect(extractName("今天很开心")).toBeNull();
  });

  it("parseDateHint resolves relative and absolute dates", () => {
    expect(parseDateHint("今天", TODAY)).toBe(TODAY);
    expect(parseDateHint("昨天打球", TODAY)).toBe("2026-09-27");
    expect(parseDateHint("上周见面", TODAY)).toBe("2026-09-21");
    expect(parseDateHint("2025年3月2日认识", TODAY)).toBe("2025-03-02");
    expect(parseDateHint("3月2号", TODAY)).toBe("2026-03-02");
    expect(parseDateHint("没有日期", TODAY)).toBeNull();
  });
});

describe("mockEmbed", () => {
  it("returns a deterministic unit vector of the configured dimension", () => {
    const a = mockEmbed("羽毛球教练");
    const b = mockEmbed("羽毛球教练");
    expect(a).toHaveLength(EMBEDDING_DIM);
    expect(EMBEDDING_DIM).toBe(1024);
    expect(a).toEqual(b);
    expect(Math.sqrt(a.reduce((s, v) => s + v * v, 0))).toBeCloseTo(1, 6);
    expect(mockEmbed("")).toHaveLength(EMBEDDING_DIM);
  });

  it("scores paraphrases (校队/带过学生) close to the literal coach text", () => {
    const query = mockEmbed("羽毛球教练");
    const coach = mockEmbed("姓名：小王\n摘要：羽毛球教练，深圳");
    const teamPlayer = mockEmbed("姓名：老李\n摘要：大学羽毛球校队主力，业余带过一些学生打球");
    const lawyer = mockEmbed("姓名：赵律\n摘要：执业律师，主做公司法和合同纠纷");
    expect(cosine(query, coach)).toBeGreaterThan(0.5);
    expect(cosine(query, teamPlayer)).toBeGreaterThan(0.5);
    expect(cosine(query, lawyer)).toBeLessThan(0.2);
  });

  it("tokenizes concepts, cities and bigrams", () => {
    const tokens = mockTokenize("深圳的羽毛球教练");
    expect(tokens.has("syn:badminton")).toBe(true);
    expect(tokens.has("syn:coach")).toBe(true);
    expect(tokens.has("city:深圳")).toBe(true);
    expect(tokens.has("bg:羽毛")).toBe(true);
  });
});

describe("normalizeDraft (server-side second validation)", () => {
  const ctx = { peopleIndex: INDEX, today: TODAY };

  it("drops unknown target ids and normalizes loose dates", () => {
    const result = normalizeDraft(
      {
        intent: "update",
        target_person_id: "00000000-0000-4000-8000-000000000000",
        target_confidence: 0.95,
        person: { name: "小王", met_at: "2026/9/1", contacts: { wechat: "wx" } },
        tags: [{ name: "羽毛球", kind: "skill" }],
        events: [{ kind: "met", content: "认识", happened_at: "昨天" }],
      },
      ctx,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.target_person_id).toBeNull();
    expect(result.data.target_confidence).toBe(0);
    expect(result.data.person.met_at).toBe("2026-09-01");
    expect(result.data.events[0].happened_at).toBe(TODAY);
  });

  it("applies forced intents and target hints", () => {
    const forced = normalizeDraft({ intent: "add", person: {}, tags: [], events: [] }, { ...ctx, forcedIntent: "query" });
    expect(forced.success && forced.data.intent).toBe("query");
    const hinted = normalizeDraft(
      { intent: "add", person: {}, tags: [], events: [] },
      { ...ctx, targetPersonId: INDEX[0].id },
    );
    expect(hinted.success && hinted.data).toMatchObject({
      intent: "update",
      target_person_id: INDEX[0].id,
      target_confidence: 1,
    });
  });

  it("fails on garbage so the caller can retry", () => {
    expect(normalizeDraft({ intent: "delete", person: {}, tags: "x", events: [] }, ctx).success).toBe(false);
  });
});
