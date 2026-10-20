import { describe, expect, it } from "vitest";

import { buildExtractPrompt } from "./prompts";

describe("extract prompt tenancy", () => {
  it("includes only the people handed in, which the service loads for the current user", () => {
    const prompt = buildExtractPrompt({
      rawText: "认识小周",
      today: "2026-10-20",
      peopleIndex: [{ id: "11111111-1111-4111-8111-111111111111", name: "只属于甲", summary_line: "深圳" }],
    });
    expect(prompt).toContain("只属于甲");
    expect(prompt).not.toContain("乙的未分享朋友");
  });
});
