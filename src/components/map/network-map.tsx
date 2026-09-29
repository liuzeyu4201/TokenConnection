"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3";

import { EmptyState } from "@/components/empty-state";
import { FilterCombobox } from "@/components/filter-combobox";
import { Button } from "@/components/ui/button";
import { UNCATEGORIZED_SECTOR } from "@/lib/map/primary-circle";
import { TIER_LABEL, type Tier } from "@/lib/schemas/enums";
import type { ApiMapPerson, ApiRadialMap } from "@/lib/types";

import { PersonPopover } from "./person-popover";

const TIER_COLOR: Record<Tier, string> = {
  best_bros: "#e11d48",
  close_friends: "#ea580c",
  friends: "#d97706",
  interacted: "#0284c7",
  known_of: "#64748b",
};

type GraphNode = SimulationNodeDatum & { id: string };
type GraphLink = { source: string; target: string };

function buildLinks(people: ApiMapPerson[]): GraphLink[] {
  const links: GraphLink[] = [];
  const groups = new Map<string, string[]>();
  for (const person of people) {
    if (!person.sector || person.sector === UNCATEGORIZED_SECTOR) continue;
    const list = groups.get(person.sector) ?? [];
    list.push(person.id);
    groups.set(person.sector, list);
  }
  for (const ids of groups.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        links.push({ source: ids[i], target: ids[j] });
      }
    }
  }
  return links;
}

const HALF_WIDTH = 300;
const HALF_HEIGHT = 220;
const FIT_X = 262;
const FIT_Y = 182;
const MAX_SCALE = 1.3;
const CENTER_ID = "__center__";
const CENTER_RADIUS = 8;
const RING_COUNT = 4;

/** Settles synchronously so server and client render the same positions; the center stays at the origin and the graph only shrinks when it overflows. */
function computeLayout(people: ApiMapPerson[]): GraphNode[] {
  if (people.length === 0) return [];
  const graphNodes: GraphNode[] = [{ id: CENTER_ID, fx: 0, fy: 0 }, ...people.map((person) => ({ id: person.id }))];
  const simulation = forceSimulation(graphNodes)
    .force(
      "link",
      forceLink<GraphNode, GraphLink>(buildLinks(people))
        .id((node) => node.id)
        .distance(56)
        .strength(0.35),
    )
    .force("charge", forceManyBody().strength(-60))
    .force("x", forceX(0).strength(0.08))
    .force("y", forceY(0).strength(0.08))
    .force("collide", forceCollide(24))
    .stop();
  simulation.tick(300);

  const personNodes = graphNodes.slice(1);
  const halfW = Math.max(...personNodes.map((node) => Math.abs(node.x ?? 0)), 1);
  const halfH = Math.max(...personNodes.map((node) => Math.abs(node.y ?? 0)), 1);
  const scale = Math.min(FIT_X / halfW, FIT_Y / halfH, MAX_SCALE);
  // Server and browser floats drift in the last digits; round so hydration matches.
  const round = (value: number) => Math.round(value * 10) / 10;
  return personNodes.map((node) => ({
    id: node.id,
    x: round((node.x ?? 0) * scale),
    y: round((node.y ?? 0) * scale),
  }));
}

/**
 * People are nodes. An edge means the two people share one circle.
 * Uncategorized people stay visible and unlinked.
 */
