import { describe, expect, it } from "vitest";

import { consumeMemoryLimit, resetMemoryLimits } from "@/lib/auth/rate-limit";
import { SHARE_PUBLIC_READS_PER_MINUTE } from "@/lib/shares/link";

describe("public share read limit", () => {
  it("allows the documented number of reads and blocks the next one", () => {
    resetMemoryLimits();
    const now = 1_000_000;
    for (let i = 0; i < SHARE_PUBLIC_READS_PER_MINUTE; i += 1) {
      expect(consumeMemoryLimit("share-read:test", now, 60_000, SHARE_PUBLIC_READS_PER_MINUTE).allowed).toBe(true);
    }
    expect(consumeMemoryLimit("share-read:test", now, 60_000, SHARE_PUBLIC_READS_PER_MINUTE).allowed).toBe(false);
  });
});
