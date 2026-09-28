import type { PeopleIndexEntry } from "./types";

/**
 * Prompts for the DeepSeek extraction step (design.md §9.1, §13).
 * The JSON schema itself is injected by the AI SDK (JSON mode), so the prompt
 * focuses on semantics: field meanings, intent rules and disambiguation.
 */

export const EXTRACT_SYSTEM_PROMPT = `你是一个私人人脉库的录入助手。用户会用一句中文自然语言描述某个人、追加某个人的新情况，或者想在库里找某类人。你的任务是把这句话解析成一个 JSON 对象（Draft）。

## 意图 intent
- "add"：描述一个库里没有的新人。
- "update"：描述库里已有的某个人的新情况（追加事件、补充信息）。必须在 target_person_id 填该人的 id，并用 target_confidence（0~1）表示你对"就是这个人"的把握。
- "query"：用户想找某类人（"想找个…"、"谁会…"、"有没有…"）。
- "unknown"：完全无法判断。
判断模糊时倾向 "add"/"update"（记录），因为记录有确认步骤，误判成本低；只有明确是提问、找人时才用 "query"。
如果句子里提到的名字与"已有人员列表"里的某个人明显是同一人，用 "update"；只是同姓或不确定时，仍可选 "update" 但把 target_confidence 设低于 0.7；完全没提到已有的人则用 "add"，target_person_id 为 null，target_confidence 为 0。

## 字段 person
- name：姓名或称呼（如 小王、老李、陈静），没有则 null。
- gender："male" | "female" | "other" | "unknown" | null，没有线索用 null。
- location：所在城市字符串，没有则 null。
- tier：关系远近，只能是 "best_bros"（兄弟、死党）、"close_friends"（很熟的好朋友）、"friends"（普通朋友）、"interacted"（打过交道、刚认识、加了微信）、"known_of"（只是听说、知道有这个人）。新认识的人通常是 "interacted"；无法判断用 null。
- summary：客观的"他是谁、做什么"，一句话，不要包含联系方式。
- impression：主观的"我觉得他怎样"（性格、品格、感受），没有则 null。
- contacts：键值对，常用 key：wechat、phone、email、xiaohongshu、douyin、linkedin。句中没有联系方式则为 {}。
- how_met：怎么认识的，一小句；没有则 null。
- met_at：认识的日期，YYYY-MM-DD；不知道则 null。
- intent 为 "update" 时，person 里的每个非 null 字段都会**整体覆盖**库里的旧值，所以：没有新信息的字段一律 null；summary 只在"他是谁、做什么"确实变了（换工作、换城市、身份变化）时才填，并且必须是把"已有人员列表"里该人的旧摘要和新情况合并后的完整一句话，不能只写新增的片段（错误："做量化"；正确："跑友，原来做数据分析，最近换工作转做量化，每周末一起跑西湖"）；impression 同理，填就填把列表里的旧印象和新感受合并后的完整印象（错误："其实挺幽默"；正确："严谨，说话慢但准；熟了之后发现其实挺幽默，不像看起来那么严肃"）。

## 标签 tags
- kind "skill"：能力、职业、专长（羽毛球、律师、前端、摄影…）。
- kind "circle"：圈子（球友、前同事、大学同学、老乡、客户…）。
- kind "other"：其他。
标签名用简短中文名词，2~6 个字，不要重复。

## 事件 events
- kind："met"（认识）、"helped_me"（他帮了我）、"i_helped"（我帮了他）、"hangout"（一起吃饭/玩/见面）、"note"（其他备注）。
- content：一句话描述发生了什么。
- happened_at：YYYY-MM-DD。句中的"今天、昨天、上周"按给定的今日日期换算；没有时间线索用今日日期。
新认识一个人时通常生成一条 "met" 事件；追加情况时生成一条对应事件。intent 为 "query" 时 events 为空。

## 通用规则
- 不要编造句子里没有的信息；不确定的字段用 null 或空数组。
- 所有日期用 YYYY-MM-DD。
- 只输出 JSON，不要解释。`;

