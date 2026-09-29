import { InboxPendingList } from "@/components/inbox-pending-list";
import { UniversalInput } from "@/components/universal-input";
import { listInbox } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const pending = await listInbox({ status: "pending", limit: 5 });

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
    </div>
  );
}
