import type { ExtractOptions } from "./types";

/**
 * Universal input prefixes (design.md §9.2): `+` forces "record", `?` forces
 * "query". Both ASCII and full-width variants are accepted.
 */
export function parseInputPrefix(raw: string): {
  text: string;
  forcedIntent?: ExtractOptions["forcedIntent"];
} {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+") || trimmed.startsWith("＋")) {
    return { text: trimmed.slice(1).trim(), forcedIntent: "add" };
  }
  if (trimmed.startsWith("?") || trimmed.startsWith("？")) {
    return { text: trimmed.slice(1).trim(), forcedIntent: "query" };
  }
  return { text: trimmed };
}
