"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";

import { DraftCard } from "@/components/draft-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import type { ApiInbox, ApiInboxParseResult } from "@/lib/types";

const SOURCE_LABEL: Record<string, string> = { web: "网页", shortcut: "快捷指令", ios: "iOS" };

/**
 * Pending inbox items (typically recorded on the phone via the shortcut).
 * Each item expands into the same DraftCard used by the universal input.
 */
export function InboxPendingList({ items: initialItems, compact = false }: { items: ApiInbox[]; compact?: boolean }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initialItems);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<Record<string, ApiInboxParseResult>>({});
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Follow server-provided items after router.refresh().
  const [seenItems, setSeenItems] = React.useState(initialItems);
  if (seenItems !== initialItems) {
    setSeenItems(initialItems);
    setItems(initialItems);
  }

  if (items.length === 0) {
    return compact ? null : <EmptyState>没有待处理的记录。手机上记的内容会出现在这里。</EmptyState>;
  }

  const toggle = async (item: ApiInbox) => {
    if (openId === item.id) {
      setOpenId(null);
      return;
    }
    setOpenId(item.id);
    if (details[item.id]) return;
    setLoadingId(item.id);
    setError(null);
    try {
      // Stored draft + candidates; no LLM call. "重新解析" is explicit.
      const result = await apiFetch<ApiInboxParseResult>(`/api/v1/inbox/${item.id}`);
      setDetails((d) => ({ ...d, [item.id]: result }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingId(null);
    }
  };

  const remove = (id: string) => {
    setItems((list) => list.filter((i) => i.id !== id));
    setOpenId(null);
    router.refresh();
  };

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items.map((item) => {
        const isOpen = openId === item.id;
        const detail = details[item.id];
        return (
          <div key={item.id} className="rounded-xl border bg-card">
            <button
              type="button"
              onClick={() => void toggle(item)}
              className="flex w-full items-start justify-between gap-3 p-3 text-left"
            >
              <div className="min-w-0">
                <p className="text-sm leading-snug">{item.raw_text}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {SOURCE_LABEL[item.source] ?? item.source} · {formatRelative(item.created_at)}
                  {item.error ? " · 自动解析失败，需手动填写" : ""}
                </p>
              </div>
              {isOpen ? (
                <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
            {isOpen ? (
              <div className="border-t p-3">
                {loadingId === item.id && !detail ? (
                  <p className="text-sm text-muted-foreground">加载中…</p>
                ) : detail ? (
                  <DraftCard
                    inboxId={item.id}
                    rawText={item.raw_text}
                    initialDraft={detail.draft}
                    candidates={detail.candidates}
                    error={detail.error}
                    onApplied={() => remove(item.id)}
                    onDiscarded={() => remove(item.id)}
                    onReparsed={(r) => setDetails((d) => ({ ...d, [item.id]: r }))}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {compact ? (
        <div className="text-right">
          <Button variant="link" size="sm" nativeButton={false} render={<Link href="/inbox" />}>
            查看全部收件箱 →
          </Button>
        </div>
      ) : null}
    </div>
  );
}
