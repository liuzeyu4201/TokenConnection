import { EMBEDDING_DIM } from "@/lib/env";
import type { Draft, DraftEvent, DraftTag } from "@/lib/schemas/draft";
import { EMPTY_DRAFT_PERSON } from "@/lib/schemas/draft";
import type { EventKind, Gender, Tier } from "@/lib/schemas/enums";

import type { ExtractOptions, PeopleIndexEntry } from "./types";

/**
 * Mock LLM provider: heuristic extraction + deterministic pseudo embeddings.
 * Used when `LLM_PROVIDER=mock` (development, seed, tests). It never touches
 * the network and always returns a schema-valid Draft.
 */

export const MOCK_EMBEDDING_MODEL = "mock-hash-v1";

// ---------------------------------------------------------------------------
// Dictionaries
// ---------------------------------------------------------------------------

const CITIES = [
  "北京", "上海", "深圳", "广州", "杭州", "成都", "武汉", "南京", "西安", "重庆",
  "苏州", "天津", "长沙", "郑州", "青岛", "厦门", "合肥", "宁波", "东莞", "佛山",
  "大连", "沈阳", "济南", "福州", "昆明", "哈尔滨", "长春", "南昌", "贵阳", "南宁",
  "石家庄", "太原", "无锡", "常州", "珠海", "中山", "惠州", "温州", "嘉兴", "海口",
  "三亚", "香港", "澳门", "台北", "新加坡", "东京", "伦敦", "纽约", "旧金山", "硅谷",
  "西雅图", "洛杉矶", "多伦多", "温哥华", "悉尼", "墨尔本", "首尔", "曼谷",
];

const SKILL_TERMS = [
  "羽毛球", "篮球", "足球", "网球", "乒乓球", "高尔夫", "健身", "跑步", "马拉松", "游泳",
  "瑜伽", "滑雪", "骑行", "攀岩", "摄影", "设计", "UI", "前端", "后端", "全栈", "编程",
  "程序员", "算法", "AI", "大模型", "数据分析", "数据", "产品", "运营", "市场", "销售",
  "法律", "律师", "医生", "牙医", "心理", "财务", "会计", "投资", "金融", "保险",
  "供应链", "采购", "物流", "教练", "英语", "日语", "翻译", "钢琴", "吉他", "音乐",
  "写作", "剪辑", "视频", "直播", "创业", "装修", "房产", "留学", "咖啡", "烘焙",
  "做饭", "HR", "招聘", "咨询", "公关", "新媒体", "电商", "外贸", "建筑", "硬件",
  "机械", "汽车", "游戏", "美术", "插画", "配音", "主持", "策划", "品牌",
];

const CIRCLE_TERMS = [
  "球友", "前同事", "同事", "大学同学", "高中同学", "初中同学", "同学", "校友", "老乡",
  "邻居", "客户", "合作伙伴", "朋友的朋友", "家人", "亲戚", "发小", "创业圈", "投资圈",
  "读书会", "跑团", "车友",
];

const TIER_HINTS: Array<[RegExp, Tier]> = [
  [/(兄弟|死党|发小|铁哥们|铁子|最好的朋友|过命|best bro)/i, "best_bros"],
  [/(好朋友|好友|很熟|闺蜜|挚友|老友|多年的朋友|走得很近|关系很好|close friend)/i, "close_friends"],
  [/(听说|据说|只知道|没见过|久仰|听过|别人提过)/, "known_of"],
  [/(朋友|同学|同事|球友|校友|老乡|邻居)/, "friends"],
  [/(认识|见过|加了微信|加了个微信|聊过|见了一面|饭局|活动上|加了好友)/, "interacted"],
];

const NAME_STOPWORDS = new Set([
  "今天", "昨天", "前天", "明天", "上周", "下周", "我们", "他们", "一个", "一位", "朋友",
  "同事", "同学", "客户", "老师", "大家", "自己", "这个", "那个", "什么", "怎么", "时候",
  "认识", "见面", "一起", "微信", "电话", "手机", "邮箱", "球馆", "公司", "上次", "刚刚",
  "最近", "然后", "因为", "所以", "但是", "如果", "可以", "已经", "还是", "非常", "特别",
]);

