import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin } from "lucide-react";

import { AppendInput } from "@/components/append-input";
import { PersonEditForm } from "@/components/person-edit-form";
import { TagChip } from "@/components/tag-chip";
import { TierBadge } from "@/components/tier-badge";
import { Timeline } from "@/components/timeline";
import { contactLabel, formatDate, formatDay, formatRelative } from "@/lib/format";
import { ApiError } from "@/lib/api/errors";
import { GENDER_LABEL } from "@/lib/schemas/enums";
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

function contactHref(key: string, value: string): string | null {
  if (key === "phone") return `tel:${value.replace(/\s+/g, "")}`;
  if (key === "email") return `mailto:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const person = await loadPerson(id);
  if (!person) notFound();

  const skills = person.tags.filter((t) => t.kind === "skill");
  const circles = person.tags.filter((t) => t.kind === "circle");
  const others = person.tags.filter((t) => t.kind === "other");
  const contacts = Object.entries(person.contacts);

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
          {person.location ? (
            <span className="inline-flex items-center gap-0.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" />
              {person.location}
            </span>
          ) : null}
        </div>
        {person.summary ? <p className="text-base leading-relaxed">{person.summary}</p> : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {person.how_met ? <span>认识经过：{person.how_met}</span> : null}
          {person.met_at ? <span>认识于 {formatDay(person.met_at)}</span> : null}
          {person.last_contact_at ? (
            <span title={formatDate(person.last_contact_at)}>最近联系 {formatRelative(person.last_contact_at)}</span>
          ) : null}
          <span>添加于 {formatDate(person.created_at)}</span>
        </div>
        <PersonEditForm person={person} />
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">追加一句</h2>
        <AppendInput personId={person.id} personName={person.name} />
      </section>

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
          <h2 className="text-sm font-semibold">标签</h2>
          {person.tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无标签。</p>
          ) : (
            <div className="space-y-2 text-sm">
              {skills.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-8 text-xs text-muted-foreground">能力</span>
                  {skills.map((t) => (
                    <Link key={t.id} href={`/people?tag=${encodeURIComponent(t.name)}`}>
                      <TagChip name={t.name} kind={t.kind} />
                    </Link>
                  ))}
                </div>
              ) : null}
              {circles.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-8 text-xs text-muted-foreground">圈子</span>
                  {circles.map((t) => (
                    <Link key={t.id} href={`/people?tag=${encodeURIComponent(t.name)}`}>
                      <TagChip name={t.name} kind={t.kind} />
                    </Link>
                  ))}
                </div>
              ) : null}
              {others.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-8 text-xs text-muted-foreground">其他</span>
                  {others.map((t) => (
                    <Link key={t.id} href={`/people?tag=${encodeURIComponent(t.name)}`}>
                      <TagChip name={t.name} kind={t.kind} />
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )}
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

      <section className="space-y-3">
        <h2 className="flex items-baseline justify-between text-sm font-semibold">
          时间线
          <span className="text-xs font-normal text-muted-foreground">{person.events.length} 条 · 只追加，可删除</span>
        </h2>
        <Timeline personId={person.id} events={person.events} />
      </section>
    </div>
  );
}