export function NetworkMap({ data }: { data: ApiRadialMap }) {
  const router = useRouter();
  const [circle, setCircle] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const peopleById = React.useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const circles = React.useMemo(() => {
    const names = new Set(data.people.map((p) => p.sector).filter((name) => name && name !== UNCATEGORIZED_SECTOR));
    return [...names].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [data.people]);

  const visiblePeople = React.useMemo(
    () => data.people.filter((person) => (!circle || person.sector === circle) && (!location || person.location === location)),
    [data.people, circle, location],
  );
  const selected = visiblePeople.find((person) => person.id === selectedId) ?? null;
  const visibleCount = visiblePeople.length;
  const hasFilter = Boolean(circle || location);
  const layout = React.useMemo(() => computeLayout(visiblePeople), [visiblePeople]);

  const popoverRef = React.useRef<HTMLDivElement>(null);
  const popoverOpen = Boolean(selected);
  React.useEffect(() => {
    if (!popoverOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || popoverRef.current?.contains(target)) return;
      // Nodes handle their own toggle / switch in onClick.
      if (target.closest("[data-network-node]")) return;
      setSelectedId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [popoverOpen]);

  if (data.people.length === 0) {
    return <EmptyState>还没有人。先在首页记几个人，地图就会出现。</EmptyState>;
  }

  const nodeById = new Map(layout.map((node) => [node.id, node]));
  const links = buildLinks(visiblePeople);
  const outerRadius = Math.min(Math.max(...layout.map((node) => Math.hypot(node.x ?? 0, node.y ?? 0)), 60) + 16, HALF_HEIGHT - 4);
  const rings = Array.from({ length: RING_COUNT }, (_, i) => Math.round((outerRadius * (i + 1)) / RING_COUNT));

  return (
    <div className="relative">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <FilterCombobox
          value={circle}
          onValueChange={setCircle}
          allLabel="全部圈子"
          aria-label="按圈子筛选"
          options={circles.map((name) => ({ value: name, label: name }))}
        />
        <FilterCombobox
          value={location}
          onValueChange={setLocation}
          allLabel="全部所在地"
          aria-label="按所在地筛选"
          options={data.locations.map((item) => ({ value: item, label: item }))}
        />
        <div className="col-span-2 flex items-center justify-between gap-2 text-xs text-muted-foreground sm:col-span-1 sm:justify-end">
          {hasFilter ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setCircle("");
                setLocation("");
              }}
            >
              清除筛选
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {(["best_bros", "close_friends", "friends", "interacted", "known_of"] as Tier[]).map((tier) => (
          <span key={tier} className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ backgroundColor: TIER_COLOR[tier] }} />
            {TIER_LABEL[tier]}
          </span>
        ))}
      </div>

      {hasFilter && visibleCount === 0 ? (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          没有人同时满足这些条件，换个圈子或所在地试试。
        </p>
      ) : null}

      <svg
        viewBox={`${-HALF_WIDTH} ${-HALF_HEIGHT} ${HALF_WIDTH * 2} ${HALF_HEIGHT * 2}`}
        className="mx-auto block h-auto w-full max-w-[960px] bg-transparent select-none"
        role="img"
        aria-label="人脉关系网"
      >
        <g>
          {rings.map((radius) => (
            <circle key={radius} r={radius} fill="none" stroke="#cbd5e1" strokeWidth={0.6} strokeDasharray="3 3" />
          ))}
          {layout.map((node) => (
            <line key={`spoke-${node.id}`} x1={0} y1={0} x2={node.x} y2={node.y} stroke="#e2e8f0" strokeWidth={0.8} />
          ))}
          <circle r={CENTER_RADIUS} fill="#0f172a" stroke="#ffffff" strokeWidth={2} aria-hidden />
          {links.map((link) => {
            const source = nodeById.get(link.source);
            const target = nodeById.get(link.target);
            if (!source || !target) return null;
            return (
              <line
                key={`${link.source}-${link.target}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="#64748b"
                strokeWidth={0.6}
                strokeDasharray="3 2"
              />
            );
          })}
          {layout.map((node) => {
            const person = peopleById.get(node.id);
            if (!person) return null;
            const active = node.id === selectedId;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                className="cursor-pointer"
                data-network-node=""
                onClick={() => setSelectedId(active ? null : node.id)}
                role="button"
                aria-label={person.name}
              >
                <circle r={18} fill="transparent" />
                <circle r={active ? 6 : 4.5} fill={TIER_COLOR[person.tier]} stroke="#ffffff" strokeWidth={2} />
                <text
                  y={-10}
                  textAnchor="middle"
                  fontSize={11}
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

      <div ref={popoverRef} className="contents">
        {selected ? <PersonPopover person={selected} onClose={() => setSelectedId(null)} onAppended={() => router.refresh()} /> : null}
      </div>
    </div>
  );
}
