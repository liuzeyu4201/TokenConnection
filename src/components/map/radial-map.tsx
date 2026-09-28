"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { select, zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from "d3";

import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { TIER_LABEL, type Tier } from "@/lib/schemas/enums";
import type { ApiMapPerson, ApiRadialMap } from "@/lib/types";

import { PersonPopover } from "./person-popover";

/** Pixel radius of the outermost ring in viewBox units. */
const R = 300;
const PAD = 70;
const TWO_PI = Math.PI * 2;

const TIER_COLOR: Record<Tier, string> = {
  best_bros: "#e11d48",
  close_friends: "#ea580c",
  friends: "#d97706",
  interacted: "#0284c7",
  known_of: "#64748b",
};

const SECTOR_FILLS = ["#f8fafc", "#f1f5f9"];

/** Round SVG numbers so server and browser float differences never break hydration. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function polar(angle: number, radius: number): [number, number] {
  return [r3(Math.cos(angle) * radius), r3(Math.sin(angle) * radius)];
}

function wedgePath(start: number, end: number, radius: number): string {
  const a0 = start - Math.PI / 2;
  const a1 = end - Math.PI / 2;
  const [x0, y0] = polar(a0, radius);
  const [x1, y1] = polar(a1, radius);
  const large = end - start > Math.PI ? 1 : 0;
  return `M0,0 L${x0},${y0} A${radius},${radius} 0 ${large} 1 ${x1},${y1} Z`;
}

/**
 * Concentric-ring map (design.md §14.1). Layout comes precomputed from the
 * server (pure function, deterministic); this component only draws, filters,
 * zooms and handles clicks.
 */
