"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";

type Item = {
  id: string;
  kind: "person" | "circle";
  status: "active" | "revoked";
  message: string | null;
  created_at: Date | string;
  item_count: number;
  accepted_count: number;
  recipients: Array<{ id: string; username: string | null; status: "pending" | "accepted" | "ignored" }>;
  links: Array<{ id: string; expires_at: Date | string; view_count: number; max_views: number | null; revoked_at: Date | string | null }>;
};

const RECIPIENT = { pending: "待处理", accepted: "已收录", ignored: "已忽略" } as const;

export function SentShares({ items }: { items: Item[] }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  if (items.length === 0) return <EmptyState>还没有发出去的分享。在一个人或一个圈子上点「分享」。</EmptyState>;

  const run = async (key: string, path: string, method: "POST" | "DELETE") => {
    setBusy(key);
    setError(null);
    try {
      await apiFetch(path, { method });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items.map((item) => (
        <article key={item.id} className="rounded-xl border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {item.kind === "circle" ? "圈子" : "一个人"} · {item.item_count} 张快照
                {item.status === "revoked" ? " · 已撤销" : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatRelative(item.created_at)}
                {item.message ? ` · ${item.message}` : ""}
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {item.recipients.map((recipient) => (
                  <li key={recipient.id}>
                    @{recipient.username ?? "用户"} · {RECIPIENT[recipient.status]}
                  </li>
                ))}
                {item.links.map((link) => (
                  <li key={link.id}>
                    链接 · 已打开 {link.view_count}
                    {link.max_views != null ? ` / ${link.max_views}` : ""} 次
                    {link.revoked_at ? " · 已撤销" : ""}
                  </li>
                ))}
              </ul>
            </div>
            {item.status === "active" ? (
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === item.id}
                  onClick={() => {
                    const note =
                      item.accepted_count > 0
                        ? `已被 ${item.accepted_count} 人收录的副本不会撤回。仍要撤销这条分享吗？`
                        : "撤销后链接失效，还没收录的人将看不到内容。继续吗？";
                    if (!window.confirm(note)) return;
                    void run(item.id, `/api/v1/shares/${item.id}/revoke`, "POST");
                  }}
                >
                  撤销
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === `${item.id}-refresh`} onClick={() => void run(`${item.id}-refresh`, `/api/v1/shares/${item.id}/refresh`, "POST")}>
                  刷新快照
                </Button>
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
