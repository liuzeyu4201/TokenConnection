import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin } from "lucide-react";

import { AppendInput } from "@/components/append-input";
import { DeletePersonButton } from "@/components/person-edit-form";
import { EnterEditButton, PersonEditPanel, ProfileEdit, ProfileModes, ProfileView } from "@/components/profile-modes";
import { TagChip } from "@/components/tag-chip";
import { TierBadge } from "@/components/tier-badge";
import { Timeline } from "@/components/timeline";
import { resolvePrimaryCircle } from "@/lib/map/primary-circle";
import { contactLabel, formatDate, formatDay, formatRelative } from "@/lib/format";
import { ApiError } from "@/lib/api/errors";
import { GENDER_LABEL } from "@/lib/schemas/enums";
import type { ApiEvent, ApiTag } from "@/lib/types";
import { getPersonDetail, type PersonDetail } from "@/lib/services/people";
import { listTags } from "@/lib/services/tags";

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

  const vocabulary: ApiTag[] = (await listTags()).map(({ id, name, kind }) => ({ id, name, kind }));
  const contacts = Object.entries(person.contacts);
  const events = timelineEvents(person);
  const circle = resolvePrimaryCircle(person.primary_circle_tag_id, person.tags);
  const labels = person.tags.filter((tag) => tag.kind !== "circle");
  const located = person.lat != null && person.lng != null;
  const locationText =
    person.location ?? (located ? `${person.lat!.toFixed(2)}, ${person.lng!.toFixed(2)}` : null);

  return (
    <ProfileModes initialEditing={editGeo}>
    <div className="space-y-6">
      <Link href="/people" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 人脉列表
      </Link>

      <ProfileView>
        <article>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
                <TierBadge tier={person.tier} />
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {person.gender !== "unknown" ? <span>{GENDER_LABEL[person.gender]}</span> : null}
                {locationText ? (
                  located ? (
                    <Link
                      href="/map?view=geo"
                      title={`${person.geo_manual ? "手动坐标" : "已定位"} ${person.lat!.toFixed(2)}, ${person.lng!.toFixed(2)}`}
                      className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
                    >
                      <MapPin className="size-3.5" />
                      {locationText}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="size-3.5" />
                      {locationText}
                    </span>
                  )
                ) : null}
              </p>
              {person.summary ? <p className="max-w-xl text-sm leading-relaxed">{person.summary}</p> : null}
            </div>
            <div className="flex shrink-0 gap-1">
              <EnterEditButton />
              <DeletePersonButton personId={person.id} personName={person.name} />
            </div>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)]">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground">印象</p>
                <p className="mt-1 text-sm leading-relaxed">{person.impression || "还没写"}</p>
              </div>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {person.met_at ? <span>认识于 {formatDay(person.met_at)}</span> : null}
                {person.location && !located ? <span className="text-amber-700">所在地未能定位</span> : null}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground">联系方式</p>
                {contacts.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">暂无</p>
                ) : (
                  <dl className="mt-2 space-y-1.5 text-sm">
                    {contacts.map(([key, value]) => {
                      const href = contactHref(key, value);
                      return (
                        <div key={key} className="flex items-baseline gap-3">
                          <dt className="w-14 shrink-0 text-muted-foreground">{contactLabel(key)}</dt>
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
              </div>
              <div className="space-y-2">
                <p className="text-[11px] tracking-wide text-muted-foreground">圈子和标签</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {circle ? <TagChip name={circle.name} kind="circle" /> : <span className="text-sm text-muted-foreground">未分类</span>}
                  {labels.map((tag) => (
                    <TagChip key={tag.id} name={tag.name} kind={tag.kind} href={`/people?tag=${encodeURIComponent(tag.name)}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </article>

        <section className="space-y-3">
          <h2 className="flex items-baseline gap-3 text-sm font-semibold">
            时间线
            {person.last_contact_at ? (
              <span className="text-xs font-normal text-muted-foreground" title={formatDate(person.last_contact_at)}>
                最近联系 {formatRelative(person.last_contact_at)}
              </span>
            ) : null}
          </h2>
          <Timeline personId={person.id} events={events} />
        </section>
      </ProfileView>

      <ProfileEdit>
        <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
        <PersonEditPanel person={person} vocabulary={vocabulary} />
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">追加一句</h2>
          <AppendInput personId={person.id} personName={person.name} />
        </section>
        <section className="space-y-3">
          <h2 className="flex items-baseline justify-between text-sm font-semibold">
            时间线
            <span className="text-xs font-normal text-muted-foreground">{events.length} 条 · 可删除</span>
          </h2>
          <Timeline personId={person.id} events={events} canDelete />
        </section>
      </ProfileEdit>
    </div>
    </ProfileModes>
  );
}
