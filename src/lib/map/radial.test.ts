import { describe, expect, it } from "vitest";

import { TIER_VALUES } from "@/lib/schemas/enums";

import { resolvePrimaryCircle, sectorNameFor, UNCATEGORIZED_SECTOR } from "./primary-circle";
import { assignSectors, hashUnit, layoutRadial, ringRadiusFor, ringsFor, type RadialPersonInput } from "./radial";

const person = (id: string, tier: RadialPersonInput["tier"], sector: string, last: string | null = null): RadialPersonInput => ({
  id,
  tier,
  sector,
  last_contact_at: last,
});

describe("rings", () => {
  it("puts Best Bros innermost and People I know of outermost, evenly spaced", () => {
    const rings = ringsFor();
    expect(rings.map((r) => r.tier)).toEqual([...TIER_VALUES]);
    expect(ringRadiusFor("best_bros")).toBeLessThan(ringRadiusFor("close_friends"));
    expect(ringRadiusFor("friends")).toBeLessThan(ringRadiusFor("interacted"));
    expect(ringRadiusFor("known_of")).toBeLessThanOrEqual(1);
    const steps = rings.slice(1).map((r, i) => r.radius - rings[i].radius);
    for (const s of steps) expect(s).toBeCloseTo(steps[0], 6);
  });
});

describe("sectors", () => {
  it("gives every circle a sector, 未分类 last, sizes weighted by head count", () => {
    const people = [
      person("a", "friends", "球友"),
      person("b", "friends", "球友"),
      person("c", "friends", "球友"),
      person("d", "friends", "前同事"),
      person("e", "friends", UNCATEGORIZED_SECTOR),
    ];
    const sectors = assignSectors(people);
    expect(sectors.map((s) => s.name)).toEqual(["球友", "前同事", UNCATEGORIZED_SECTOR]);
    expect(sectors[0].endAngle - sectors[0].startAngle).toBeGreaterThan(sectors[1].endAngle - sectors[1].startAngle);
    expect(sectors[sectors.length - 1].endAngle).toBeCloseTo(Math.PI * 2, 6);
    expect(sectors.every((s) => s.endAngle > s.startAngle)).toBe(true);
  });

  it("returns no sectors for no people", () => {
    expect(assignSectors([])).toEqual([]);
    expect(layoutRadial([]).points).toEqual([]);
  });
});

describe("layoutRadial", () => {
  const people = [
    person("p1", "best_bros", "发小", "2026-09-01T00:00:00Z"),
    person("p2", "close_friends", "球友", "2026-09-14T00:00:00Z"),
    person("p3", "close_friends", "球友", "2026-06-01T00:00:00Z"),
    person("p4", "close_friends", "球友", null),
    person("p5", "known_of", UNCATEGORIZED_SECTOR),
  ];

  it("places every person near their tier ring inside their sector", () => {
    const layout = layoutRadial(people);
    expect(layout.points).toHaveLength(people.length);
    for (const point of layout.points) {
      const ring = layout.rings.find((r) => r.tier === point.tier)!;
      expect(point.radius).toBeGreaterThan(ring.innerRadius);
      expect(point.radius).toBeLessThan(ring.outerRadius);
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(point.radius, 6);
      const sector = layout.sectors.find((s) => s.name === point.sector)!;
      const angle = ((point.angle + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      expect(angle).toBeGreaterThanOrEqual(sector.startAngle - 1e-9);
      expect(angle).toBeLessThanOrEqual(sector.endAngle + 1e-9);
    }
  });

  it("orders people in one ring × sector by last contact (most recent first) and separates them", () => {
    const layout = layoutRadial(people);
    const byId = new Map(layout.points.map((p) => [p.id, p]));
    const [p2, p3, p4] = [byId.get("p2")!, byId.get("p3")!, byId.get("p4")!];
    // Sector angles grow clockwise; most recent first.
    expect(p2.angle).toBeLessThan(p3.angle);
    expect(p3.angle).toBeLessThan(p4.angle);
    const positions = [p2, p3, p4].map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`);
    expect(new Set(positions).size).toBe(3);
  });

  it("is deterministic: same input → identical output, regardless of input order", () => {
    const a = layoutRadial(people);
    const b = layoutRadial([...people].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(hashUnit("p1")).toBe(hashUnit("p1"));
    expect(hashUnit("p1")).not.toBe(hashUnit("p2"));
    expect(hashUnit("anything")).toBeGreaterThanOrEqual(0);
    expect(hashUnit("anything")).toBeLessThan(1);
  });
});

describe("resolvePrimaryCircle (design.md §19 Q2)", () => {
  const tags = [
    { id: "t-skill", name: "羽毛球", kind: "skill" as const },
    { id: "t-c2", name: "球友", kind: "circle" as const },
    { id: "t-c1", name: "大学同学", kind: "circle" as const },
  ];

  it("uses the explicit primary when it is one of the person's circle tags", () => {
    expect(resolvePrimaryCircle("t-c2", tags)?.name).toBe("球友");
  });

  it("falls back to the first circle tag by name when unset or stale", () => {
    expect(resolvePrimaryCircle(null, tags)?.name).toBe("大学同学");
    expect(resolvePrimaryCircle("t-gone", tags)?.name).toBe("大学同学");
    expect(resolvePrimaryCircle("t-skill", tags)?.name).toBe("大学同学");
  });

  it("returns null / 未分类 without circle tags", () => {
    expect(resolvePrimaryCircle(null, [tags[0]])).toBeNull();
    expect(sectorNameFor(null, [])).toBe(UNCATEGORIZED_SECTOR);
    expect(sectorNameFor("t-c2", tags)).toBe("球友");
  });
});
