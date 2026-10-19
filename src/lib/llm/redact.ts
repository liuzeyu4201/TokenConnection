export type ContactKind = "url" | "email" | "wechat" | "phone";

export type Redaction = {
  token: string;
  value: string;
  kind: ContactKind;
};

export type RedactResult = {
  text: string;
  replacements: Redaction[];
};

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const WECHAT_RE = /(?:微信|weixin|wechat|wx)(?:号)?\s*[:：]?\s*([A-Za-z][\w-]{4,})/gi;
const PHONE_RE = /(?<![0-9])(?:\+?86[-\s]?)?1[3-9]\d{9}(?![0-9])/g;

function push(replacements: Redaction[], kind: ContactKind, value: string): string {
  const existing = replacements.find((item) => item.value === value && item.kind === kind);
  if (existing) return existing.token;
  const token = `[[CONTACT_${replacements.length + 1}]]`;
  replacements.push({ token, value, kind });
  return token;
}

/**
 * Replace phones, emails, wechat ids and URLs with `[[CONTACT_n]]` tokens.
 * The same value reuses the same token. Pure.
 */
export function redactContacts(input: string): RedactResult {
  const replacements: Redaction[] = [];
  let text = input.replace(URL_RE, (value) => push(replacements, "url", value));
  text = text.replace(EMAIL_RE, (value) => push(replacements, "email", value));
  text = text.replace(WECHAT_RE, (whole, id: string) => {
    const token = push(replacements, "wechat", id);
    const idx = whole.lastIndexOf(id);
    return idx >= 0 ? `${whole.slice(0, idx)}${token}` : token;
  });
  text = text.replace(PHONE_RE, (value) => push(replacements, "phone", value.replace(/[-\s]/g, "").replace(/^\+?86/, "")));
  return { text, replacements };
}

export function restorePlaceholders(input: string, replacements: readonly Redaction[]): string {
  let text = input;
  for (const item of replacements) text = text.split(item.token).join(item.value);
  return text;
}

const CONTACT_KEY: Record<Exclude<ContactKind, "url">, string> = {
  phone: "phone",
  email: "email",
  wechat: "wechat",
};

/** Put redacted values back into a draft's contact map without dropping ones the model already filled. */
export function mergeRedactedContacts(
  contacts: Record<string, string> | undefined,
  replacements: readonly Redaction[],
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(contacts ?? {})) {
    next[key] = restorePlaceholders(value, replacements);
  }
  for (const item of replacements) {
    if (item.kind === "url") continue;
    const key = CONTACT_KEY[item.kind];
    if (!next[key]) next[key] = item.value;
  }
  return next;
}
