import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PeopleFilters } from "@/components/people-filters";
import { PersonCard } from "@/components/person-card";
import { ReminderList } from "@/components/reminder-list";
import { Button } from "@/components/ui/button";
import { PeopleQuerySchema } from "@/lib/schemas/person";
import { listPeoplePage } from "@/lib/services/people";
import { listReminders } from "@/lib/services/reminders";
import { listTags } from "@/lib/services/tags";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "人脉列表" };

const PAGE_SIZE = 8;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Page numbers to render, with `null` for an ellipsis gap. */
function pageWindow(current: number, count: number): (number | null)[] {
  const pages = new Set([1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(null);
    result.push(p);
  });
  return result;
}

export default async function PeoplePage({ searchParams }: PageProps<"/people">) {
  const raw = await searchParams;
  const params = {
    tier: first(raw.tier),
    tag: first(raw.tag),
    location: first(raw.location),
    q: first(raw.q),
  };
  const parsed = PeopleQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : PeopleQuerySchema.parse({});

  const [{ items, page, pageCount }, tags, reminders] = await Promise.all([
    listPeoplePage(query, parsePage(first(raw.page)), PAGE_SIZE),
    listTags(),
    listReminders(),
  ]);

  const filterParams = {
    ...(query.tier ? { tier: query.tier } : {}),
    ...(query.tag ? { tag: query.tag } : {}),
    ...(query.location ? { location: query.location } : {}),
    ...(query.q ? { q: query.q } : {}),
  };
  const hasFilters = Object.keys(filterParams).length > 0;
  const pageHref = (p: number) => {
    const search = new URLSearchParams({ ...filterParams, ...(p > 1 ? { page: String(p) } : {}) }).toString();
    return search ? `/people?${search}#all` : "/people#all";
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">人脉</h1>
        <PeopleFilters
          values={{ tier: query.tier, tag: query.tag, location: query.location, q: query.q }}
          tags={tags}
        />
        {!parsed.success ? <p className="text-xs text-destructive">筛选参数无效，已忽略。</p> : null}
      </div>

      <section id="all" className="scroll-mt-4 space-y-2">
        <h2 className="flex items-baseline justify-between text-sm font-semibold">
          全部人脉
          {hasFilters ? (
            <Link href="/people#all" className="text-sm font-semibold hover:underline">
              清除筛选 →
            </Link>
          ) : null}
        </h2>

        {items.length === 0 ? (
          <EmptyState>没有符合条件的人。</EmptyState>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </div>
        )}

        {pageCount > 1 ? (
          <nav aria-label="分页" className="flex flex-wrap items-center justify-center gap-1 pt-2">
            {page > 1 ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={pageHref(page - 1)} />}>
                上一页
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                上一页
              </Button>
            )}
            {pageWindow(page, pageCount).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? "default" : "ghost"}
                  size="sm"
                  className="min-w-7"
                  nativeButton={false}
                  render={<Link href={pageHref(p)} aria-current={p === page ? "page" : undefined} />}
                >
                  {p}
                </Button>
              ),
            )}
            {page < pageCount ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={pageHref(page + 1)} />}>
                下一页
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                下一页
              </Button>
            )}
            <span className="ml-2 text-xs text-muted-foreground">
              第 {page} / {pageCount} 页
            </span>
          </nav>
        ) : null}
      </section>

      {reminders.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-baseline justify-between text-sm font-semibold">
            该联系了
            <Link href="/reminders" className="text-sm font-semibold hover:underline">
              查看全部 →
            </Link>
          </h2>
          <ReminderList items={reminders.slice(0, 5)} />
        </section>
      ) : null}
    </div>
  );
}
