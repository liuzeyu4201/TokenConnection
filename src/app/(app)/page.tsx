import { InboxPendingList } from "@/components/inbox-pending-list";
import { DueReminders } from "@/components/reminder-list";
import { UniversalInput } from "@/components/universal-input";
import { requireUser } from "@/lib/auth/dal";
import { listInbox } from "@/lib/services/inbox";
import { listContactReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser("/");
  const [pending, reminders] = await Promise.all([
    listInbox(user, { status: "pending", limit: 5 }),
    listContactReminders(user),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-1 md:hidden">
        <h1 className="text-xl font-semibold">人脉</h1>
        <p className="text-sm text-muted-foreground">一句话记人，一句话找人。</p>
      </div>

      <UniversalInput />

      <DueReminders items={reminders} />

      {pending.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-baseline justify-between text-sm font-semibold">
            待处理
            <span className="text-xs font-normal text-muted-foreground">{pending.length} 条</span>
          </h2>
          <InboxPendingList items={pending} compact />
        </section>
      ) : null}
    </div>
  );
}
