"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { resolvePrimaryCircle } from "@/lib/map/primary-circle";
import type { ApiTag } from "@/lib/types";

/**
 * One circle per person: the sector on the radial map. Other labels are tags.
 */
export function CircleField({
  personId,
  tags,
  primaryCircleTagId,
}: {
  personId: string;
  tags: ApiTag[];
  primaryCircleTagId: string | null;
}) {
  const router = useRouter();
  const current = resolvePrimaryCircle(primaryCircleTagId, tags.filter((t) => t.kind === "circle"));
  const [name, setName] = React.useState(current?.name ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    const next = name.trim();
    if (next === (current?.name ?? "")) return;
    setBusy(true);
    setError(null);
    const labels = tags.filter((t) => t.kind !== "circle").map((t) => ({ name: t.name, kind: t.kind }));
    try {
      await apiFetch(`/api/v1/people/${personId}`, {
        method: "PATCH",
        body: { tags: next ? [...labels, { name: next, kind: "circle" }] : labels },
      });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <span className="w-8 shrink-0 text-xs text-muted-foreground">圈子</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="一个，例如 球友 / 大学同学"
          className="h-8"
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy || name.trim() === (current?.name ?? "")}>
          {busy ? "保存中…" : "保存"}
        </Button>
      </form>
      <p className="pl-10 text-[11px] text-muted-foreground">一个人一个圈子，用来在地图上分扇区。</p>
      {error ? <p className="pl-10 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
