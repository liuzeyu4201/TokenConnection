import { TIER_RANK, TIER_VALUES, type Tier } from "@/lib/schemas/enums";

import { UNCATEGORIZED_SECTOR } from "./primary-circle";

/**
 * Pure layout for the concentric-ring map (design.md §14.1).
 *
 * - Center is "me"; five rings from Best Bros (inner) to People I know of (outer).
 * - Angle is split into sectors by primary circle tag; sector width mixes an
 *   equal share with a share proportional to head count so small circles stay
 *   visible. The 未分类 sector always comes last (clockwise from 12 o'clock).
 * - Inside one ring × sector, people are ordered by last_contact_at (most
 *   recent first) and spread evenly; a deterministic jitter derived from the
 *   person id nudges the radius so overlapping points separate. Same input →
 *   same output.
 *
 * Coordinates are in a unit circle (radius 1, y grows downwards like SVG);
 * the component multiplies by the pixel radius.
 */

export type RadialPersonInput = {
  id: string;
  tier: Tier;
  /** Sector label (primary circle name or 未分类). */
  sector: string;
  /** ISO timestamp or null. */
  last_contact_at: string | null;
};

export type RadialRing = { tier: Tier; rank: number; radius: number; innerRadius: number; outerRadius: number };
export type RadialSector = { name: string; startAngle: number; endAngle: number; count: number };
export type RadialPoint = {
  id: string;
  x: number;
  y: number;
  angle: number;
  radius: number;
  tier: Tier;
  sector: string;
};

export type RadialLayout = {
  rings: RadialRing[];
  sectors: RadialSector[];
  points: RadialPoint[];
};

export type RadialLayoutOptions = {
  /** Radius of the innermost ring as a fraction of the outer radius. */
  innerRadius?: number;
  /** Radius of the outermost ring as a fraction of the outer radius. */
  outerRadius?: number;
  /** 0 = equal sectors, 1 = purely proportional to head count. */
  proportional?: number;
  /** Max radial jitter as a fraction of the ring step. */
  jitter?: number;
};

const DEFAULTS: Required<RadialLayoutOptions> = {
  innerRadius: 0.22,
  outerRadius: 0.94,
  proportional: 0.55,
  jitter: 0.28,
};

const TWO_PI = Math.PI * 2;
/** Sectors start at 12 o'clock and go clockwise. */
const ANGLE_OFFSET = -Math.PI / 2;

/** FNV-1a 32-bit → [0, 1). Deterministic per id. */
export function hashUnit(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0) / 0x100000000;
}

/** Ring geometry: rank 5 (best_bros) is innermost. */
export function ringsFor(options: RadialLayoutOptions = {}): RadialRing[] {
  const { innerRadius, outerRadius } = { ...DEFAULTS, ...options };
  const step = (outerRadius - innerRadius) / (TIER_VALUES.length - 1);
  return TIER_VALUES.map((tier) => {
    const rank = TIER_RANK[tier];
    const radius = innerRadius + (5 - rank) * step;
    return { tier, rank, radius, innerRadius: radius - step / 2, outerRadius: radius + step / 2 };
  });
}

export function ringRadiusFor(tier: Tier, options: RadialLayoutOptions = {}): number {
  return ringsFor(options).find((r) => r.tier === tier)!.radius;
}

/** Sector order: by head count desc, then name; 未分类 last. */
export function sectorOrder(counts: Map<string, number>): string[] {
  return [...counts.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED_SECTOR) return 1;
    if (b === UNCATEGORIZED_SECTOR) return -1;
    return (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b, "zh-CN");
  });
}

export function assignSectors(people: RadialPersonInput[], options: RadialLayoutOptions = {}): RadialSector[] {
  const { proportional } = { ...DEFAULTS, ...options };
  const counts = new Map<string, number>();
  for (const p of people) counts.set(p.sector, (counts.get(p.sector) ?? 0) + 1);
  const names = sectorOrder(counts);
  if (names.length === 0) return [];
  const total = people.length;
  let cursor = 0;
  return names.map((name) => {
    const count = counts.get(name) ?? 0;
    const share = (1 - proportional) / names.length + proportional * (count / total);
    const startAngle = cursor;
    cursor += share * TWO_PI;
    return { name, startAngle, endAngle: cursor, count };
  });
}

function sortByRecency(a: RadialPersonInput, b: RadialPersonInput): number {
  const ta = a.last_contact_at ? Date.parse(a.last_contact_at) : Number.NEGATIVE_INFINITY;
  const tb = b.last_contact_at ? Date.parse(b.last_contact_at) : Number.NEGATIVE_INFINITY;
  return tb - ta || a.id.localeCompare(b.id);
}

export function layoutRadial(people: RadialPersonInput[], options: RadialLayoutOptions = {}): RadialLayout {
  const opts = { ...DEFAULTS, ...options };
  const rings = ringsFor(opts);
  const sectors = assignSectors(people, opts);
  const ringStep = rings.length > 1 ? rings[1].radius - rings[0].radius : 0.1;
  const points: RadialPoint[] = [];

  for (const sector of sectors) {
    // Keep points away from sector boundaries.
    const span = sector.endAngle - sector.startAngle;
    const pad = Math.min(span * 0.12, 0.08);
    const usable = Math.max(span - 2 * pad, 0);

    for (const ring of rings) {
      const slot = people.filter((p) => p.sector === sector.name && p.tier === ring.tier).sort(sortByRecency);
      slot.forEach((person, index) => {
        const t = slot.length === 1 ? 0.5 : (index + 0.5) / slot.length;
        const angle = ANGLE_OFFSET + sector.startAngle + pad + t * usable;
        // Deterministic jitter: alternate inwards/outwards by position, scaled by id hash.
        const h = hashUnit(person.id);
        const direction = index % 2 === 0 ? 1 : -1;
        const magnitude = slot.length === 1 ? (h - 0.5) * 0.5 : 0.35 + h * 0.65;
        const radius = ring.radius + direction * magnitude * opts.jitter * ringStep;
        points.push({
          id: person.id,
          angle,
          radius,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          tier: person.tier,
          sector: sector.name,
        });
      });
    }
  }

  return { rings, sectors, points };
}