export function RadialMap({ data }: { data: ApiRadialMap }) {
  const router = useRouter();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [transform, setTransform] = React.useState<ZoomTransform>(() => zoomIdentity);
  // Text/point sizes are in viewBox units; scale them up when the SVG is drawn small (phones).
  const [fs, setFs] = React.useState(1);
  const [skill, setSkill] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const peopleById = React.useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const selected = selectedId ? peopleById.get(selectedId) ?? null : null;

  const matches = React.useCallback(
    (person: ApiMapPerson) =>
      (!skill || person.tags.some((t) => t.kind === "skill" && t.name === skill)) &&
      (!location || person.location === location),
    [skill, location],
  );
  const visibleCount = data.people.filter(matches).length;
  const hasFilter = Boolean(skill || location);

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width || svg.clientWidth;
      if (width > 0) setFs(Math.min(2.2, Math.max(1, ((R + PAD) * 2) / width)));
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 6])
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

  if (data.people.length === 0) {
    return <EmptyState>还没有人。先在首页记几个人，地图就会出现。</EmptyState>;
  }

  const { rings, sectors, points } = data.layout;
  const viewSize = (R + PAD) * 2;

  return (
    <div className="relative">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <NativeSelect value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="按能力筛选">
          <option value="">全部能力</option>
          {data.skills.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={location} onChange={(e) => setLocation(e.target.value)} aria-label="按所在地筛选">
          <option value="">全部所在地</option>
          {data.locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </NativeSelect>
        <div className="col-span-2 flex items-center justify-between gap-2 text-xs text-muted-foreground sm:col-span-1 sm:justify-end">
          <span>
            {hasFilter ? `${visibleCount} / ${data.people.length} 人` : `${data.people.length} 人 · ${sectors.length} 个圈子`}
          </span>
          <div className="flex gap-1">
            {hasFilter ? (
              <Button variant="ghost" size="xs" onClick={() => { setSkill(""); setLocation(""); }}>
                清除筛选
              </Button>
            ) : null}
            <Button variant="ghost" size="xs" onClick={resetZoom}>
              复位
            </Button>
          </div>
        </div>
      </div>

      {/* Ring legend, inner → outer (kept out of the SVG so it never collides with points) */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>由内向外：</span>
        {rings.map((ring) => (
          <span key={ring.tier} className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ backgroundColor: TIER_COLOR[ring.tier] }} />
            {TIER_LABEL[ring.tier]}
          </span>
        ))}
      </div>

      {hasFilter && visibleCount === 0 ? (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          没有人同时满足这些条件；被筛掉的人在图上变淡而不消失。
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-card">
        <svg
          ref={svgRef}
          viewBox={`${-R - PAD} ${-R - PAD} ${viewSize} ${viewSize}`}
          className="block h-auto w-full touch-none select-none"
          style={{ maxHeight: "78vh" }}
          role="img"
          aria-label="人脉同心圆地图"
        >
          <g transform={transform.toString()}>
            {/* Sector wedges */}
            {sectors.map((s, i) => (
              <path key={s.name} d={wedgePath(s.startAngle, s.endAngle, R + 20)} fill={SECTOR_FILLS[i % 2]} stroke="none" />
            ))}
            {/* Sector boundaries */}
            {sectors.length > 1
              ? sectors.map((s) => {
                  const [x, y] = polar(s.startAngle - Math.PI / 2, R + 20);
                  return <line key={`b-${s.name}`} x1={0} y1={0} x2={x} y2={y} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 4" />;
                })
              : null}
            {/* Rings */}
            {rings.map((ring) => (
              <circle key={ring.tier} r={r3(ring.radius * R)} fill="none" stroke="#cbd5e1" strokeWidth={1} />
            ))}
            {/* Sector labels */}
            {sectors.map((s) => {
              const mid = (s.startAngle + s.endAngle) / 2 - Math.PI / 2;
              const [x, y] = polar(mid, R + 42);
              const anchor = Math.abs(Math.cos(mid)) < 0.2 ? "middle" : Math.cos(mid) > 0 ? "start" : "end";
              return (
                <text key={`s-${s.name}`} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontSize={r3(12 * fs)} fill="#334155" fontWeight={600}>
                  {s.name} <tspan fill="#94a3b8" fontWeight={400}>{s.count}</tspan>
                </text>
              );
            })}
            {/* Me */}
            <circle r={r3(9 * fs)} fill="#0f172a" />
            <text y={r3(26 * fs)} textAnchor="middle" fontSize={r3(11 * fs)} fill="#0f172a" fontWeight={600}>
              我
            </text>
            {/* People */}
            {points.map((pt) => {
              const person = peopleById.get(pt.id);
              if (!person) return null;
              const dim = hasFilter && !matches(person);
              const active = pt.id === selectedId;
              const x = r3(pt.x * R);
              const y = r3(pt.y * R);
              return (
                <g
                  key={pt.id}
                  transform={`translate(${x}, ${y})`}
                  opacity={dim ? 0.15 : 1}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(active ? null : pt.id)}
                  role="button"
                  aria-label={person.name}
                >
                  <circle r={r3(16 * fs)} fill="transparent" />
                  <circle r={r3((active ? 9 : 6.5) * fs)} fill={TIER_COLOR[pt.tier]} stroke="#ffffff" strokeWidth={2} />
                  <text
                    y={r3(-11 * fs)}
                    textAnchor="middle"
                    fontSize={r3(10.5 * fs)}
                    fill="#0f172a"
                    fontWeight={active ? 700 : 500}
                    style={{ paintOrder: "stroke", stroke: "#ffffff", strokeWidth: 3, strokeLinejoin: "round" }}
                  >
                    {person.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        拖动平移、滚轮或双指缩放；点一个点查看并追加。圈心是我，越靠内关系越近；扇区按主圈子划分。
      </p>

      {selected ? (
        <PersonPopover person={selected} onClose={() => setSelectedId(null)} onAppended={() => router.refresh()} />
      ) : null}
    </div>
  );
}

export { TIER_COLOR };
export const FULL_CIRCLE = TWO_PI;
