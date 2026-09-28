import { describe, expect, it } from "vitest";

import { cityCount } from "./geocode";
import { geocode, normalizeLocation, searchCities, stripSuffix } from "./geocode";

describe("normalizeLocation / stripSuffix", () => {
  it("strips administrative suffixes and noise", () => {
    expect(stripSuffix("杭州市")).toBe("杭州");
    expect(stripSuffix("内蒙古自治区")).toBe("内蒙古");
    expect(stripSuffix("香港特别行政区")).toBe("香港");
    expect(normalizeLocation(" 深圳市 南山区 ")).toBe("深圳南山");
    expect(normalizeLocation("New York")).toBe("newyork");
  });
});

describe("geocode", () => {
  it("matches exact city names with or without 市", () => {
    expect(geocode("杭州")?.city.name).toBe("杭州");
    expect(geocode("杭州市")?.city.name).toBe("杭州");
    expect(geocode("深圳")?.lat).toBeCloseTo(22.5455, 1);
  });

  it("matches city + district ('杭州西湖区', '深圳南山')", () => {
    expect(geocode("杭州西湖区")).toMatchObject({ how: "prefix", city: { name: "杭州" } });
    expect(geocode("深圳南山")).toMatchObject({ how: "prefix", city: { name: "深圳" } });
    expect(geocode("上海徐汇")?.city.country).toBe("CN");
  });

  it("drops a leading province ('浙江宁波', '广东省深圳市南山区')", () => {
    expect(geocode("浙江宁波")).toMatchObject({ how: "province-prefix", city: { name: "宁波" } });
    expect(geocode("广东省深圳市南山区")?.city.name).toBe("深圳");
  });

  it("resolves provinces to their capital and municipalities to themselves", () => {
    expect(geocode("浙江")?.city.name).toBe("浙江");
    expect(geocode("浙江")?.lat).toBe(geocode("杭州")?.lat);
    expect(geocode("吉林")?.lat).toBe(geocode("长春")?.lat);
    expect(geocode("吉林市")?.city.name).toBe("吉林市");
    expect(geocode("北京市")?.city.name).toBe("北京");
    expect(geocode("重庆")?.city.name).toBe("重庆");
  });

  it("knows autonomous prefectures by their seat", () => {
    expect(geocode("延边")?.city.name).toBe("延吉");
    expect(geocode("西双版纳")?.city.name).toBe("景洪");
  });

  it("matches English and traditional Chinese names", () => {
    expect(geocode("Shanghai")?.city.name).toBe("上海");
    expect(geocode("new york")?.city.name).toBe("纽约");
    expect(geocode("San Francisco")?.city.name).toBe("旧金山");
    expect(geocode("臺北")?.city.name).toBe("台北");
    expect(geocode("香港")?.city.country).toBe("HK");
  });

  it("matches world cities by Chinese name", () => {
    expect(geocode("硅谷")?.city.en).toBe("San Jose");
    expect(geocode("东京")?.city.country).toBe("JP");
    expect(geocode("新加坡")?.lat).toBeCloseTo(1.28, 1);
  });

  it("returns null instead of guessing", () => {
    expect(geocode("")).toBeNull();
    expect(geocode(null)).toBeNull();
    expect(geocode("火星")).toBeNull();
    expect(geocode("西湖区")).toBeNull();
    expect(geocode("某个小镇")).toBeNull();
    expect(geocode("Atlantis")).toBeNull();
    expect(geocode("市")).toBeNull();
  });

  it("covers every province-level division and the main world cities", () => {
    const counts = cityCount();
    expect(counts.provinces + 6).toBeGreaterThanOrEqual(34); // 28 provinces + 4 municipalities + HK + MO
    expect(counts.china).toBeGreaterThan(300);
    expect(counts.world).toBeGreaterThanOrEqual(50);
    for (const p of ["河北", "黑龙江", "西藏", "新疆", "台湾", "澳门", "香港", "天津"]) expect(geocode(p)).not.toBeNull();
  });

  it("searchCities finds candidates for a picker", () => {
    expect(searchCities("杭").map((c) => c.name)).toContain("杭州");
    expect(searchCities("shen").length).toBeGreaterThan(0);
    expect(searchCities("")).toEqual([]);
  });
});
