import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Inbox, Tags } from "lucide-react";

import { countPendingInbox } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "设置" };

export default async function SettingsPage() {
  const pendingCount = await countPendingInbox().catch(() => 0);

  const items = [
    {
      href: "/tags",
      label: "圈子和标签",
      description: "新建、改名、删除圈子和标签。给人分配时只能从这里选。",
      icon: Tags,
      badge: null as string | null,
    },
    {
      href: "/inbox",
      label: "收件箱",
      description: "处理还没确认的记录。",
      icon: Inbox,
      badge: pendingCount > 0 ? `${pendingCount} 条待处理` : null,
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">设置</h1>
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex items-center gap-3 px-3 py-3 hover:bg-muted/50">
              <item.icon className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.description}</span>
              </span>
              {item.badge ? <span className="shrink-0 text-xs text-muted-foreground">{item.badge}</span> : null}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
