import type { TagKind } from "@/lib/schemas/enums";

export type CircleTagLike = { id: string; name: string; kind: TagKind };

/** Sector label for people without any circle tag (design.md §14.1). */
export const UNCATEGORIZED_SECTOR = "未分类";

/**
 * Decision on design.md §19 Q2: a person may have several circle tags; the map
 * uses `people.primary_circle_tag_id` when it points at one of them, otherwise
 * the first circle tag sorted by name (zh-CN collation). Null when the person
 * has no circle tag at all.
 */
export function resolvePrimaryCircle<T extends CircleTagLike>(
  primaryCircleTagId: string | null | undefined,
  tags: T[],
): T | null {
  const circles = tags.filter((t) => t.kind === "circle");
  if (circles.length === 0) return null;
  if (primaryCircleTagId) {
    const explicit = circles.find((t) => t.id === primaryCircleTagId);
    if (explicit) return explicit;
  }
  return [...circles].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))[0];
}

export function sectorNameFor(primaryCircleTagId: string | null | undefined, tags: CircleTagLike[]): string {
  return resolvePrimaryCircle(primaryCircleTagId, tags)?.name ?? UNCATEGORIZED_SECTOR;
}
