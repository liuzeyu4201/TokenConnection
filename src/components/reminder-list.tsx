"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";

import { AppendInput } from "@/components/append-input";
import { EmptyState } from "@/components/empty-state";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatRelative } from "@/lib/format";
import type { ApiReminder } from "@/lib/types";

const BASIS_LABEL: Record<ApiReminder["basis"], string> = {
  last_contact_at: "上次联系",
  met_at: "认识于",
  created_at: "添加于",
};

/**
 * "该联系了" list (design.md §14.3). Each row expands into 追加一句; once an
 * event is appended the person is no longer overdue and drops out of the list.
 */
export function ReminderList({ items: initialItems, compact = false }: { items: ApiReminder[]; compact?: boolean }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initialItems);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const [seen, setSeen] = React.useState(initialItems);
  if (seen !== initialItems) {
    setSeen(initialItems);
    setItems(initialItems);
  }

  if (items.length === 0) {
    return compact ? null : <EmptyState>都联系过了。</EmptyState>;
  }

  const remove = (id: string) => {
    setItems((list) => list.filter((r) => r.person.id !== id));
    setOpenId(null);
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((r) => {
          const isOpen = openId === r.person.id;
          return (
            <li key={r.person.id}>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
                onClick={() => setOpenId(isOpen ? null : r.person.id)}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/people/${r.person.id}`} className="text-sm font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {r.person.name}
                    </Link>
                    <TierBadge tier={r.person.tier} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {BASIS_LABEL[r.basis]} {formatDate(r.basis_at)}
                    {formatRelative(r.basis_at) !== formatDate(r.basis_at) ? `（${formatRelative(r.basis_at)}）` : ""} · 阈值 {r.threshold_days} 天
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 ring-inset">
                    逾期 {r.overdue_days} 天
                  </span>
                  {isOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                </div>
              </button>
              {isOpen ? (
                <div className="border-t bg-muted/30 px-3 py-3">
                  <AppendInput personId={r.person.id} personName={r.person.name} compact onApplied={() => remove(r.person.id)} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {compact ? (
        <div className="text-right">
          <Button variant="link" size="sm" nativeButton={false} render={<Link href="/reminders" />}>
            查看全部 →
          </Button>
        </div>
      ) : null}
    </div>
  );
}