const QUERY_PATTERNS: RegExp[] = [
  /^(找|想找|帮我找|找个|找一个|找人|谁|有没有|哪个|哪位|哪些|想认识|推荐|介绍个|介绍一个|搜|查|寻|请问|谁是|谁会|谁能|谁懂|有谁|哪里有|求推荐)/,
  /(有没有|有谁|谁会|谁能|谁懂|谁是|哪位|哪个人|找个|找一个|找人|想找|想认识|推荐一个|推荐个|推荐一下|认识.{0,8}的人[吗么]|认识.{0,8}的[吗么]|有认识.{0,8}的)/,
  /[?？]$/,
];

const IMPRESSION_PATTERN =
  /((?:人|感觉|印象|觉得|为人)(?:很|挺|比较|特别|非常|蛮)[^，,。；;！!？?\s]{1,12}|(?:很|挺|比较|特别|非常|蛮)(?:靠谱|热情|nice|好|健谈|踏实|开朗|细心|耐心|直爽|实在|低调|聪明|厉害|专业|话少|安静)[^，,。；;！!？?\s]{0,8})/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function pad2(n: string | number): string {
  return String(n).padStart(2, "0");
}

/** Resolve "今天/昨天/上周/2025年3月2日/3月2日" to YYYY-MM-DD. */
export function parseDateHint(text: string, today: string): string | null {
  const full = text.match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/);
  if (full) return `${full[1]}-${pad2(full[2])}-${pad2(full[3])}`;
  const monthDay = text.match(/(?<!\d)(\d{1,2})月(\d{1,2})[日号]/);
  if (monthDay) return `${today.slice(0, 4)}-${pad2(monthDay[1])}-${pad2(monthDay[2])}`;
  if (/今天|今晚|刚刚|刚才/.test(text)) return today;
  if (/昨天|昨晚/.test(text)) return shiftDays(today, -1);
  if (/前天/.test(text)) return shiftDays(today, -2);
  if (/上上周/.test(text)) return shiftDays(today, -14);
  if (/上周|上星期|上个星期/.test(text)) return shiftDays(today, -7);
  if (/上个月|上月/.test(text)) return shiftDays(today, -30);
  if (/去年/.test(text)) return shiftDays(today, -365);
  const yearOnly = text.match(/(20\d{2})年/);
  if (yearOnly) return `${yearOnly[1]}-01-01`;
  return null;
}

export function looksLikeQuery(text: string): boolean {
  return QUERY_PATTERNS.some((re) => re.test(text));
}

export function extractContacts(text: string): Record<string, string> {
  const contacts: Record<string, string> = {};
  const wechat = text.match(
    /(?:微信号|微信|vx|wx|weixin|v信|威信)[:：\s是号为]*([A-Za-z][A-Za-z0-9_-]{4,19})/i,
  );
  if (wechat) contacts.wechat = wechat[1];
  const phone = text.match(/(?<!\d)(1[3-9]\d{9})(?!\d)/);
  if (phone) contacts.phone = phone[1];
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (email) contacts.email = email[0];
  return contacts;
}

function stripContacts(text: string): string {
  return text
    .replace(/(?:微信号|微信|vx|wx|weixin|v信|威信)[:：\s是号为]*[A-Za-z][A-Za-z0-9_-]{4,19}/gi, "")
    .replace(/(?:手机号?|电话|号码)?[:：\s是]*(?<!\d)1[3-9]\d{9}(?!\d)/g, "")
    .replace(/(?:邮箱|email)?[:：\s是]*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, "")
    .replace(/[，,、；;]{2,}/g, "，")
    .replace(/^[，,、；;\s]+|[，,、；;\s]+$/g, "")
    .trim();
}

export function extractLocation(text: string): string | null {
  for (const city of CITIES) {
    if (text.includes(city)) return city;
  }
  return null;
}

/**
 * Guess the relationship tier from wording. With `strongOnly` (used for
 * updates) only explicit relationship words count, so "认识" in "上周认识了他
 * 的同事" never downgrades an existing close friend.
 */