export type ExtractExample = { input: string; output: string };

/** Few-shot examples covering the three core scenarios. */
export const EXTRACT_EXAMPLES: ExtractExample[] = [
  {
    input: "今天球馆认识小王，羽毛球教练，深圳，微信 wx123，人很热情",
    output: JSON.stringify({
      intent: "add",
      target_person_id: null,
      target_confidence: 0,
      person: {
        name: "小王",
        gender: null,
        location: "深圳",
        tier: "interacted",
        summary: "羽毛球教练",
        impression: "热情",
        contacts: { wechat: "wx123" },
        how_met: "球馆认识",
        met_at: "{{today}}",
      },
      tags: [
        { name: "羽毛球", kind: "skill" },
        { name: "教练", kind: "skill" },
        { name: "球友", kind: "circle" },
      ],
      events: [{ kind: "met", content: "球馆认识", happened_at: "{{today}}" }],
    }),
  },
  {
    input: "小王上周帮我修了球拍",
    output: JSON.stringify({
      intent: "update",
      target_person_id: "{{example_person_id}}",
      target_confidence: 0.9,
      person: {
        name: null,
        gender: null,
        location: null,
        tier: null,
        summary: null,
        impression: null,
        contacts: {},
        how_met: null,
        met_at: null,
      },
      tags: [],
      events: [{ kind: "helped_me", content: "帮我修了球拍", happened_at: "{{last_week}}" }],
    }),
  },
  {
    input: "想找个人教我打羽毛球",
    output: JSON.stringify({
      intent: "query",
      target_person_id: null,
      target_confidence: 0,
      person: {
        name: null,
        gender: null,
        location: null,
        tier: null,
        summary: null,
        impression: null,
        contacts: {},
        how_met: null,
        met_at: null,
      },
      tags: [{ name: "羽毛球", kind: "skill" }],
      events: [],
    }),
  },
];

function shiftIso(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatPeopleIndex(index: PeopleIndexEntry[]): string {
  if (index.length === 0) return "（库里还没有人）";
  return index.map((p) => `- ${p.id} | ${p.name} | ${p.summary_line}`).join("\n");
}

export function buildExtractPrompt(params: {
  rawText: string;
  peopleIndex: PeopleIndexEntry[];
  today: string;
  forcedIntent?: "add" | "update" | "query";
  targetPersonId?: string;
}): string {
  const { rawText, peopleIndex, today, forcedIntent, targetPersonId } = params;
  const examplePersonId = peopleIndex[0]?.id ?? "00000000-0000-4000-8000-000000000000";
  const examples = EXTRACT_EXAMPLES.map((ex, i) => {
    const output = ex.output
      .replaceAll("{{today}}", today)
      .replaceAll("{{last_week}}", shiftIso(today, -7))
      .replaceAll("{{example_person_id}}", examplePersonId);
    return `示例 ${i + 1}\n输入：${ex.input}\n输出：${output}`;
  }).join("\n\n");

  const constraints: string[] = [];
  if (forcedIntent === "add") constraints.push('用户用 "+" 前缀强制要求本句是记录（intent 只能是 "add" 或 "update"，不能是 "query"）。');
  if (forcedIntent === "query") constraints.push('用户用 "?" 前缀强制要求本句是查询（intent 必须是 "query"）。');
  if (forcedIntent === "update" && targetPersonId) {
    constraints.push(`本句是在 id 为 ${targetPersonId} 的人的详情页输入的，intent 必须是 "update"，target_person_id 必须是这个 id，target_confidence 为 1。`);
  }

  return [
    `今天是 ${today}。`,
    "",
    "## 已有人员列表（id | 姓名 | 所在地 · 关系 · 摘要 · 印象）",
    formatPeopleIndex(peopleIndex),
    "",
    "## 示例",
    examples,
    "",
    constraints.length > 0 ? `## 额外约束\n${constraints.join("\n")}\n` : "",
    "## 现在请解析这句话",
    rawText,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}
