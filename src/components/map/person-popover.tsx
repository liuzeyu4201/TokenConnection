"use client";

import Link from "next/link";
import { X } from "lucide-react";

import { AppendInput } from "@/components/append-input";
import { TagChip } from "@/components/tag-chip";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import type { ApiMapPerson } from "@/lib/types";

/**
 * Card shown when a point / bubble entry is clicked on either map
 * (design.md §14.1 "点击一个点弹出卡片，卡片上能直接追加一句").
 * Bottom sheet on phones, side panel on desktop.
 */
export function PersonPopover({
  person,
  onClose,
  onAppended,
}: {
  person: ApiMapPerson;
  onClose: () => void;
  onAppended?: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t bg-card p-4 shadow-lg md:absolute md:inset-auto md:top-3 md:right-3 md:bottom-auto md:w-80 md:rounded-xl md:border md:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/people/${person.id}`} className="text-base font-semibold hover:underline">
              {person.name}
            </Link>
            <TierBadge tier={person.tier} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[person.location, person.sector !== "未分类" ? `圈子 · ${person.sector}` : null].filter(Boolean).join(" · ")}
            {person.last_contact_at ? ` · 最近联系 ${formatRelative(person.last_contact_at)}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="关闭" onClick={onClose}>
          <X />
        </Button>
      </div>
      {person.summary ? <p className="mt-2 text-sm leading-relaxed">{person.summary}</p> : null}
      {person.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {person.tags.map((t) => (
            <TagChip key={t.id} name={t.name} kind={t.kind} />
          ))}
        </div>
      ) : null}
      <div className="mt-3 space-y-2 border-t pt-3">
        <AppendInput personId={person.id} personName={person.name} compact onApplied={onAppended} />
        <Button variant="outline" size="sm" className="w-full" nativeButton={false} render={<Link href={`/people/${person.id}`} />}>
          查看详情
        </Button>
      </div>
    </div>
  );
}
