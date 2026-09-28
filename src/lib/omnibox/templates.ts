/**
 * Universal input modes and fill-in templates.
 *
 * - "auto": the LLM decides the intent (design.md §9.1); `+` / `?` prefixes still work.
 * - "record": every submission is forced to record (same as the `+` prefix).
 * - "query": every submission is forced to query (same as the `?` prefix).
 *
 * Templates are plain text with 【placeholder】 blanks. The user overwrites the
 * blanks (Tab jumps to the next one); whatever is left unfilled is stripped
 * before the text is sent, so the LLM never sees "【城市】".
 */

export type OmniboxMode = "auto" | "record" | "query";

export const OMNIBOX_MODES: { value: OmniboxMode; label: string; hint: string }[] = [
  { value: "auto", label: "自动", hint: "记一个人、追加一句，或者找人。例如：今天球馆认识小王，羽毛球教练，深圳…" },
  { value: "record", label: "记人", hint: "记一个人或追加一句。选个模板，把【】里的空填上，没填的会自动忽略。" },
  { value: "query", label: "找人", hint: "想找什么样的人？例如：会打羽毛球的、在深圳的律师、能帮我看合同的人…" },
];

export const OMNIBOX_MODE_STORAGE_KEY = "tc.omnibox.mode";

export function isOmniboxMode(value: unknown): value is OmniboxMode {
  return value === "auto" || value === "record" || value === "query";
}

export type OmniboxTemplate = { label: string; text: string };

/** Record-mode templates. The last one is the exhaustive field checklist. */
export const RECORD_TEMPLATES: OmniboxTemplate[] = [
  {
    label: "新认识一个人",
    text: "今天在【场合】认识了【名字】，【做什么 / 能力】，在【城市】，微信【wx】，感觉【印象】",
  },
  {
    label: "追加一句",
    text: "【名字】【什么时候】【帮我做了什么 / 一起做了什么】",
  },
  {
    label: "听说的人",
    text: "听【谁】说的，【名字】在【城市】做【什么】，【为什么值得记住】",
  },
  {
    label: "详细版",
    text: [
      "名字：【】",
      "怎么认识的：【场合、时间、谁介绍的】",
      "做什么 / 能力：【】",
      "所在地：【城市】",
      "联系方式：【微信 / 电话 / 邮箱】",
      "关系：【刚认识 / 朋友 / 好朋友 / 死党 / 只是听说】",
      "印象：【性格、品格、感受】",
    ].join("\n"),
  },
];

/** Query-mode chips: examples rather than fill-in templates. */
export const QUERY_TEMPLATES: OmniboxTemplate[] = [
  { label: "按能力", text: "想找个会【能力】的人" },
  { label: "按城市", text: "在【城市】有没有做【什么】的朋友" },
  { label: "帮个忙", text: "谁能帮我【做什么】" },
];

export const PLACEHOLDER_RE = /【[^】]*】/g;

/** Prefix the text according to the mode (server parses the prefix, prefix.ts). */
export function applyModePrefix(text: string, mode: OmniboxMode): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const hasPrefix = /^[+＋?？]/.test(trimmed);
  if (mode === "record" && !hasPrefix) return `+${trimmed}`;
  if (mode === "query" && !hasPrefix) return `?${trimmed}`;
  return trimmed;
}

/** True when the text still has at least one 【blank】. */
export function hasPlaceholder(text: string): boolean {
  PLACEHOLDER_RE.lastIndex = 0;
  return PLACEHOLDER_RE.test(text);
}

/**
 * Position of the next 【blank】 at or after `from`, wrapping around to the
 * start; null when there is none.
 */
export function findNextPlaceholder(text: string, from: number): { start: number; end: number } | null {
  const matches: { start: number; end: number }[] = [];
  PLACEHOLDER_RE.lastIndex = 0;
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    matches.push({ start: m.index, end: m.index + m[0].length });
  }
  if (matches.length === 0) return null;
  return matches.find((m) => m.start >= from) ?? matches[0];
}

/**
 * Remove unfilled 【blanks】 together with the function word that introduced
 * them ("在【城市】", "微信【wx】", "听【谁】说的"), then tidy the punctuation
 * left behind. Lines reduced to a bare "标签：" are dropped (detailed template).
 */
export function cleanTemplateText(text: string): string {
  const stripped = text
    .replace(/听【[^】]*】说的[，,]?/g, "")
    .replace(/(?:在|微信|电话|邮箱|感觉|做)【[^】]*】/g, "")
    .replace(PLACEHOLDER_RE, "");

  const kept: string[] = [];
  for (const rawLine of stripped.split("\n")) {
    const line = rawLine
      .replace(/\s*[，,、；;]\s*(?=[，,、；;])/g, "") // runs of separators → one
      .replace(/[，,、；;]\s*(?=[。！？!?])/g, "") // separator right before a full stop
      .replace(/^\s*[，,、；;]+\s*/, "") // leading separator
      .replace(/\s*[，,、；;]+\s*$/, "") // trailing separator
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (!line) continue;
    if (/^[^：:]{1,12}[：:]\s*$/.test(line)) continue; // bare label from the detailed template
    kept.push(line);
  }
  return kept.join("\n").trim();
}

/** What is actually sent: cleaned text plus the mode prefix. */
export function buildSubmission(text: string, mode: OmniboxMode): string {
  return applyModePrefix(cleanTemplateText(text), mode);
}
