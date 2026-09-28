/** How many recent events go into the person's vector text (design.md §7.4). */
export const EMBED_RECENT_EVENTS = 5;

export type PersonTextInput = {
  name: string;
  location: string | null;
  summary: string | null;
  impression: string | null;
};

export type PersonTextTag = { name: string; kind: "skill" | "circle" | "other" };
export type PersonTextEvent = { content: string; happened_at: string };

/**
 * Template from design.md §7.4. Contacts are deliberately excluded.
 *
 *   姓名：{name}
 *   所在地：{location}
 *   能力：{skill tags}
 *   圈子：{circle tags}
 *   摘要：{summary}
 *   印象：{impression}
 *   最近：{最近 5 条 events，每条 "YYYY-MM 内容"}
 */
export function buildPersonEmbeddingText(
  person: PersonTextInput,
  tags: PersonTextTag[],
  recentEvents: PersonTextEvent[],
): string {
  const skills = tags.filter((t) => t.kind === "skill").map((t) => t.name);
  const circles = tags.filter((t) => t.kind === "circle").map((t) => t.name);
  const recent = recentEvents
    .slice(0, EMBED_RECENT_EVENTS)
    .map((e) => `${String(e.happened_at).slice(0, 7)} ${e.content}`);

  return [
    `姓名：${person.name}`,
    `所在地：${person.location ?? ""}`,
    `能力：${skills.join("，")}`,
    `圈子：${circles.join("，")}`,
    `摘要：${person.summary ?? ""}`,
    `印象：${person.impression ?? ""}`,
    `最近：${recent.join("；")}`,
  ].join("\n");
}
