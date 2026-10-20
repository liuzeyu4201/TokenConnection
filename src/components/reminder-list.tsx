import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { TierBadge } from "@/components/tier-badge";
import { setFollowUpStatusAction } from "@/lib/followups/actions";
import { followUpOffsetLabel } from "@/lib/followups/plan";
import { formatDate, formatDay, formatRelative } from "@/lib/format";
import type { ReminderFeedItem } from "@/lib/reminders/feed";

const BASIS_LABEL = {
  last_contact_at: "上次联系",
  met_at: "认识于",
  created_at: "添加于",
} as const;

/**
 * "该联系了" list. Tier rows are the usual overdue contacts.
 * Follow-up rows are labeled 回访 and only show up once they are due.
 */
export function ReminderList({ items }: { items: ReminderFeedItem[] }) {
  if (items.length === 0) {
    return <EmptyState>都联系过了。</EmptyState>;
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((item) =>
          item.kind === "tier" ? (
            <li key={item.key}>
              <Link href={`/people/${item.person.id}`} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{item.person.name}</span>
                    <TierBadge tier={item.person.tier} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {BASIS_LABEL[item.basis]} {formatDate(item.basis_at)}
                    {formatRelative(item.basis_at) !== formatDate(item.basis_at) ? `（${formatRelative(item.basis_at)}）` : ""} · 阈值 {item.threshold_days} 天
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 ring-inset">
                  逾期 {item.overdue_days} 天
                </span>
              </Link>
            </li>
          ) : (
            <li key={item.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <Link href={`/people/${item.person.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.person.name}</span>
                  <TierBadge tier={item.person.tier} />
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 ring-inset">
                    回访
                  </span>
                </div>
                <p className="mt-0.5 text-xs">{item.suggestion}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {followUpOffsetLabel(item.offset_days)} · {formatDay(item.due_on)}
                </p>
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 ring-inset">
                  {item.overdue_days > 0 ? `逾期 ${item.overdue_days} 天` : "该回访了"}
                </span>
                <div className="flex gap-2">
                  <form action={setFollowUpStatusAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="person_id" value={item.person.id} />
                    <input type="hidden" name="status" value="done" />
                    <button type="submit" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                      完成
                    </button>
                  </form>
                  <form action={setFollowUpStatusAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="person_id" value={item.person.id} />
                    <input type="hidden" name="status" value="skipped" />
                    <button type="submit" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                      跳过
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export function DueReminders({ items, limit = 5 }: { items: ReminderFeedItem[]; limit?: number }) {
  const shown = items.slice(0, limit);
  if (shown.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline justify-between text-sm font-semibold">
        该联系了
        <Link href="/reminders" className="text-sm font-semibold hover:underline">
          查看全部 →
        </Link>
      </h2>
      <ReminderList items={shown} />
    </section>
  );
}
