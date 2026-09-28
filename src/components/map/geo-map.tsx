"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { geoMercator, geoPath, select, zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from "d3";
import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/countries-110m.json";

import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { TIER_LABEL, TIER_VALUES, type Tier } from "@/lib/schemas/enums";
import type { ApiGeoCluster, ApiGeoMap, ApiMapPerson } from "@/lib/types";

import { PersonPopover } from "./person-popover";

const WIDTH = 900;
const HEIGHT = 560;
/** Default viewport when nobody is located: mainland China. */
const CHINA_BOUNDS: [[number, number], [number, number]] = [
  [73, 18],
  [135, 54],
];

// world-atlas 110m countries, converted once at module load (offline, ~110 KB).
const topology = world as unknown as Topology<{ countries: GeometryCollection }>;
const COUNTRIES = feature(topology, topology.objects.countries) as FeatureCollection<Geometry>;

/**
 * Server (Node) and browser V8 can differ in the last float digit of trig/log
 * results, which would break hydration; round everything we print into SVG.
 */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function bubbleRadius(count: number): number {
  return 7 + Math.sqrt(count) * 6;
}

/**
 * Geographic map (design.md §14.2): offline world outline + one bubble per
 * city; bubble size = head count. Click a bubble to list its people.
 */
export function GeoMap({ data }: { data: ApiGeoMap }) {
  const router = useRouter();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [transform, setTransform] = React.useState<ZoomTransform>(() => zoomIdentity);
  const [fs, setFs] = React.useState(1);
  // Phones get a squarer canvas so China (and the bubbles) are not squeezed into a wide strip.
  const [height, setHeight] = React.useState(HEIGHT);
  const [tier, setTier] = React.useState<"" | Tier>("");
  const [skill, setSkill] = React.useState("");
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = React.useState<ApiMapPerson | null>(null);

  const matches = React.useCallback(
    (p: ApiMapPerson) => (!tier || p.tier === tier) && (!skill || p.tags.some((t) => t.kind === "skill" && t.name === skill)),
    [tier, skill],
  );
  const hasFilter = Boolean(tier || skill);

  // Projection fitted to all located people (or China when there is nobody).
  const projection = React.useMemo(() => {
    const proj = geoMercator();
    const pts = data.clusters.map((c) => [c.lng, c.lat] as [number, number]);
    const bounds: [[number, number], [number, number]] =
      pts.length > 0
        ? [
            [Math.min(...pts.map((p) => p[0])) - 3, Math.min(...pts.map((p) => p[1])) - 3],
            [Math.max(...pts.map((p) => p[0])) + 3, Math.max(...pts.map((p) => p[1])) + 3],
          ]
        : CHINA_BOUNDS;
    // Guarantee a sensible minimum span so a single city does not zoom to street level.
    const minSpan = 12;
    if (bounds[1][0] - bounds[0][0] < minSpan) {
      const cx = (bounds[0][0] + bounds[1][0]) / 2;
      bounds[0][0] = cx - minSpan / 2;
      bounds[1][0] = cx + minSpan / 2;
    }
    if (bounds[1][1] - bounds[0][1] < minSpan * 0.6) {
      const cy = (bounds[0][1] + bounds[1][1]) / 2;
      bounds[0][1] = cy - (minSpan * 0.6) / 2;
      bounds[1][1] = cy + (minSpan * 0.6) / 2;
    }
    const box: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            // d3-geo needs clockwise exterior rings; counter-clockwise would mean "the rest of the sphere".
            coordinates: [[bounds[0], [bounds[0][0], bounds[1][1]], bounds[1], [bounds[1][0], bounds[0][1]], bounds[0]]],
          },
        },
      ],
    };
    proj.fitExtent([[24, 24], [WIDTH - 24, height - 24]], box);
    return proj;
  }, [data.clusters, height]);

  const path = React.useMemo(() => geoPath(projection), [projection]);
  const countryPaths = React.useMemo(() => COUNTRIES.features.map((f, i) => ({ key: i, d: path(f) ?? "" })), [path]);

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width || svg.clientWidth;
      if (width > 0) {
        setFs(Math.min(1.8, Math.max(1, WIDTH / width)));
        setHeight(width < 640 ? Math.round(WIDTH * 1.05) : HEIGHT);
      }
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.7, 12])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => setTransform(event.transform));
    const selection = select(svg);
    selection.call(behavior);
    return () => {
      selection.on(".zoom", null);
    };
  }, []);

  const resetZoom = () => {
    if (!svgRef.current) return;
    select(svgRef.current).call(zoom<SVGSVGElement, unknown>().transform, zoomIdentity);
    setTransform(zoomIdentity);
  };

  const clusters = data.clusters.map((c) => ({ ...c, visible: c.people.filter(matches) }));
  const open = openKey ? clusters.find((c) => c.key === openKey) ?? null : null;
  const visibleTotal = clusters.reduce((n, c) => n + c.visible.length, 0);
  const k = transform.k;

  return (
    <div className="relative">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <NativeSelect value={tier} onChange={(e) => setTier(e.target.value as "" | Tier)} aria-label="按关系筛选">
          <option value="">全部关系</option>
          {TIER_VALUES.map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="按能力筛选">
          <option value="">全部能力</option>
          {data.skills.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <div className="col-span-2 flex items-center justify-between gap-2 text-xs text-muted-foreground sm:col-span-1 sm:justify-end">
          <span>
            {hasFilter ? `${visibleTotal} / ${data.located_count} 人` : `${data.located_count} 人 · ${data.clusters.length} 个城市`}
          </span>
          <div className="flex gap-1">
            {hasFilter ? (
              <Button variant="ghost" size="xs" onClick={() => { setTier(""); setSkill(""); }}>
                清除筛选
              </Button>
            ) : null}
            <Button variant="ghost" size="xs" onClick={resetZoom}>
              复位
            </Button>
          </div>
        </div>
      </div>

      {data.clusters.length === 0 ? (
        <EmptyState>
          还没有人能放到地图上。给人填上所在地（城市名）就会自动定位；已有的人可以运行{" "}
          <code className="rounded bg-muted px-1">pnpm db:geocode</code> 回填。
        </EmptyState>
      ) : hasFilter && visibleTotal === 0 ? (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          没有人满足这些条件；气泡变淡而不消失。
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-[#eef4fb]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="block h-auto w-full touch-none select-none"
          style={{ maxHeight: "72vh" }}
          role="img"
          aria-label="人脉地理地图"
        >
          <g transform={transform.toString()}>
            {countryPaths.map((c) => (
              <path key={c.key} d={c.d} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.8 / k} />
            ))}
            {clusters
              .slice()
              .sort((a, b) => b.people.length - a.people.length)
              .map((c) => {
                const [px, py] = projection([c.lng, c.lat]) ?? [0, 0];
                const x = r3(px);
                const y = r3(py);
                const count = hasFilter ? c.visible.length : c.people.length;
                const dim = hasFilter && count === 0;
                const r = r3((bubbleRadius(Math.max(count, 1)) * fs) / k);
                const active = c.key === openKey;
                return (
                  <g
                    key={c.key}
                    transform={`translate(${x}, ${y})`}
                    opacity={dim ? 0.2 : 1}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedPerson(null);
                      setOpenKey(active ? null : c.key);
                    }}
                    role="button"
                    aria-label={`${c.label} ${count} 人`}
                  >
                    <circle r={r3(Math.max(r, (14 * fs) / k))} fill="transparent" />
                    <circle r={r} fill={active ? "#0f172a" : "#e11d48"} fillOpacity={0.85} stroke="#ffffff" strokeWidth={r3(2 / k)} />
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={r3((11 * fs) / k)} fill="#ffffff" fontWeight={700}>
                      {count}
                    </text>
                    <text
                      y={r3(r + (12 * fs) / k)}
                      textAnchor="middle"
                      fontSize={r3((11 * fs) / k)}
                      fill="#0f172a"
                      fontWeight={600}
                      style={{ paintOrder: "stroke", stroke: "#ffffff", strokeWidth: r3(3 / k), strokeLinejoin: "round" }}
                    >
                      {c.label}
                    </text>
                  </g>
                );
              })}
          </g>
        </svg>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        底图为离线 world-atlas 110m 国界；气泡大小按人数，点开列出这些人。拖动平移、滚轮或双指缩放。
      </p>

      {open && !selectedPerson ? (
        <ClusterPanel cluster={open} people={hasFilter ? open.visible : open.people} onClose={() => setOpenKey(null)} onPick={setSelectedPerson} />
      ) : null}
      {selectedPerson ? (
        <PersonPopover
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onAppended={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

function ClusterPanel({
  cluster,
  people,
  onClose,
  onPick,
}: {
  cluster: ApiGeoCluster;
  people: ApiMapPerson[];
  onClose: () => void;
  onPick: (person: ApiMapPerson) => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 max-h-[60vh] overflow-y-auto rounded-t-2xl border-t bg-card shadow-lg md:absolute md:inset-auto md:top-3 md:right-3 md:bottom-auto md:w-80 md:rounded-xl md:border md:shadow-md">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="text-sm font-semibold">
          {cluster.label} <span className="font-normal text-muted-foreground">{people.length} 人</span>
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          关闭
        </Button>
      </div>
      {people.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">当前筛选下这里没有人。</p>
      ) : (
        <ul className="divide-y border-t">
          {people.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onPick(p)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  <TierBadge tier={p.tier} />
                </div>
                {p.summary ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.summary}</p> : null}
              </button>
              <Link href={`/people/${p.id}`} className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline">
                详情
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
