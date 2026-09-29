import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { TierBadge } from "@/components/tier-badge";
import { formatDate, formatRelative } from "@/lib/format";
import type { ApiReminder } from "@/lib/types";

const BASIS_LABEL: Record<ApiReminder["basis"], string> = {
  last_contact_at: "上次联系",
  met_at: "认识于",
  created_at: "添加于",
};

/**
 * "该联系了" list (design.md §14.3). A row opens that person's profile.
 */
export function ReminderList({ items }: { items: ApiReminder[] }) {
  if (items.length === 0) {
    return <EmptyState>都联系过了。</EmptyState>;
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((r) => (
          <li key={r.person.id}>
            <Link href={`/people/${r.person.id}`} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{r.person.name}</span>
                  <TierBadge tier={r.person.tier} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {BASIS_LABEL[r.basis]} {formatDate(r.basis_at)}
                  {formatRelative(r.basis_at) !== formatDate(r.basis_at) ? `（${formatRelative(r.basis_at)}）` : ""} · 阈值 {r.threshold_days} 天
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 ring-inset">
                逾期 {r.overdue_days} 天
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
