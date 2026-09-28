import { z } from "zod";

export const UuidSchema = z.uuid();

/** ISO calendar date, e.g. 2026-09-28. */
export const IsoDateSchema = z.iso.date();

/** Trimmed non-empty string. */
export const NonEmptyString = z.string().trim().min(1);

/**
 * Optional free-text field coming from forms/LLM: trims whitespace and turns
 * empty strings into null.
 */
export const NullableText = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().max(4000).nullable(),
);

/** `{"wechat":"wx123","phone":"..."}`; empty values are dropped. */
export const ContactsSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return {};
    if (typeof value !== "object" || Array.isArray(value)) return value;
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const k = key.trim();
      if (!k) continue;
      if (raw === null || raw === undefined) continue;
      const v = String(raw).trim();
      if (!v) continue;
      out[k] = v;
    }
    return out;
  },
  z.record(z.string().min(1).max(50), z.string().min(1).max(200)),
);

export type Contacts = z.infer<typeof ContactsSchema>;

/** Query-string integer with bounds. */
export function boundedInt(min: number, max: number, fallback: number) {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === "") return fallback;
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : value;
    },
    z.number().int().min(min).max(max),
  );
}

/** Empty query-string values become undefined so optional() applies. */
export const OptionalQueryString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().max(200).optional(),
);
