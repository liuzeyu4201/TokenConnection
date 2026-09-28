import { describe, expect, it } from "vitest";

import {
  applyModePrefix,
  buildSubmission,
  cleanTemplateText,
  findNextPlaceholder,
  hasPlaceholder,
  isOmniboxMode,
  RECORD_TEMPLATES,
} from "./templates";

describe("applyModePrefix", () => {
  it("auto 模式不加前缀", () => {
    expect(applyModePrefix("小王上周帮我修了球拍", "auto")).toBe("小王上周帮我修了球拍");
  });
  it("记人模式加 +，找人模式加 ?", () => {
    expect(applyModePrefix("小王上周帮我修了球拍", "record")).toBe("+小王上周帮我修了球拍");
    expect(applyModePrefix("会打羽毛球的", "query")).toBe("?会打羽毛球的");
  });
  it("用户已经写了前缀（含全角）时不重复加", () => {
    expect(applyModePrefix("?会打羽毛球的", "record")).toBe("?会打羽毛球的");
    expect(applyModePrefix("＋小王", "query")).toBe("＋小王");
  });
  it("空文本返回空", () => {
    expect(applyModePrefix("   ", "record")).toBe("");
  });
});

describe("placeholders", () => {
  it("识别并定位【】空位，越过末尾后回到开头", () => {
    const text = "今天在【场合】认识了【名字】";
    expect(hasPlaceholder(text)).toBe(true);
    expect(findNextPlaceholder(text, 0)).toEqual({ start: 3, end: 7 });
    expect(findNextPlaceholder(text, 7)).toEqual({ start: 10, end: 14 });
    expect(findNextPlaceholder(text, 14)).toEqual({ start: 3, end: 7 });
  });
  it("没有空位时返回 null", () => {
    expect(hasPlaceholder("小王上周帮我修了球拍")).toBe(false);
    expect(findNextPlaceholder("小王上周帮我修了球拍", 0)).toBeNull();
  });
  it("每个模板都至少有一个空位", () => {
    for (const t of RECORD_TEMPLATES) expect(hasPlaceholder(t.text)).toBe(true);
  });
});

describe("cleanTemplateText", () => {
  it("没有空位的文本原样返回", () => {
    expect(cleanTemplateText("小王上周帮我修了球拍")).toBe("小王上周帮我修了球拍");
  });
  it("去掉没填的空位和引出它的虚词，并收拾标点", () => {
    expect(cleanTemplateText("今天在【场合】认识了小王，羽毛球教练，在深圳，微信【wx】，感觉【印象】")).toBe(
      "今天认识了小王，羽毛球教练，在深圳",
    );
    expect(cleanTemplateText("今天在球馆认识了小王，【做什么 / 能力】，在【城市】，微信 wx123，感觉【印象】")).toBe(
      "今天在球馆认识了小王，微信 wx123",
    );
  });
  it("处理「听【谁】说的」", () => {
    expect(cleanTemplateText("听【谁】说的，老周在深圳做投资，【为什么值得记住】")).toBe("老周在深圳做投资");
    expect(cleanTemplateText("听吴凡说的，老周在深圳做【什么】，人很靠谱")).toBe("听吴凡说的，老周在深圳，人很靠谱");
  });
  it("全部没填时为空", () => {
    expect(cleanTemplateText("【名字】【什么时候】【帮我做了什么 / 一起做了什么】")).toBe("");
  });
  it("详细版模板：丢掉没填的字段行，保留填了的", () => {
    const filled = [
      "名字：小王",
      "怎么认识的：【场合、时间、谁介绍的】",
      "做什么 / 能力：羽毛球教练",
      "所在地：【城市】",
      "联系方式：【微信 / 电话 / 邮箱】",
      "关系：刚认识",
      "印象：【性格、品格、感受】",
    ].join("\n");
    expect(cleanTemplateText(filled)).toBe("名字：小王\n做什么 / 能力：羽毛球教练\n关系：刚认识");
  });
});

describe("buildSubmission", () => {
  it("先清理再加前缀", () => {
    expect(buildSubmission("今天在【场合】认识了小王，羽毛球教练", "record")).toBe("+今天认识了小王，羽毛球教练");
    expect(buildSubmission("想找个会【能力】的人", "query")).toBe("?想找个会的人");
    expect(buildSubmission("【名字】【什么时候】", "record")).toBe("");
  });
});

describe("isOmniboxMode", () => {
  it("只接受三个合法值", () => {
    expect(isOmniboxMode("auto")).toBe(true);
    expect(isOmniboxMode("record")).toBe(true);
    expect(isOmniboxMode("query")).toBe(true);
    expect(isOmniboxMode("other")).toBe(false);
    expect(isOmniboxMode(null)).toBe(false);
  });
});