export function guessTier(text: string, options: { strongOnly?: boolean } = {}): Tier | null {
  for (const [re, tier] of TIER_HINTS) {
    if (options.strongOnly && (tier === "interacted" || tier === "friends")) continue;
    if (re.test(text)) return tier;
  }
  return null;
}

function guessGender(text: string): Gender | null {
  if (/(她|女生|女士|女孩|姑娘|小姐|美女|阿姨|大姐|学姐|师姐|女朋友|太太|老婆)/.test(text)) {
    return "female";
  }
  if (/(他|男生|先生|男士|小伙|帅哥|大哥|大叔|学长|师兄|老公|丈夫|哥)/.test(text)) {
    return "male";
  }
  return null;
}

function validName(candidate: string | undefined | null): string | null {
  if (!candidate) return null;
  const name = candidate.trim();
  if (name.length < 2 || name.length > 4) return null;
  if (NAME_STOPWORDS.has(name)) return null;
  return name;
}

/** 小学 / 老师 / 阿姨 … look like nicknames but are ordinary words. */
const NICKNAME_STOPWORDS = new Set([
  "小学", "小时", "小心", "小区", "小组", "小孩", "小姐", "小说", "小事", "小伙", "小店", "小城",
  "老师", "老板", "老公", "老婆", "老家", "老乡", "老友", "老人", "老同", "老朋", "老实", "老是",
  "阿姨", "阿里",
]);

export function extractName(text: string): string | null {
  // 认识了一个叫陈静的姑娘 / 认识小王，羽毛球教练 / 认识老陈，做供应链
  const met = text.match(
    /(?:认识|见到|遇到|碰到)(?:了)?(?:一个|个|一位|位|了个)?(?:叫)?([\u4e00-\u9fa5·]{2,4}?)(?=[，,。；;、：:\s]|是|做|在|的|$)/,
  );
  const metName = validName(met?.[1]);
  if (metName && !NICKNAME_STOPWORDS.has(metName)) return metName;

  // 小王 / 老李 / 阿强 anywhere in the sentence, skipping ordinary words.
  for (const m of text.matchAll(/((?:小|老|阿)[\u4e00-\u9fa5])(?![\u4e00-\u9fa5]{2,})/g)) {
    if (!NICKNAME_STOPWORDS.has(m[1])) return m[1];
  }

  // 李老师 / 王医生 / 张总 / 陈哥
  const titled = text.match(
    /(?:^|[^\u4e00-\u9fa5])([\u4e00-\u9fa5]{1,2}(?:老师|医生|律师|教练|总|哥|姐|叔|博士))(?![\u4e00-\u9fa5])/,
  );
  const titledName = validName(titled?.[1]);
  if (titledName) return titledName;

  // 陈静是... / 张伟，... at the very beginning
  const leading = text.match(/^([\u4e00-\u9fa5]{2,3})(?=[，,、：:\s]|是|在|做|的)/);
  return validName(leading?.[1]);
}

export function extractTags(text: string): DraftTag[] {
  const tags: DraftTag[] = [];
  const lower = text.toLowerCase();
  for (const term of SKILL_TERMS) {
    if (lower.includes(term.toLowerCase())) tags.push({ name: term, kind: "skill" });
  }
  for (const term of CIRCLE_TERMS) {
    if (text.includes(term)) tags.push({ name: term, kind: "circle" });
  }
  if (/球馆|打球|球局/.test(text) && !tags.some((t) => t.name === "球友")) {
    tags.push({ name: "球友", kind: "circle" });
  }
  // Drop "同学" when a more specific 大学同学/高中同学 was found.
  const specificClassmate = tags.some((t) => t.kind === "circle" && /同学$/.test(t.name) && t.name !== "同学");
  return tags.filter((t) => !(specificClassmate && t.name === "同学"));
}

function guessEventKind(text: string): EventKind {
  if (/(帮我|帮了我|帮忙|给我看|替我|救了我)/.test(text)) return "helped_me";
  if (/(我帮|帮他|帮她|我给他|我给她|我替他|我替她|我介绍)/.test(text)) return "i_helped";
  if (/(一起|聚|吃饭|喝酒|喝咖啡|打球|见面|约了|聊了|见了|打了)/.test(text)) return "hangout";
  if (/(认识|加了微信|初次见面|第一次见)/.test(text)) return "met";
  return "note";
}

