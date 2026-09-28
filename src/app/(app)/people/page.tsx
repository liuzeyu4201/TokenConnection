import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PeopleFilters } from "@/components/people-filters";
import { PersonCard } from "@/components/person-card";
import { Button } from "@/components/ui/button";
import { PeopleQuerySchema } from "@/lib/schemas/person";
import { listPeople } from "@/lib/services/people";
import { listTags } from "@/lib/services/tags";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "人脉列表" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PeoplePage({ searchParams }: PageProps<"/people">) {
  const raw = await searchParams;
  const params = {
    tier: first(raw.tier),
    tag: first(raw.tag),
    location: first(raw.location),
    q: first(raw.q),
    cursor: first(raw.cursor),
    limit: "30",
  };
  const parsed = PeopleQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : PeopleQuerySchema.parse({ limit: "30" });

  const [{ items, next_cursor }, tags] = await Promise.all([listPeople(query), listTags()]);

  const nextHref = next_cursor
    ? `/people?${new URLSearchParams({
        ...(query.tier ? { tier: query.tier } : {}),
        ...(query.tag ? { tag: query.tag } : {}),
        ...(query.location ? { location: query.location } : {}),
        ...(query.q ? { q: query.q } : {}),
        cursor: next_cursor,
      }).toString()}`
    : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">人脉</h1>
      <PeopleFilters
        values={{ tier: query.tier, tag: query.tag, location: query.location, q: query.q }}
        tags={tags}
      />
      {!parsed.success ? <p className="text-xs text-destructive">筛选参数无效，已忽略。</p> : null}

      {items.length === 0 ? (
        <EmptyState>没有符合条件的人。</EmptyState>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((person) => (
            <PersonCard key={person.id} person={person} />
          ))}
        </div>
      )}

      {nextHref ? (
        <div className="text-center">
          <Button variant="outline" nativeButton={false} render={<Link href={nextHref} />}>
            下一页
          </Button>
        </div>
      ) : null}
    </div>
  );
}
