import { CITIES, type City } from "./cities";

/**
 * Offline geocoder for `people.location` (design.md §14.2, decision on §19 Q5:
 * no external geocoding service). Matches free text such as "杭州西湖区",
 * "深圳南山", "杭州市", "浙江宁波", "Shanghai" or "new york" against the static
 * city table. Returns null when nothing matches — it never guesses.
 *
 * Extension point: an online geocoder (e.g. 高德 / 腾讯位置服务) could be
 * consulted here when this function returns null and a key is configured.
 */

export type GeocodeMatch = {
  city: City;
  lat: number;
  lng: number;
  /** exact alias hit, prefix of a longer string, or after stripping a province. */
  how: "exact" | "prefix" | "province-prefix";
};

const SUFFIX_RE = /(特别行政区|自治区|自治州|自治县|地区|新区|开发区|高新区|市区|市|省|区|县|州|盟|镇|乡|街道)$/;
const NOISE_RE = /[\s,，、·。.\-—()（）]/g;

type IndexEntry = { city: City; priority: number };

let aliasIndex: Map<string, IndexEntry> | null = null;
let provinceAliases: string[] | null = null;

const LEVEL_PRIORITY: Record<City["level"], number> = { province: 0, city: 1, world: 2 };

function normalizeKey(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(NOISE_RE, "")
      .replace(/^中国/, "")
      // Inner administrative words: 广东省深圳市南山区 → 广东深圳南山区
      .replace(/(特别行政区|自治区|自治州|省|市)(?=[\u4e00-\u9fa5])/g, "")
  );
}

function buildIndex(): Map<string, IndexEntry> {
  if (aliasIndex) return aliasIndex;
  const index = new Map<string, IndexEntry>();
  // CITIES is ordered by admin level and population; the first writer wins,
  // so ambiguous aliases (宝安 → 深圳 vs 宝安区) resolve to the bigger place.
  CITIES.forEach((city, position) => {
    const priority = LEVEL_PRIORITY[city.level] * 100000 + position;
    const keys = new Set<string>(
      [city.name, city.en, city.en.replace(/ City$/i, ""), ...city.aliases].map(normalizeKey),
    );
    for (const key of keys) {
      if (!key) continue;
      const existing = index.get(key);
      if (!existing || existing.priority > priority) index.set(key, { city, priority });
      // Also index the suffix-stripped form (杭州市 → 杭州).
      const stripped = stripSuffix(key);
      if (stripped !== key && stripped.length >= 2 && !index.has(stripped)) index.set(stripped, { city, priority });
    }
  });
  aliasIndex = index;
  return index;
}

function getProvinceAliases(): string[] {
  if (provinceAliases) return provinceAliases;
  provinceAliases = CITIES.filter((c) => c.level === "province" || ["北京", "上海", "天津", "重庆"].includes(c.name))
    .flatMap((c) => [c.name, ...c.aliases])
    .map(normalizeKey)
    .filter((a) => /^[\u4e00-\u9fa5]+$/.test(a))
    .sort((a, b) => b.length - a.length);
  return provinceAliases;
}

/** Remove one administrative suffix (市/省/区/县/…) repeatedly. */
export function stripSuffix(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i++) {
    const next = current.replace(SUFFIX_RE, "");
    if (next === current || next.length < 2) break;
    current = next;
  }
  return current;
}

/** Normalize user input to the lookup key: lowercase, no noise, no suffixes. */
export function normalizeLocation(value: string): string {
  return stripSuffix(normalizeKey(value.trim()));
}

function toMatch(entry: IndexEntry, how: GeocodeMatch["how"]): GeocodeMatch {
  return { city: entry.city, lat: entry.city.lat, lng: entry.city.lng, how };
}

export function geocode(location: string | null | undefined): GeocodeMatch | null {
  if (!location) return null;
  const index = buildIndex();
  // Try the unstripped form first so "吉林市" (city) beats "吉林" (province).
  const rawKey = normalizeKey(location.trim());
  const rawHit = index.get(rawKey);
  if (rawHit) return toMatch(rawHit, "exact");

  const key = stripSuffix(rawKey);
  if (key.length < 2) return null;

  const exact = index.get(key);
  if (exact) return toMatch(exact, "exact");

  const isCjk = /^[\u4e00-\u9fa5]+$/.test(key);
  if (!isCjk) return null; // Latin input must match an alias exactly.

  // "浙江宁波" / "广东省深圳市南山区": drop a leading province, then retry.
  for (const province of getProvinceAliases()) {
    if (key.startsWith(province) && key.length > province.length) {
      const rest = stripSuffix(key.slice(province.length));
      if (rest.length >= 2) {
        const hit = index.get(rest);
        if (hit) return toMatch(hit, "province-prefix");
        const prefixHit = longestPrefix(index, rest);
        if (prefixHit) return toMatch(prefixHit, "province-prefix");
      }
      // Only the province was recognizable: fall back to its capital.
      const provinceHit = index.get(province);
      if (provinceHit && rest.length < 2) return toMatch(provinceHit, "exact");
    }
  }

  // "杭州西湖" / "深圳南山": longest known prefix wins.
  const prefixHit = longestPrefix(index, key);
  return prefixHit ? toMatch(prefixHit, "prefix") : null;
}

function longestPrefix(index: Map<string, IndexEntry>, key: string): IndexEntry | null {
  for (let len = Math.min(key.length - 1, 8); len >= 2; len--) {
    const hit = index.get(key.slice(0, len));
    if (hit) return hit;
  }
  return null;
}

/** Cities whose name/alias contains the query — for "pick a city" UIs. */
export function searchCities(query: string, limit = 10): City[] {
  const q = normalizeKey(query.trim());
  if (!q) return [];
  const out: City[] = [];
  for (const city of CITIES) {
    if (city.level === "province") continue;
    if (city.name.includes(q) || normalizeKey(city.en).includes(q) || city.aliases.some((a) => normalizeKey(a).includes(q))) {
      out.push(city);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function cityCount(): { total: number; china: number; hkMoTw: number; world: number; provinces: number } {
  return {
    total: CITIES.length,
    china: CITIES.filter((c) => c.level === "city" && c.country === "CN").length,
    hkMoTw: CITIES.filter((c) => c.level === "city" && c.country !== "CN").length,
    world: CITIES.filter((c) => c.level === "world").length,
    provinces: CITIES.filter((c) => c.level === "province").length,
  };
}
