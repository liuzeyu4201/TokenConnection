"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { geoMercator, geoPath, select, zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from "d3";
import type { FeatureCollection, Geometry } from "geojson";
import china from "@/lib/geo/china-provinces.json";

import { EmptyState } from "@/components/empty-state";
import { FilterCombobox } from "@/components/filter-combobox";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { TIER_LABEL, TIER_VALUES, type Tier } from "@/lib/schemas/enums";
import type { ApiGeoCluster, ApiGeoMap, ApiMapPerson } from "@/lib/types";

import { PersonPopover } from "./person-popover";

const WIDTH = 900;
const HEIGHT = 640;

// Offline province boundaries (Aliyun DataV geoatlas 100000_full): 34 provincial units.
const PROVINCES = china as FeatureCollection<Geometry>;

/**
 * Server (Node) and browser V8 can differ in the last float digit of trig/log
 * results, which would break hydration; round everything we print into SVG.
 */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function bubbleRadius(count: number): number {
  return 7 + Math.sqrt(count) * 6;
}

type LayoutNode = { key: string; x: number; y: number; r: number; label: string };

/**
 * Pushes overlapping bubbles apart in screen pixels. Each node's box covers
 * the circle plus its label underneath; overlapping pairs are separated along
 * the line between their true points until the boxes clear. Returns screen
 * offsets per key.
 */
function separateBubbles(nodes: LayoutNode[], fs: number): Map<string, { dx: number; dy: number }> {
  const pad = 3;
  const labelGap = 12 * fs;
  const labelH = 13 * fs;
  const boxes = nodes.map((n) => {
    const w = Math.max(2 * n.r, n.label.length * 11 * fs + 6) + pad;
    const top = -n.r;
    const bottom = n.r + labelGap + labelH / 2;
    return { n, hw: w / 2, hh: (bottom - top + pad) / 2, cy: (top + bottom) / 2, x: n.x, y: n.y };
  });
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const dx = b.x - a.x;
        const dy = b.y + b.cy - (a.y + a.cy);
        const needX = a.hw + b.hw - Math.abs(dx);
        const needY = a.hh + b.hh - Math.abs(dy);
        if (needX <= 0 || needY <= 0) continue;
        let ux = b.n.x - a.n.x;
        let uy = b.n.y - a.n.y;
        const len = Math.hypot(ux, uy);
        if (len < 1e-6) {
          ux = 1;
          uy = 0;
        } else {
          ux /= len;
          uy /= len;
        }
        const sx = Math.abs(ux) > 1e-6 ? needX / Math.abs(ux) : Infinity;
        const sy = Math.abs(uy) > 1e-6 ? needY / Math.abs(uy) : Infinity;
        const s = Math.min(sx, sy) + 0.5;
        // Larger bubbles hold their ground; smaller ones move more.
        const wa = b.n.r / (a.n.r + b.n.r);
        a.x -= ux * s * wa;
        a.y -= uy * s * wa;
        b.x += ux * s * (1 - wa);
        b.y += uy * s * (1 - wa);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return new Map(boxes.map((b) => [b.n.key, { dx: b.x - b.n.x, dy: b.y - b.n.y }]));
}

