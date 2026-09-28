"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";

import { TagChip } from "@/components/tag-chip";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { resolvePrimaryCircle } from "@/lib/map/primary-circle";
import type { ApiTag } from "@/lib/types";

/**
 * Circle tags of one person with the primary one marked. When the person has
 * two or more circles, the others offer "设为主圈子" (design.md §19 Q2).
 */
export function PrimaryCirclePicker({
  personId,
  tags,
  primaryCircleTagId,
}: {
  personId: string;
  tags: ApiTag[];
  primaryCircleTagId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const circles = tags.filter((t) => t.kind === "circle");
  const primary = resolvePrimaryCircle(primaryCircleTagId, circles);
  if (circles.length === 0) return null;

  const setPrimary = async (tagId: string) => {
    setBusy(tagId);
    setError(null);
    try {
      await apiFetch(`/api/v1/people/${personId}`, { method: "PATCH", body: { primary_circle_tag_id: tagId } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-8 text-xs text-muted-foreground">圈子</span>
        {circles.map((t) => {
          const isPrimary = primary?.id === t.id;
          return (
            <span key={t.id} className="inline-flex items-center gap-1">
              <Link href={`/people?tag=${encodeURIComponent(t.name)}`}>
                <TagChip name={t.name} kind={t.kind} className={isPrimary ? "ring-1 ring-emerald-400" : ""} />
              </Link>
              {isPrimary ? (
                <Star className="size-3.5 fill-amber-400 text-amber-500" aria-label="主圈子" />
              ) : circles.length >= 2 ? (
                <Button variant="ghost" size="xs" className="h-5 px-1 text-[11px]" disabled={busy !== null} onClick={() => void setPrimary(t.id)}>
                  {busy === t.id ? "设置中…" : "设为主圈子"}
                </Button>
              ) : null}
            </span>
          );
        })}
      </div>
      {circles.length >= 2 ? (
        <p className="pl-8 text-[11px] text-muted-foreground">
          带星号的是主圈子，决定这个人在同心圆地图上落在哪个扇区
          {!primaryCircleTagId ? "（未指定时按名称取第一个）" : ""}。
        </p>
      ) : null}
      {error ? <p className="pl-8 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
