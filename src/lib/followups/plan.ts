import type { FollowUpStatus } from "@/lib/schemas/enums";
import { redactContacts } from "@/lib/llm/redact";

/** Days after the person joined this library. Not the historical met date. */
export const FOLLOW_UP_OFFSETS = [1, 3, 7, 30] as const;
export type FollowUpOffset = (typeof FOLLOW_UP_OFFSETS)[number];

export type FollowUpSuggestions = [string, string, string, string];

const GENERIC_SUGGESTIONS: FollowUpSuggestions = [
  "发一条近况，问对方最近怎么样",
  "再发一句，问对方这几天过得怎样",
  "分享一件近况，看对方有没有空聊两句",
  "隔了一阵，问对方最近怎么样，看要不要再约一次",
];

export type FollowUpPromptFields = {
  howMet: string;
  summary: string | null;
};

export function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Four due dates counted from the calendar day the person was added. */
export function followUpSchedule(addedOn: string): Array<{ offset_days: FollowUpOffset; due_on: string }> {
  const day = addedOn.slice(0, 10);
  return FOLLOW_UP_OFFSETS.map((offset_days) => ({
    offset_days,
    due_on: addCalendarDays(day, offset_days),
  }));
}

export function followUpOffsetLabel(days: number): string {
  if (days === 1) return "第 2 天";
  if (days === 3) return "3 天后";
  if (days === 7) return "1 周后";
  if (days === 30) return "1 个月后";
  return `${days} 天后`;
}

export type FollowUpPhase = "未到期" | "该回访了" | "已完成" | "已跳过";

export function followUpPhase(status: FollowUpStatus, dueOn: string, today: string): FollowUpPhase {
  if (status === "done") return "已完成";
  if (status === "skipped") return "已跳过";
  return dueOn.slice(0, 10) <= today.slice(0, 10) ? "该回访了" : "未到期";
}

function cleanField(value: string | null | undefined, redact: boolean, max: number): string | null {
  const raw = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!raw) return null;
  const text = (redact ? redactContacts(raw).text : raw)
    .replace(/\[\[CONTACT_\d+\]\]/g, "")
    .replace(/[「」]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const clipped = text.slice(0, max).trim();
  if (clipped.length < 2 || !/[\p{L}\p{N}]/u.test(clipped)) return null;
  return clipped;
}

/** Safe fields for the model: how they met, plus the objective summary. */
export function followUpPromptFields(input: {
  howMet: string | null;
  summary: string | null;
  redact: boolean;
}): FollowUpPromptFields | null {
  const howMet = cleanField(input.howMet, input.redact, 80);
  if (!howMet) return null;
  return { howMet, summary: cleanField(input.summary, input.redact, 80) };
}

export function buildFollowUpUserPrompt(fields: FollowUpPromptFields): string {
  const lines = [`怎么认识的：${fields.howMet}`];
  if (fields.summary) lines.push(`摘要：${fields.summary}`);
  return lines.join("\n");
}

function sceneLabel(howMet: string | null | undefined): string | null {
  return cleanField(howMet, true, 18);
}

export function templateFollowUpSuggestions(howMet: string | null | undefined): FollowUpSuggestions {
  const scene = sceneLabel(howMet);
  if (!scene) return [...GENERIC_SUGGESTIONS];
  return [
    `顺着「${scene}」，发一条近况，问对方最近怎么样`,
    `接着「${scene}」的话题，补一句近况`,
    `围绕「${scene}」，分享一件小事，保持联系`,
    `隔了一阵，从「${scene}」问起，看要不要再约一次`,
  ];
}

function suggestionList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as { suggestions?: unknown; reminders?: unknown };
    if (Array.isArray(obj.suggestions)) return obj.suggestions;
    if (Array.isArray(obj.reminders)) return obj.reminders;
  }
  return [];
}

/** Pull a JSON object or array out of a model reply. */
export function parseFollowUpModelText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
  throw new Error("回访建议不是 JSON");
}

function tidySuggestion(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:第\s*[23]\s*天|3\s*天后|一?\s*周后|1\s*周后|1\s*个?月后)[:：]\s*/, "");
}

export function normalizeFollowUpSuggestions(raw: unknown, fallback: FollowUpSuggestions): FollowUpSuggestions {
  const list = suggestionList(raw);
  const next = FOLLOW_UP_OFFSETS.map((_, index) => {
    const value = typeof list[index] === "string" ? tidySuggestion(list[index]) : "";
    if (!value) return fallback[index];
    const stripped = redactContacts(value).text.replace(/\[\[CONTACT_\d+\]\]/g, "").replace(/\s+/g, " ").trim();
    if (!stripped || stripped !== value) return fallback[index];
    return value.length > 80 ? value.slice(0, 80).trim() : value;
  });
  return [next[0], next[1], next[2], next[3]];
}

/**
 * Four short suggestions. A missing how_met, a disabled model, a mock provider
 * (caller omits `generate`), or a failed call all fall back to the template.
 */
export async function suggestFollowUps(
  input: {
    howMet: string | null;
    summary: string | null;
    llmEnabled: boolean;
    redact: boolean;
  },
  generate?: (userPrompt: string) => Promise<unknown>,
): Promise<{ suggestions: FollowUpSuggestions; source: "template" | "model" }> {
  const fallback = templateFollowUpSuggestions(input.howMet);
  const fields = followUpPromptFields(input);
  if (!fields || !input.llmEnabled || !generate) {
    return { suggestions: fallback, source: "template" };
  }
  try {
    const raw = await generate(buildFollowUpUserPrompt(fields));
    return { suggestions: normalizeFollowUpSuggestions(raw, fallback), source: "model" };
  } catch {
    return { suggestions: fallback, source: "template" };
  }
}

export type FollowUpVisibilityInput = {
  id: string;
  status: FollowUpStatus;
  due_on: string;
};

/** Pending steps whose due day is today or earlier. Hidden entirely when the switch is off. */
export function visibleFollowUps<T extends FollowUpVisibilityInput>(
  steps: T[],
  opts: { enabled: boolean; today: string },
): T[] {
  if (!opts.enabled) return [];
  const today = opts.today.slice(0, 10);
  return steps.filter((step) => step.status === "pending" && step.due_on.slice(0, 10) <= today);
}
