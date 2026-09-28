import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";

import { EmptyState } from "@/components/empty-state";
import { InboxPendingList } from "@/components/inbox-pending-list";
import { formatRelative } from "@/lib/format";
import { INBOX_INTENT_LABEL, INBOX_STATUS_LABEL, InboxStatus, type InboxStatus as InboxStatusType } from "@/lib/schemas/enums";
import { listInbox } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "收件箱" };

const TABS: InboxStatusType[] = ["pending", "applied", "discarded"];

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const raw = await searchParams;
  const statusParam = Array.isArray(raw.status) ? raw.status[0] : raw.status;
  const status = InboxStatus.safeParse(statusParam).data ?? "pending";
  const items = await listInbox({ status, limit: 100 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">收件箱</h1>
        <p className="text-sm text-muted-foreground">所有自然语言录入的原文都保留在这里，可以随时重新解析。</p>
      </div>

      <div className="inline-flex rounded-lg border p-0.5 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab}
            href={tab === "pending" ? "/inbox" : `/inbox?status=${tab}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-muted-foreground",
              tab === status && "bg-primary text-primary-foreground",
            )}
          >
            {INBOX_STATUS_LABEL[tab]}
          </Link>
        ))}
      </div>

      {status === "pending" ? (
        <InboxPendingList items={items} />
      ) : items.length === 0 ? (
        <EmptyState>这里还没有记录。</EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((item) => (
            <li key={item.id} className="space-y-1 px-3 py-2.5">
              <p className="text-sm">{item.raw_text}</p>
              <p className="text-[11px] text-muted-foreground">
                {item.intent ? INBOX_INTENT_LABEL[item.intent] : "—"} · {formatRelative(item.created_at)}
                {item.applied_to ? (
                  <>
                    {" · "}
                    <Link href={`/people/${item.applied_to}`} className="underline-offset-2 hover:underline">
                      查看这个人
                    </Link>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
