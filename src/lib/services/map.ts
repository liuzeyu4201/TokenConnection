import { desc, eq } from "drizzle-orm";

import { people, type PersonRow, type TagRow } from "@/db/schema";
import type { ServiceContext } from "@/lib/auth/context";
import { withTenant } from "@/lib/auth/tenant";
import { geocode } from "@/lib/geo/geocode";
import { resolvePrimaryCircle, UNCATEGORIZED_SECTOR } from "@/lib/map/primary-circle";
import { layoutRadial, type RadialLayout } from "@/lib/map/radial";

import { attachTags, type PersonWithTags } from "./people";

export type MapPerson = {
  id: string;
  name: string;
  tier: PersonRow["tier"];
  location: string | null;
  summary: string | null;
  last_contact_at: string | null;
  tags: TagRow[];
  sector: string;
  primary_circle_tag_id: string | null;
};

export type RadialMapData = {
  people: MapPerson[];
  layout: RadialLayout;
  skills: string[];
  locations: string[];
};

export type GeoCluster = {
  key: string;
  lat: number;
  lng: number;
  label: string;
  people: MapPerson[];
};

export type GeoMapData = {
  clusters: GeoCluster[];
  unlocated: Array<Pick<MapPerson, "id" | "name" | "tier" | "location">>;
  no_location_count: number;
  located_count: number;
  skills: string[];
};

function toMapPerson(person: PersonWithTags): MapPerson {
  const primary = resolvePrimaryCircle(person.primary_circle_tag_id, person.tags);
  return {
    id: person.id,
    name: person.name,
    tier: person.tier,
    location: person.location,
    summary: person.summary,
    last_contact_at: person.last_contact_at ? person.last_contact_at.toISOString() : null,
    tags: person.tags,
    sector: primary?.name ?? UNCATEGORIZED_SECTOR,
    primary_circle_tag_id: person.primary_circle_tag_id,
  };
}

async function loadAll(ctx: ServiceContext): Promise<PersonWithTags[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.select().from(people).where(eq(people.owner_id, ctx.userId)).orderBy(desc(people.updated_at));
    return attachTags(rows, tx);
  });
}

function distinctSkills(list: MapPerson[]): string[] {
  const set = new Set<string>();
  for (const p of list) for (const t of p.tags) if (t.kind !== "circle") set.add(t.name);
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function getRadialMapData(ctx: ServiceContext): Promise<RadialMapData> {
  const all = (await loadAll(ctx)).map(toMapPerson);
  const layout = layoutRadial(
    all.map((p) => ({ id: p.id, tier: p.tier, sector: p.sector, last_contact_at: p.last_contact_at })),
  );
  const locations = [...new Set(all.map((p) => p.location).filter((l): l is string => Boolean(l)))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  return { people: all, layout, skills: distinctSkills(all), locations };
}

export function clusterKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

export async function getGeoMapData(ctx: ServiceContext): Promise<GeoMapData> {
  const rows = await loadAll(ctx);
  const all = rows.map((r) => ({ row: r, person: toMapPerson(r) }));

  type WorkingCluster = GeoCluster & { labels: Map<string, number> };
  const clusters = new Map<string, WorkingCluster>();
  const unlocated: GeoMapData["unlocated"] = [];
  let noLocation = 0;

  for (const { row, person } of all) {
    if (row.lat != null && row.lng != null) {
      const key = clusterKey(row.lat, row.lng);
      const cluster: WorkingCluster =
        clusters.get(key) ?? { key, lat: row.lat, lng: row.lng, label: "", people: [], labels: new Map<string, number>() };
      cluster.people.push(person);
      const cityName = geocode(row.location)?.city.name ?? row.location ?? "";
      if (cityName) cluster.labels.set(cityName, (cluster.labels.get(cityName) ?? 0) + 1);
      clusters.set(key, cluster);
    } else if (row.location) {
      unlocated.push({ id: person.id, name: person.name, tier: person.tier, location: row.location });
    } else {
      noLocation++;
    }
  }

  const list: GeoCluster[] = [...clusters.values()]
    .map(({ labels, ...c }) => {
      const best = [...labels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return { ...c, label: best ?? `${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}` };
    })
    .sort((a, b) => b.people.length - a.people.length || a.label.localeCompare(b.label, "zh-CN"));

  return {
    clusters: list,
    unlocated,
    no_location_count: noLocation,
    located_count: list.reduce((n, c) => n + c.people.length, 0),
    skills: distinctSkills(all.map((x) => x.person)),
  };
}
