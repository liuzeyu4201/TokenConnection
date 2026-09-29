import { describe, expect, it } from "vitest";

import { composeImageText, validateImage } from "./vision";

describe("composeImageText", () => {
  it("把用户的话和图片读出的事实拼在一起，前缀留在开头", () => {
    expect(composeImageText("+今天认识的", "姓名小王，深圳，微信 wx1")).toBe(
      "+今天认识的\n图片里看到：姓名小王，深圳，微信 wx1",
    );
  });

  it("只有图片时用读出的事实", () => {
    expect(composeImageText("  ", "名片：李四")).toBe("图片里看到：名片：李四");
  });

  it("没有图片说明时只保留用户的话", () => {
    expect(composeImageText("想找个律师", null)).toBe("想找个律师");
    expect(composeImageText("", "")).toBe("");
  });
});

describe("validateImage", () => {
  it("接受常见图片类型", () => {
    expect(validateImage({ mediaType: "image/png", size: 10 })).toBe("image/png");
  });

  it("拒绝不支持的类型、空文件和超过 4MB 的文件", () => {
    expect(() => validateImage({ mediaType: "image/heic", size: 10 })).toThrow(/jpg/);
    expect(() => validateImage({ mediaType: "image/jpeg", size: 0 })).toThrow(/空/);
    expect(() => validateImage({ mediaType: "image/jpeg", size: 4 * 1024 * 1024 + 1 })).toThrow(/4MB/);
  });
});
