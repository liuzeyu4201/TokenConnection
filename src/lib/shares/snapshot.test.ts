import { describe, expect, it } from "vitest";

import { DraftSchema } from "@/lib/schemas/draft";

import { draftFromSnapshot } from "./draft-from-snapshot";
import { applyRevoke, decideLinkAccess, hashPasscode, verifyPasscode, type LinkView } from "./link";
import { buildShareSnapshot, DEFAULT_SHARE_FIELDS, PRIVATE_SNAPSHOT_KEYS, type SnapshotPerson } from "./snapshot";
import { matchingContactPersonIds, matchingShareItemPersonIds } from "./dedupe";

const person: SnapshotPerson = {
  name: "小王",
  gender: "male",
  location: "深圳",
  tags: [
    { name: "球友", kind: "circle" },
    { name: "羽毛球", kind: "skill" },
  ],
  how_met: "球场认识",
  met_at: "2024-05-01",
  summary: "羽毛球教练",
  impression: "人很好，但只想私下记",
  contacts: { wechat: "wang-coach", phone: "13800000000" },
  events: [{ kind: "hangout", content: "一起打球", happened_at: "2024-06-01" }],
  tier: "friends",
  lat: 22.54,
  lng: 114.06,
};

describe("buildShareSnapshot", () => {
  it("keeps only the public-safe fields by default", () => {
    const snapshot = buildShareSnapshot(person, DEFAULT_SHARE_FIELDS);
    expect(snapshot).toMatchObject({
      version: 1,
      name: "小王",
      gender: "male",
      location: "深圳",
      how_met: "球场认识",
      met_at: "2024-05-01",
      lat: 22.54,
      lng: 114.06,
    });
    expect(snapshot.tags).toEqual([
      { name: "球友", kind: "circle" },
      { name: "羽毛球", kind: "skill" },
    ]);
    for (const key of PRIVATE_SNAPSHOT_KEYS) {
      expect(snapshot).not.toHaveProperty(key);
    }
  });

  it("copies only the contact keys that were checked", () => {
    const snapshot = buildShareSnapshot(person, { ...DEFAULT_SHARE_FIELDS, contacts: ["wechat"] });
    expect(snapshot.contacts).toEqual({ wechat: "wang-coach" });
    expect(snapshot).not.toHaveProperty("impression");
  });

  it("includes impression only when that switch is on", () => {
    const snapshot = buildShareSnapshot(person, { ...DEFAULT_SHARE_FIELDS, impression: true, summary: true });
    expect(snapshot.impression).toBe("人很好，但只想私下记");
    expect(snapshot.summary).toBe("羽毛球教练");
  });

  it("can limit tags to skills and events to one kind", () => {
    const snapshot = buildShareSnapshot(person, {
      ...DEFAULT_SHARE_FIELDS,
      tags: "skills",
      events: { kinds: ["note"] },
      tier: true,
    });
    expect(snapshot.tags).toEqual([{ name: "羽毛球", kind: "skill" }]);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.tier).toBe("friends");
  });
});

describe("draftFromSnapshot", () => {
  it("rewrites how they met and leaves tier for the recipient", () => {
    const snapshot = buildShareSnapshot(person, { ...DEFAULT_SHARE_FIELDS, contacts: ["wechat"] });
    const draft = draftFromSnapshot(snapshot, "aming");
    expect(DraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.person.how_met).toBe("经 @aming 引荐");
    expect(draft.person.tier).toBeNull();
    expect(draft.person.contacts).toEqual({ wechat: "wang-coach" });
    expect(draft.intent).toBe("add");
  });
});

describe("share links", () => {
  const now = new Date("2026-10-20T00:00:00Z");

  it("rejects expired, exhausted, revoked and locked links", () => {
    const base: LinkView = {
      revokedAt: null,
      expiresAt: new Date("2026-10-27T00:00:00Z"),
      maxViews: 2,
      viewCount: 0,
      passcodeHash: null,
      passcodeFailures: 0,
      unlocked: false,
      now,
    };
    expect(decideLinkAccess(base)).toEqual({ ok: true });
    const reason = (patch: Partial<LinkView>) => {
      const decision = decideLinkAccess({ ...base, ...patch });
      if (!decision.ok && decision.code === "share_gone") return decision.reason;
      throw new Error("expected gone");
    };
    expect(reason({ expiresAt: now })).toBe("expired");
    expect(reason({ viewCount: 2 })).toBe("exhausted");
    expect(reason({ revokedAt: now })).toBe("revoked");
    expect(reason({ passcodeFailures: 10 })).toBe("passcode_locked");
  });

  it("asks for a passcode until the visitor is unlocked", () => {
    const link = {
      revokedAt: null,
      expiresAt: new Date("2026-10-27T00:00:00Z"),
      maxViews: null,
      viewCount: 0,
      passcodeHash: "salt",
      passcodeFailures: 0,
      unlocked: false,
      now,
    };
    const locked = decideLinkAccess(link);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.code).toBe("share_passcode_required");
    expect(decideLinkAccess({ ...link, unlocked: true })).toEqual({ ok: true });
  });

  it("hashes a passcode so the plaintext is not stored", () => {
    const stored = hashPasscode("open-sesame");
    expect(stored).not.toContain("open-sesame");
    expect(verifyPasscode("open-sesame", stored)).toBe(true);
    expect(verifyPasscode("wrong", stored)).toBe(false);
  });
});

describe("revoke keeps collected copies", () => {
  it("clears snapshots and pending inbox without touching copies", () => {
    const copies = [{ id: "person-b" }];
    const next = applyRevoke({
      snapshots: [{ name: "小王" }],
      linksOpen: [true],
      pendingInboxIds: ["inbox-1"],
      copies,
    });
    expect(next.snapshots).toEqual([null]);
    expect(next.linksOpen).toEqual([false]);
    expect(next.pendingInboxIds).toEqual([]);
    expect(next.copies).toEqual([{ id: "person-b" }]);
    expect(next.copies).not.toBe(copies);
  });
});

describe("share dedupe", () => {
  it("matches a contact key and a previous copy of the same card", () => {
    expect(
      matchingContactPersonIds(
        [{ id: "p1", contacts: { wechat: "wang-coach", phone: "1" } }],
        { wechat: "wang-coach" },
      ),
    ).toEqual(["p1"]);
    expect(
      matchingShareItemPersonIds([{ id: "p2", sourceShareItemId: "item-1" }], "item-1"),
    ).toEqual(["p2"]);
  });
});
