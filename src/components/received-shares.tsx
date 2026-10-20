"use client";

import Link from "next/link";
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
  from_username: string | null;
  recipient_status: "pending" | "accepted" | "ignored";
  inbox: Array<{ id: string; status: string; error: string | null }>;
};

const STATUS_LABEL = { pending: "待收录", accepted: "已收录", ignored: "已忽略" } as const;

export function ReceivedShares({ items }: { items: Item[] }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  if (items.length === 0) return <EmptyState>还没有人分享给你。</EmptyState>;

  const acceptAll = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/api/v1/shared/${id}/accept`, { method: "POST" });
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
      {items.map((item) => {
        const pending = item.inbox.filter((row) => row.status === "pending");
        const revoked = item.status === "revoked";
        return (
          <article key={item.id} className={`rounded-xl border bg-card p-3 ${revoked ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {item.from_username ? `@${item.from_username}` : "有人"} 分享了一个{item.kind === "circle" ? "圈子" : "人"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {revoked ? "分享已撤销" : STATUS_LABEL[item.recipient_status]} · {formatRelative(item.created_at)}
                  {item.message && !revoked ? ` · ${item.message}` : ""}
                </p>
              </div>
              {!revoked && pending.length > 1 ? (
                <Button size="sm" disabled={busy === item.id} onClick={() => void acceptAll(item.id)}>
                  {busy === item.id ? "收录中…" : "全部收录"}
                </Button>
              ) : null}
            </div>
            {!revoked && pending.length > 0 ? (
              <p className="mt-2 text-xs">
                <Link href="/inbox" className="underline-offset-2 hover:underline">
                  {pending.length} 条在收件箱里待处理
                </Link>
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
