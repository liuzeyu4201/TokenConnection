import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";

import { GeoMap } from "@/components/map/geo-map";
import { RadialMap } from "@/components/map/radial-map";
import { TierBadge } from "@/components/tier-badge";
import { getGeoMapData, getRadialMapData } from "@/lib/services/map";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "地图" };

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const raw = await searchParams;
  const view = (Array.isArray(raw.view) ? raw.view[0] : raw.view) === "geo" ? "geo" : "radial";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">地图</h1>
          <p className="text-sm text-muted-foreground">
            {view === "radial" ? "圆心是我，五个环从内到外由近及远，扇区按主圈子划分。" : "按所在地聚合，气泡越大人越多。"}
          </p>
        </div>
        <div className="inline-flex rounded-lg border p-0.5 text-sm">
          <Link href="/map" className={cn("rounded-md px-3 py-1.5 text-muted-foreground", view === "radial" && "bg-primary text-primary-foreground")}>
            同心圆
          </Link>
          <Link href="/map?view=geo" className={cn("rounded-md px-3 py-1.5 text-muted-foreground", view === "geo" && "bg-primary text-primary-foreground")}>
            地理
          </Link>
        </div>
      </div>

      {view === "radial" ? <RadialMap data={await getRadialMapData()} /> : <GeoSection />}
    </div>
  );
}

async function GeoSection() {
  const data = await getGeoMapData();
  return (
    <div className="space-y-6">
      <GeoMap data={data} />

      <section className="space-y-2">
        <h2 className="flex items-baseline justify-between text-sm font-semibold">
          未定位 <span className="text-xs font-normal text-muted-foreground">{data.unlocated.length} 人</span>
        </h2>
        {data.unlocated.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            填了所在地的人都已定位。
            {data.no_location_count > 0 ? ` 另有 ${data.no_location_count} 人没有填所在地，不计入未定位。` : ""}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              所在地写法离线城市表认不出来。点进详情把所在地改成城市名，或在编辑里手动填坐标 / 选一个城市。
              {data.no_location_count > 0 ? ` 另有 ${data.no_location_count} 人没有填所在地，不计入。` : ""}
            </p>
            <ul className="divide-y rounded-xl border bg-card">
              {data.unlocated.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link href={`/people/${p.id}`} className="text-sm font-medium hover:underline">
                      {p.name}
                    </Link>
                    <TierBadge tier={p.tier} />
                    <span className="text-xs text-muted-foreground">所在地：{p.location}</span>
                  </div>
                  <Link href={`/people/${p.id}?edit=geo`} className="shrink-0 text-xs underline-offset-2 hover:underline">
                    去修复 →
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
