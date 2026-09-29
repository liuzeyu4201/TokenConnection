import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { InboxPendingList } from "@/components/inbox-pending-list";
import { PersonCard } from "@/components/person-card";
import { ReminderList } from "@/components/reminder-list";
import { UniversalInput } from "@/components/universal-input";
import { listInbox } from "@/lib/services/inbox";
import { listRecentlyContacted } from "@/lib/services/people";
import { listReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [pending, recentExchanges, reminders] = await Promise.all([
    listInbox({ status: "pending", limit: 5 }),
    listRecentlyContacted(6),
    listReminders(),
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

      <section className="space-y-2">
        <h2 className="flex items-baseline justify-between text-sm font-semibold">
          最近交流
            <Link href="/people" className="text-sm font-semibold hover:underline">
              查看全部 →
            </Link>
        </h2>
        {recentExchanges.length === 0 ? (
          <EmptyState>
            还没有交流记录。在上面输入一句话记下第一个人，或运行 <code className="rounded bg-muted px-1">pnpm db:seed</code> 填充示例数据。
          </EmptyState>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {recentExchanges.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