/**
 * Geographic map: offline China province outlines + one bubble per
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
    (p: ApiMapPerson) => (!tier || p.tier === tier) && (!skill || p.tags.some((t) => t.kind !== "circle" && t.name === skill)),
    [tier, skill],
  );
  const hasFilter = Boolean(tier || skill);

  // Always frame the whole country so the basemap stays China, not a crop around people.
  const projection = React.useMemo(() => {
    const proj = geoMercator();
    proj.fitExtent(
      [
        [16, 16],
        [WIDTH - 16, height - 16],
      ],
      PROVINCES,
    );
    return proj;
  }, [height]);

  const path = React.useMemo(() => geoPath(projection), [projection]);
  const provincePaths = React.useMemo(
    () =>
      PROVINCES.features.map((f, i) => ({
        key: String((f.properties as { adcode?: number } | null)?.adcode ?? i),
        d: path(f) ?? "",
      })),
    [path],
  );

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

  const layerRef = React.useRef<HTMLDivElement>(null);
  const layerOpen = Boolean(openKey || selectedPerson);
  React.useEffect(() => {
    if (!layerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || layerRef.current?.contains(target)) return;
      // Bubbles handle their own toggle / switch in onClick.
      if (target.closest("[data-geo-bubble]")) return;
      if (selectedPerson) setSelectedPerson(null);
      else setOpenKey(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [layerOpen, selectedPerson]);

  const resetZoom = () => {
    if (!svgRef.current) return;
    select(svgRef.current).call(zoom<SVGSVGElement, unknown>().transform, zoomIdentity);
    setTransform(zoomIdentity);
  };

  const clusters = data.clusters.map((c) => ({ ...c, visible: c.people.filter(matches) }));
  const open = openKey ? clusters.find((c) => c.key === openKey) ?? null : null;
  const visibleTotal = clusters.reduce((n, c) => n + c.visible.length, 0);
  const k = transform.k;

  const offsets = separateBubbles(
    clusters.map((c) => {
      const [px, py] = projection([c.lng, c.lat]) ?? [0, 0];
      const count = hasFilter ? c.visible.length : c.people.length;
      return { key: c.key, x: px * k, y: py * k, r: bubbleRadius(Math.max(count, 1)) * fs, label: c.label };
    }),
    fs,
  );

  return (
    <div className="relative">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <FilterCombobox
          value={tier}
          onValueChange={(v) => setTier(v as "" | Tier)}
          allLabel="全部关系"
          aria-label="按关系筛选"
          options={TIER_VALUES.map((t) => ({ value: t, label: TIER_LABEL[t] }))}
        />
        <FilterCombobox
          value={skill}
          onValueChange={setSkill}
          allLabel="全部标签"
          aria-label="按能力筛选"
          options={data.skills.map((s) => ({ value: s, label: s }))}
        />
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

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="block h-auto w-full touch-none bg-[#eef4fb] select-none"
        style={{ maxHeight: "72vh" }}
        role="img"
        aria-label="人脉地理地图"
      >
          <g transform={transform.toString()}>
            {provincePaths.map((c) => (
              <path key={c.key} d={c.d} fill="#ffffff" stroke="#94a3b8" strokeWidth={0.7 / k} />
            ))}
            {clusters.map((c) => {
              const off = offsets.get(c.key);
              if (!off || Math.hypot(off.dx, off.dy) < 1) return null;
              const [px, py] = projection([c.lng, c.lat]) ?? [0, 0];
              const dim = hasFilter && c.visible.length === 0;
              return (
                <g key={`tie-${c.key}`} opacity={dim ? 0.2 : 1} pointerEvents="none">
                  <line
                    x1={r3(px)}
                    y1={r3(py)}
                    x2={r3(px + off.dx / k)}
                    y2={r3(py + off.dy / k)}
                    stroke="#e11d48"
                    strokeOpacity={0.7}
                    strokeWidth={r3(1.2 / k)}
                  />
                  <circle cx={r3(px)} cy={r3(py)} r={r3(2.5 / k)} fill="#e11d48" stroke="#ffffff" strokeWidth={r3(1 / k)} />
                </g>
              );
            })}
            {clusters
              .slice()
              .sort((a, b) => b.people.length - a.people.length)
              .map((c) => {
                const [px, py] = projection([c.lng, c.lat]) ?? [0, 0];
                const off = offsets.get(c.key) ?? { dx: 0, dy: 0 };
                const x = r3(px + off.dx / k);
                const y = r3(py + off.dy / k);
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
                    data-geo-bubble=""
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
      <p className="mt-2 text-[11px] text-muted-foreground">
        底图为中国省级边界；气泡大小按人数，点开列出这些人。拖动平移、滚轮或双指缩放。
      </p>

      <div ref={layerRef} className="contents">
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
