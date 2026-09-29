"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDay } from "@/lib/format";
import { EVENT_KIND_LABEL, type EventKind } from "@/lib/schemas/enums";
import type { ApiEvent } from "@/lib/types";

const KIND_DOT: Record<EventKind, string> = {
  met: "bg-sky-500",
  helped_me: "bg-emerald-500",
  i_helped: "bg-violet-500",
  hangout: "bg-amber-500",
  note: "bg-slate-400",
};

/**
 * Append-only timeline. Entries can be deleted (with confirmation) but never
 * edited — decision on design.md §19 Q1.
 */
export function Timeline({
  personId,
  events,
  canDelete = false,
}: {
  personId: string;
  events: Array<ApiEvent & { readonly?: boolean }>;
  /** Delete buttons only appear in the profile's edit mode. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (events.length === 0) {
    return (
      <EmptyState>
        {canDelete ? "还没有事件。用上面的输入框追加一句，例如「上周一起打了球」。" : "还没有事件。"}
      </EmptyState>
    );
  }

  const remove = async (event: ApiEvent) => {
    if (!window.confirm(`删除这条记录？\n${formatDay(event.happened_at)} ${event.content}`)) return;
    setBusyId(event.id);
    setError(null);
    try {
      await apiFetch(`/api/v1/people/${personId}/events/${event.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
      <ol className="relative ml-2 border-l pl-5">
        {events.map((event) => (
          <li key={event.id} className="group relative pb-4 last:pb-0">
            <span className={`absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full ring-4 ring-background ${KIND_DOT[event.kind]}`} />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <time dateTime={event.happened_at}>{formatDay(event.happened_at)}</time>
                  <span className="rounded bg-muted px-1.5 py-0.5">{EVENT_KIND_LABEL[event.kind]}</span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed">{event.content}</p>
              </div>
              {canDelete && !event.readonly ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground opacity-60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                  aria-label="删除事件"
                  disabled={busyId === event.id}
                  onClick={() => void remove(event)}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
