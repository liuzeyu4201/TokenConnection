/** Authorization context for the service layer (multi-user-design.md §2.2, M-07). */

export const SCOPES = [
  "inbox:write",
  "inbox:read",
  "people:read",
  "people:write",
  "search:read",
  "tags:read",
  "tags:write",
  "map:read",
  "reminders:read",
] as const;

export type Scope = (typeof SCOPES)[number];

export type Role = "admin" | "member";

export type ServiceContext = {
  userId: string;
  role: Role;
  via: "session" | "pat";
  /** Present only when `via` is `"pat"`. */
  scopes?: readonly Scope[];
  sessionId?: string;
  tokenId?: string;
};

export const SCOPE_PRESETS = {
  /** iPhone shortcut: record one sentence. */
  shortcut: ["inbox:write"] as const satisfies readonly Scope[],
  readonly: ["people:read", "search:read", "tags:read", "map:read", "reminders:read", "inbox:read"] as const satisfies readonly Scope[],
  full: SCOPES,
};

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

export function normalizeScopes(values: readonly string[]): Scope[] {
  const out: Scope[] = [];
  for (const value of values) {
    if (isScope(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

/** Session callers are not scope-limited. PAT callers must list the scope. */
export function hasScope(ctx: Pick<ServiceContext, "via" | "scopes">, scope: Scope): boolean {
  if (ctx.via === "session") return true;
  return ctx.scopes?.includes(scope) ?? false;
}
