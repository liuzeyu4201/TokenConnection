import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { InboxPendingList } from "@/components/inbox-pending-list";
import { PersonCard } from "@/components/person-card";
import { UniversalInput } from "@/components/universal-input";
import { listInbox } from "@/lib/services/inbox";
import { countPeople, listRecentlyAdded, listRecentlyContacted } from "@/lib/services/people";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [pending, recentlyAdded, recentlyContacted, total] = await Promise.all([
    listInbox({ status: "pending", limit: 5 }),
    listRecentlyAdded(6),
    listRecentlyContacted(6),
    countPeople(),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-1 md:hidden">
        <h1 className="text-xl font-semibold">人脉</h1>
        <p className="text-sm text-muted-foreground">一句话记人，一句话找人。</p>
      </div>

      <UniversalInput />

      {pending.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-baseline justify-between text-sm font-semibold">
            待处理
            <span className="text-xs font-normal text-muted-foreground">{pending.length} 条</span>
          </h2>
          <InboxPendingList items={pending} compact />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="flex items-baseline justify-between text-sm font-semibold">
          最近添加
          <Link href="/people" className="text-xs font-normal text-muted-foreground hover:text-foreground">
            全部 {total} 人 →
          </Link>
        </h2>
        {recentlyAdded.length === 0 ? (
          <EmptyState>
            还没有人。在上面输入一句话记下第一个人，或运行 <code className="rounded bg-muted px-1">pnpm db:seed</code> 填充示例数据。
          </EmptyState>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {recentlyAdded.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </div>
        )}
      </section>

      {recentlyContacted.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">最近联系</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {recentlyContacted.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
