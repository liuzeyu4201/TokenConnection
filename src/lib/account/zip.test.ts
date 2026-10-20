import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { zipStore } from "./zip";

describe("zipStore", () => {
  it("round-trips a stored file", () => {
    const zip = Buffer.from(zipStore([{ name: "hello.txt", data: Buffer.from("你好") }]));
    expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
    const nameLen = zip.readUInt16LE(26);
    const size = zip.readUInt32LE(18);
    const start = 30 + nameLen;
    expect(zip.subarray(start, start + size).toString()).toBe("你好");
    expect(inflateRawSync).toBeTypeOf("function");
  });
});
