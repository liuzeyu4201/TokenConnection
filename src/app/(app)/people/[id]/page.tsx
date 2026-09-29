import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin } from "lucide-react";

import { AppendInput } from "@/components/append-input";
import { PersonEditForm } from "@/components/person-edit-form";
import { CircleField } from "@/components/primary-circle-picker";
import { TagChip } from "@/components/tag-chip";
import { TierBadge } from "@/components/tier-badge";
import { Timeline } from "@/components/timeline";
import { contactLabel, formatDate, formatDay, formatRelative } from "@/lib/format";
import { ApiError } from "@/lib/api/errors";
import { GENDER_LABEL } from "@/lib/schemas/enums";
import type { ApiEvent } from "@/lib/types";
import { getPersonDetail, type PersonDetail } from "@/lib/services/people";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadPerson(id: string): Promise<PersonDetail | null> {
  if (!UUID_RE.test(id)) return null;
  try {
    return await getPersonDetail(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps<"/people/[id]">): Promise<Metadata> {
  const { id } = await params;
  const person = await loadPerson(id);
  return { title: person?.name ?? "未找到" };
}

function timelineEvents(person: PersonDetail): Array<ApiEvent & { readonly?: boolean }> {
  const events = person.events;
  const howMet = person.how_met?.trim();
  const hasMet = events.some((event) => event.kind === "met");
  if (!howMet || hasMet) return events;
  const happenedAt = person.met_at ?? String(person.created_at).slice(0, 10);
  const origin: ApiEvent & { readonly?: boolean } = {
    id: `how-met-${person.id}`,
    person_id: person.id,
    kind: "met",
    content: howMet,
    happened_at: happenedAt,
    created_at: person.created_at,
    readonly: true,
  };
  return [...events, origin].sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at)));
}

function contactHref(key: string, value: string): string | null {
  if (key === "phone") return `tel:${value.replace(/\s+/g, "")}`;
  if (key === "email") return `mailto:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

export default async function PersonPage({ params, searchParams }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const editGeo = (Array.isArray(query.edit) ? query.edit[0] : query.edit) === "geo";
  const person = await loadPerson(id);
  if (!person) notFound();

  const labels = person.tags.filter((t) => t.kind !== "circle");
  const contacts = Object.entries(person.contacts);
  const events = timelineEvents(person);

  return (
    <div className="space-y-6">
      <Link href="/people" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 人脉列表
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{person.name}</h1>
          <TierBadge tier={person.tier} />
          {person.gender !== "unknown" ? (
            <span className="text-sm text-muted-foreground">{GENDER_LABEL[person.gender]}</span>
          ) : null}
          {person.location && person.lat != null && person.lng != null ? (
            <Link
              href="/map?view=geo"
              title={`${person.geo_manual ? "手动坐标" : "已定位"} ${person.lat.toFixed(2)}, ${person.lng.toFixed(2)}`}
              className="inline-flex items-center gap-0.5 text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              <MapPin className="size-3.5" />
              {person.location}
            </Link>
          ) : person.location ? (
            <span className="inline-flex items-center gap-0.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" />
              {person.location}
            </span>
          ) : person.lat != null && person.lng != null ? (
            <Link href="/map?view=geo" className="inline-flex items-center gap-0.5 text-sm text-muted-foreground underline-offset-2 hover:underline">
              <MapPin className="size-3.5" />
              {person.lat.toFixed(2)}, {person.lng.toFixed(2)}
            </Link>
          ) : null}
        </div>
        {person.summary ? <p className="text-base leading-relaxed">{person.summary}</p> : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {person.met_at ? <span>认识于 {formatDay(person.met_at)}</span> : null}
          {person.last_contact_at ? (
            <span title={formatDate(person.last_contact_at)}>最近联系 {formatRelative(person.last_contact_at)}</span>
          ) : null}
          {person.location && (person.lat == null || person.lng == null) ? (
            <span className="text-amber-700">所在地未能定位，可在编辑里手动填坐标</span>
          ) : null}
        </div>
        <PersonEditForm person={person} initialOpen={editGeo} />
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">联系方式</h2>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无。点「编辑」添加微信、电话等。</p>
          ) : (
            <dl className="space-y-1.5 text-sm">
              {contacts.map(([key, value]) => {
                const href = contactHref(key, value);
                return (
                  <div key={key} className="flex items-baseline gap-3">
                    <dt className="w-16 shrink-0 text-muted-foreground">{contactLabel(key)}</dt>
                    <dd className="min-w-0 break-all font-mono text-[13px] select-all">
                      {href ? (
                        <a href={href} className="underline-offset-2 hover:underline">
                          {value}
                        </a>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </section>

        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">圈子和标签</h2>
          <div className="space-y-3 text-sm">
            <CircleField personId={person.id} tags={person.tags} primaryCircleTagId={person.primary_circle_tag_id} />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-8 text-xs text-muted-foreground">标签</span>
              {labels.length === 0 ? (
                <span className="text-xs text-muted-foreground">用来查找，例如羽毛球、律师。</span>
              ) : (
                labels.map((t) => (
                  <Link key={t.id} href={`/people?tag=${encodeURIComponent(t.name)}`}>
                    <TagChip name={t.name} kind={t.kind} />
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="space-y-2 rounded-xl border border-dashed bg-muted/30 p-4">
        <h2 className="text-sm font-semibold">
          我的印象 <span className="text-xs font-normal text-muted-foreground">私密，只在这里显示</span>
        </h2>
        {person.impression ? (
          <p className="text-sm leading-relaxed">{person.impression}</p>
        ) : (
          <p className="text-sm text-muted-foreground">还没写。他/她给你什么感觉？</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">追加一句</h2>
        <AppendInput personId={person.id} personName={person.name} />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-baseline justify-between text-sm font-semibold">
          时间线
          <span className="text-xs font-normal text-muted-foreground">{events.length} 条 · 只追加，可删除</span>
        </h2>
        <Timeline personId={person.id} events={events} />
      </section>
    </div>
  );
}
