import { generateObject } from "ai";

import { DraftLlmSchema, DraftSchema, type Draft } from "@/lib/schemas/draft";

import { mockExtract } from "./mock";
import { buildExtractPrompt, EXTRACT_SYSTEM_PROMPT } from "./prompts";
import { getExtractionModel, isMockProvider } from "./provider";
import { ExtractionError, type ExtractOptions, type PeopleIndexEntry } from "./types";

export const EXTRACT_TIMEOUT_MS = 25_000;
/** One initial attempt + one retry (design.md §6, §9.1). */
export const EXTRACT_MAX_ATTEMPTS = 2;

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Accept a few common date spellings from the model; otherwise null. */
export function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let m = trimmed.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  }
  m = trimmed.match(/^(\d{4})[-/.年](\d{1,2})月?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  m = trimmed.match(/^(\d{4})年?$/);
  if (m) return `${m[1]}-01-01`;
  return null;
}

/**
 * Post-process raw model output into a strictly valid Draft:
 * - unknown target ids are dropped
 * - forced intents win over the model's guess
 * - loose dates are normalized, invalid ones fall back (met_at → null,
 *   events → today)
 * Returns the parse result so the caller can decide to retry.
 */
export function normalizeDraft(
  raw: unknown,
  ctx: { peopleIndex: PeopleIndexEntry[]; today: string } & ExtractOptions,
): ReturnType<typeof DraftSchema.safeParse> {
  const knownIds = new Set(ctx.peopleIndex.map((p) => p.id));
  const obj = (raw ?? {}) as Record<string, unknown>;
  const person = (obj.person ?? {}) as Record<string, unknown>;

  let intent = obj.intent;
  let targetId = typeof obj.target_person_id === "string" ? obj.target_person_id : null;
  let confidence = typeof obj.target_confidence === "number" ? obj.target_confidence : 0;

  if (ctx.forcedIntent === "query") {
    intent = "query";
  } else if (ctx.forcedIntent === "add" && intent === "query") {
    intent = "add";
  }
  if (ctx.targetPersonId && knownIds.has(ctx.targetPersonId)) {
    intent = "update";
    targetId = ctx.targetPersonId;
    confidence = 1;
  }
  if (targetId && !knownIds.has(targetId)) {
    targetId = null;
    confidence = 0;
  }
  if (intent === "update" && !targetId) {
    // Model wanted an update but pointed nowhere: keep intent, force the
    // candidate picker in the UI.
    confidence = 0;
  }
  if (intent === "add") {
    targetId = null;
    confidence = 0;
  }
  confidence = Math.min(1, Math.max(0, Number.isFinite(confidence) ? confidence : 0));

  const tags = Array.isArray(obj.tags) ? obj.tags : [];
  const events = Array.isArray(obj.events) ? obj.events : [];

  const candidate = {
    intent,
    target_person_id: targetId,
    target_confidence: confidence,
    person: {
      name: person.name ?? null,
      gender: person.gender ?? null,
      location: person.location ?? null,
      tier: person.tier ?? null,
      summary: person.summary ?? null,
      impression: person.impression ?? null,
      contacts: person.contacts ?? {},
      how_met: person.how_met ?? null,
      met_at: normalizeIsoDate(person.met_at),
    },
    tags,
    events: events.map((e) => {
      const ev = (e ?? {}) as Record<string, unknown>;
      return {
        kind: ev.kind,
        content: ev.content,
        happened_at: normalizeIsoDate(ev.happened_at) ?? ctx.today,
      };
    }),
  };

  return DraftSchema.safeParse(candidate);
}

/**
 * extract(rawText, peopleIndex) → Draft (design.md §13).
 * Throws ExtractionError after two failed attempts; callers must degrade to
 * the manual form (design.md §9.1 失败退化).
 */
export async function extract(
  rawText: string,
  peopleIndex: PeopleIndexEntry[],
  options: ExtractOptions = {},
): Promise<Draft> {
  const today = options.today ?? todayIso();

  if (isMockProvider()) {
    return mockExtract(rawText, peopleIndex, { ...options, today });
  }

  const model = getExtractionModel();
  const prompt = buildExtractPrompt({
    rawText,
    peopleIndex,
    today,
    forcedIntent: options.forcedIntent,
    targetPersonId: options.targetPersonId,
    tagVocabulary: options.tagVocabulary,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= EXTRACT_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await generateObject({
        model,
        schema: DraftLlmSchema,
        schemaName: "Draft",
        schemaDescription: "人脉录入草稿",
        system: EXTRACT_SYSTEM_PROMPT,
        prompt,
        temperature: 0,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
      });
      // Second, stricter validation on the server side.
      const parsed = normalizeDraft(result.object, { peopleIndex, today, ...options });
      if (parsed.success) return parsed.data;
      lastError = new ExtractionError(
        `Draft 校验失败（第 ${attempt} 次）：${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    } catch (error) {
      lastError = error;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "LLM 抽取失败（未知错误）";
  throw new ExtractionError(message, { cause: lastError });
}
