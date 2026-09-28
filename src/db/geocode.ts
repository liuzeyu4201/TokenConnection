import { loadDotEnv } from "./load-env";

loadDotEnv();

/**
 * Backfill coordinates for people that have a location but no lat/lng and
 * were not pinned by hand (design.md §14.2). Fully offline.
 *
 *   pnpm db:geocode            # only people without coordinates
 *   pnpm db:geocode --all      # re-geocode everyone with geo_manual = false
 */
async function main() {
  const all = process.argv.includes("--all");
  const { and, eq, isNotNull, isNull } = await import("drizzle-orm");
  const { closeDb, getDb } = await import("./index");
  const { people } = await import("./schema");
  const { geocode } = await import("@/lib/geo/geocode");

  const db = getDb();
  const rows = await db
    .select({ id: people.id, name: people.name, location: people.location })
    .from(people)
    .where(and(eq(people.geo_manual, false), isNotNull(people.location), all ? undefined : isNull(people.lat)));

  let located = 0;
  const misses: string[] = [];
  for (const row of rows) {
    const hit = geocode(row.location);
    if (!hit) {
      misses.push(`${row.name}（${row.location}）`);
      continue;
    }
    await db.update(people).set({ lat: hit.lat, lng: hit.lng }).where(eq(people.id, row.id));
    located++;
  }
  console.log(`候选 ${rows.length} 人：已定位 ${located}，未匹配 ${misses.length}。`);
  if (misses.length > 0) console.log("未匹配（请在详情页手动填写坐标或修正所在地）：\n  " + misses.join("\n  "));
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
