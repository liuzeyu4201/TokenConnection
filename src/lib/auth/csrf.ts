const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method: string): boolean {
  return SAFE.has(method.toUpperCase());
}

/**
 * Cookie-session mutations must be same-origin.
 * `Sec-Fetch-Site: same-origin | none` passes. Otherwise `Origin` host must equal `Host`.
 */
export function csrfAllows(input: {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
}): boolean {
  if (isSafeMethod(input.method)) return true;
  const site = input.secFetchSite?.toLowerCase() ?? "";
  if (site === "same-origin" || site === "none") return true;
  if (input.origin && input.host) {
    try {
      return new URL(input.origin).host === input.host;
    } catch {
      return false;
    }
  }
  return false;
}
