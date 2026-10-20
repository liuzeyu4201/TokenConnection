import { DraftSchema, type Draft } from "@/lib/schemas/draft";

import type { ShareSnapshot } from "./snapshot";

/** Turn a stored snapshot into the draft the recipient edits before collecting. */
export function draftFromSnapshot(snapshot: ShareSnapshot, fromUsername: string | null): Draft {
  const referrer = fromUsername?.replace(/^@/, "") || null;
  return DraftSchema.parse({
    intent: "add",
    target_person_id: null,
    target_confidence: 0,
    person: {
      name: snapshot.name,
      gender: snapshot.gender ?? null,
      location: snapshot.location ?? null,
      tier: null,
      summary: snapshot.summary ?? null,
      impression: snapshot.impression ?? null,
      contacts: snapshot.contacts ?? {},
      how_met: referrer ? `经 @${referrer} 引荐` : (snapshot.how_met ?? null),
      met_at: snapshot.met_at ?? null,
    },
    tags: snapshot.tags ?? [],
    events: (snapshot.events ?? []).map((event) => ({
      kind: event.kind,
      content: event.content,
      happened_at: event.happened_at,
    })),
  });
}

/** One sentence stored as inbox.raw_text so the list stays searchable. */
export function shareRawText(input: {
  fromUsername: string | null;
  showOwner: boolean;
  name: string;
  bits: string[];
  message?: string | null;
}): string {
  const who = input.showOwner && input.fromUsername ? `@${input.fromUsername.replace(/^@/, "")}` : "有人";
  const extra = input.bits.filter(Boolean).slice(0, 4).join(" · ");
  const head = extra ? `${who} 分享了「${input.name}」：${extra}` : `${who} 分享了「${input.name}」`;
  const note = input.message?.trim();
  return note ? `${head}。附言：${note}` : `${head}。`;
}