/** The clause describing how we met, without the leading date word and the name. */
function extractHowMet(text: string, name: string | null): string | null {
  const clauses = text.split(/[，,。；;！!？?\n]/).map((c) => c.trim()).filter(Boolean);
  const clause = clauses.find((c) => /认识|见到|遇到|碰到|加了微信/.test(c));
  if (!clause) return null;
  let cleaned = clause.replace(/^(今天|昨天|前天|上周|上个月|刚刚|最近|去年)/, "");
  if (name) {
    cleaned = cleaned
      .replace(new RegExp(`(?:了)?(?:一个|个|一位|位)?(?:叫)?${escapeRegExp(name)}(?:的)?$`), "")
      .replace(new RegExp(`^${escapeRegExp(name)}`), "");
  }
  cleaned = cleaned.trim();
  return cleaned.length >= 2 ? cleaned : clause;
}

function extractImpression(text: string): string | null {
  const m = text.match(IMPRESSION_PATTERN);
  return m ? m[1].trim() : null;
}

/**
 * Summary = the raw text minus contacts, the "how we met" clause, the
 * impression clause and a standalone location clause. Whatever is left is a
 * reasonable "who is this / what do they do".
 */
function buildSummary(
  text: string,
  parts: { impression: string | null; name: string | null; howMet: string | null; location: string | null },
): string | null {
  const clauses = stripContacts(text)
    .split(/[，,。；;！!？?\n]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => !(parts.howMet && /认识|见到|遇到|碰到|加了微信/.test(c)))
    .filter((c) => !(parts.impression && c.includes(parts.impression)))
    .filter((c) => !(parts.location && c === parts.location))
    .filter((c) => !(parts.name && c === parts.name))
    .map((c) => (parts.name ? c.replace(new RegExp(`^${escapeRegExp(parts.name)}(?:是|，|,)?`), "") : c))
    .map((c) => c.replace(/^(今天|昨天|前天|上周|上个月|刚刚|最近)/, "").trim())
    .filter(Boolean);
  const summary = clauses.join("，");
  return summary || null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find people whose name occurs in the text; longest names first. */
export function findMentionedPeople(text: string, index: PeopleIndexEntry[]): PeopleIndexEntry[] {
  return index
    .filter((p) => p.name.trim().length >= 2 && text.includes(p.name.trim()))
    .sort((a, b) => b.name.length - a.name.length);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export function mockExtract(
  rawText: string,
  peopleIndex: PeopleIndexEntry[],
  options: ExtractOptions = {},
): Draft {
  const text = rawText.trim();
  const today = options.today ?? isoDate(new Date());

  // 1. Intent ---------------------------------------------------------------
  let intent: Draft["intent"];
  let target: PeopleIndexEntry | null = null;
  let confidence = 0;

  const hinted = options.targetPersonId
    ? peopleIndex.find((p) => p.id === options.targetPersonId) ?? null
    : null;
  const mentioned = findMentionedPeople(text, peopleIndex);

  if (options.forcedIntent === "query") {
    intent = "query";
  } else if (hinted) {
    intent = "update";
    target = hinted;
    confidence = 1;
  } else if (options.forcedIntent === "update") {
    intent = "update";
    target = mentioned[0] ?? null;
    confidence = target ? (mentioned.length > 1 ? 0.6 : 0.9) : 0;
  } else if (options.forcedIntent !== "add" && looksLikeQuery(text)) {
    intent = "query";
  } else if (mentioned.length > 0) {
    intent = "update";
    target = mentioned[0];
    const distinct = new Set(mentioned.map((p) => p.name)).size;
    confidence = distinct > 1 ? 0.6 : 0.9;
  } else {
    intent = "add";
  }

  if (intent === "query") {
    return {
      intent,
      target_person_id: null,
      target_confidence: 0,
      person: { ...EMPTY_DRAFT_PERSON },
      tags: extractTags(text),
      events: [],
    };
  }

  // 2. Fields ---------------------------------------------------------------
  const contacts = extractContacts(text);
  const location = extractLocation(text);
  const tags = extractTags(text);
  const impression = extractImpression(text);
  const dateHint = parseDateHint(text, today);
  const gender = guessGender(text);

  if (intent === "update" && target) {
    // "小王上周帮我修了球拍" → "上周帮我修了球拍": the person is implied.
    const eventContent =
      stripContacts(text).replace(new RegExp(`^${escapeRegExp(target.name)}[，,、：:\\s]*`), "").trim() ||
      stripContacts(text) ||
      text;
    const events: DraftEvent[] = [
      { kind: guessEventKind(text), content: eventContent, happened_at: dateHint ?? today },
    ];
    return {
      intent,
      target_person_id: target.id,
      target_confidence: confidence,
      person: {
        ...EMPTY_DRAFT_PERSON,
        // Only fields we are fairly sure about; nulls keep existing values.
        location,
        tier: guessTier(text, { strongOnly: true }),
        impression,
        contacts,
      },
      tags,
      events,
    };
  }

  // intent === "add"
  const name = extractName(text);
  const howMet = extractHowMet(text, name);
  const summary = buildSummary(text, { impression, name, howMet, location });
  const events: DraftEvent[] = [];
  if (/认识|见面|见到|遇到|加了微信/.test(text)) {
    events.push({ kind: "met", content: howMet ?? text, happened_at: dateHint ?? today });
  }

  return {
    intent: "add",
    target_person_id: null,
    target_confidence: 0,
    person: {
      name,
      gender,
      location,
      tier: guessTier(text) ?? "interacted",
      summary,
      impression,
      contacts,
      how_met: howMet,
      met_at: dateHint,
    },
    tags,
    events,
  };
}

// ---------------------------------------------------------------------------
// Embeddings: deterministic feature hashing of concept tokens + char bigrams
// ---------------------------------------------------------------------------

const SYNONYM_GROUPS: Record<string, string[]> = {
  badminton: ["羽毛球", "球拍", "球馆", "打球", "双打", "单打", "羽球"],
  coach: ["教练", "校队", "带过学生", "带学生", "教学生", "教过", "培训", "指导", "陪练", "教我", "教人", "带队", "私教", "教打", "带新人"],
  law: ["律师", "法律", "合同", "法务", "诉讼", "打官司", "法院", "律所"],
  medicine: ["医生", "医院", "医学", "看病", "门诊", "大夫", "护士", "体检", "科室"],
  dev: ["前端", "后端", "全栈", "程序员", "开发", "写代码", "编程", "工程师", "软件", "码农", "技术"],
  ai: ["ai", "人工智能", "大模型", "算法", "机器学习", "深度学习", "llm", "模型"],
  invest: ["投资", "融资", "vc", "基金", "天使", "投资人", "资本"],
  finance: ["财务", "会计", "报税", "审计", "税务", "cfo"],
  supply: ["供应链", "采购", "物流", "工厂", "供应商", "仓储", "生产"],
  design: ["设计", "设计师", "ui", "ux", "海报", "视觉", "平面", "logo", "插画"],
  product: ["产品经理", "产品", "pm", "需求"],
  ops: ["运营", "增长", "营销", "市场", "推广", "品牌"],
  sales: ["销售", "客户", "签单", "商务", "bd"],
  startup: ["创业", "创始人", "ceo", "老板", "初创", "合伙人"],
  photo: ["摄影", "拍照", "照片", "相机", "摄影师", "拍片"],
  english: ["英语", "口语", "翻译", "外语", "雅思", "托福"],
  music: ["音乐", "吉他", "钢琴", "乐队", "唱歌", "歌手", "演出"],
  fitness: ["健身", "撸铁", "健身房", "增肌", "减脂"],
  running: ["跑步", "马拉松", "越野", "跑团", "跑友"],
  swimming: ["游泳", "潜水", "冲浪"],
  ski: ["滑雪", "单板", "双板", "雪季"],
  basketball: ["篮球", "打篮球", "球场", "nba"],
  football: ["足球", "踢球", "球队"],
  racket: ["网球", "乒乓球", "壁球"],
  hr: ["hr", "招聘", "猎头", "人力", "面试"],
  writing: ["写作", "公众号", "文章", "自媒体", "博主", "作者", "出书"],
  data: ["数据", "分析", "bi", "报表", "数仓"],
  realestate: ["房产", "中介", "买房", "房子", "租房", "装修"],
  abroad: ["留学", "海外", "移民", "签证", "出国"],
  psychology: ["心理", "咨询师", "倾听", "情绪"],
  food: ["做饭", "烘焙", "厨艺", "美食", "餐厅", "厨师", "咖啡", "咖啡师"],
  university: ["大学", "校友", "同学", "本科", "研究生", "读书"],
  colleague: ["同事", "前同事", "公司", "部门", "团队"],
  hometown: ["老乡", "家乡", "邻居"],
  video: ["剪辑", "视频", "短视频", "直播", "up主", "抖音", "b站"],
  ecommerce: ["电商", "淘宝", "跨境", "外贸", "亚马逊", "店铺"],
  hardware: ["硬件", "嵌入式", "芯片", "机械", "电路"],
  car: ["汽车", "开车", "车友", "改装"],
  game: ["游戏", "电竞", "桌游", "狼人杀"],
  reliable: ["靠谱", "踏实", "负责", "稳重", "可靠"],
  warm: ["热情", "热心", "开朗", "爱笑", "健谈"],
  quiet: ["话少", "内向", "安静", "低调"],
};

// Concept (synonym-group) tokens dominate so paraphrases score close to
// literal matches; ungrouped skill terms, cities, Latin words and character
// bigrams only add texture / break ties.
const WEIGHT_SYNONYM = 1.0;
const WEIGHT_TERM = 0.25;
const WEIGHT_CITY = 0.75;
const WEIGHT_LATIN_WORD = 0.5;
const WEIGHT_BIGRAM = 0.05;

const GROUPED_TERMS = new Set(Object.values(SYNONYM_GROUPS).flat());

/** FNV-1a 32-bit hash. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Map text to weighted feature tokens. Exported for tests. */
export function mockTokenize(text: string): Map<string, number> {
  const tokens = new Map<string, number>();
  const add = (token: string, weight: number) => {
    tokens.set(token, Math.max(tokens.get(token) ?? 0, weight));
  };
  const lower = text.toLowerCase();

  for (const [group, terms] of Object.entries(SYNONYM_GROUPS)) {
    if (terms.some((term) => lower.includes(term))) add(`syn:${group}`, WEIGHT_SYNONYM);
  }
  for (const term of SKILL_TERMS) {
    const t = term.toLowerCase();
    if (!GROUPED_TERMS.has(t) && lower.includes(t)) add(`w:${t}`, WEIGHT_TERM);
  }
  for (const city of CITIES) {
    if (text.includes(city)) add(`city:${city}`, WEIGHT_CITY);
  }
  for (const word of lower.match(/[a-z][a-z0-9+#.-]{1,30}/g) ?? []) {
    add(`en:${word}`, WEIGHT_LATIN_WORD);
  }
  const cjk = lower.replace(/[^\u4e00-\u9fa5]/g, " ");
  for (const run of cjk.split(/\s+/)) {
    if (run.length < 2) continue;
    for (let i = 0; i < run.length - 1; i++) {
      add(`bg:${run.slice(i, i + 2)}`, WEIGHT_BIGRAM);
    }
  }
  return tokens;
}

/** Deterministic unit-length pseudo embedding (design.md §13 mock provider). */
export function mockEmbed(text: string): number[] {
  const vec = new Float64Array(EMBEDDING_DIM);
  for (const [token, weight] of mockTokenize(text)) {
    const hash = fnv1a(token);
    const index = hash % EMBEDDING_DIM;
    const sign = (hash >>> 20) & 1 ? 1 : -1;
    vec[index] += sign * weight;
  }
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) {
    // Empty text: point at a fixed direction so the vector is still valid.
    vec[0] = 1;
    norm = 1;
  }
  const out = new Array<number>(EMBEDDING_DIM);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}
