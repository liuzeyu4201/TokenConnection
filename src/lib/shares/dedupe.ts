/** Extra "might be the same person" rules for a shared card (design §7.4). */

export function matchingContactPersonIds(
  rows: ReadonlyArray<{ id: string; contacts: Record<string, string> | null }>,
  wanted: Record<string, string | null | undefined> | null | undefined,
): string[] {
  if (!wanted) return [];
  const pairs = Object.entries(wanted).filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (pairs.length === 0) return [];
  const ids: string[] = [];
  for (const row of rows) {
    const contacts = row.contacts ?? {};
    if (pairs.some(([key, value]) => contacts[key] === value)) ids.push(row.id);
  }
  return ids;
}

export function matchingShareItemPersonIds(
  rows: ReadonlyArray<{ id: string; sourceShareItemId: string | null }>,
  shareItemId: string | null | undefined,
): string[] {
  if (!shareItemId) return [];
  return rows.filter((row) => row.sourceShareItemId === shareItemId).map((row) => row.id);
}
