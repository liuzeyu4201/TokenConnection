"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { CirclePicker, LabelsPicker, type TagOption } from "@/components/tag-combobox";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { resolvePrimaryCircle } from "@/lib/map/primary-circle";
import type { ApiTag } from "@/lib/types";

function usePersonTagsSaver(personId: string) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async (tags: TagOption[]) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/people/${personId}`, {
        method: "PATCH",
        body: { tags: tags.map((t) => ({ name: t.name, kind: t.kind })) },
      });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, save };
}

/**
 * One circle per person: the sector on the radial map. Picked from the
 * circles defined in settings; never created here.
 */
export function CircleField({
  personId,
  tags,
  primaryCircleTagId,
  circles,
}: {
  personId: string;
  tags: ApiTag[];
  primaryCircleTagId: string | null;
  circles: ApiTag[];
}) {
  const current = resolvePrimaryCircle(primaryCircleTagId, tags.filter((t) => t.kind === "circle"));
  const { busy, error, save } = usePersonTagsSaver(personId);
  const labels = tags.filter((t) => t.kind !== "circle");

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <span className="w-8 shrink-0 pt-1.5 text-xs text-muted-foreground">圈子</span>
        <CirclePicker
          circles={circles}
          value={current}
          disabled={busy}
          onChange={(circle) => {
            if (circle?.id === current?.id) return;
            void save(circle ? [...labels, circle] : labels);
          }}
        />
      </div>
      <p className="pl-10 text-[11px] text-muted-foreground">一个人一个圈子，用来在地图上分扇区。</p>
      {error ? <p className="pl-10 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Searchable tags, picked from the tags defined in settings. */
export function LabelsField({
  personId,
  tags,
  primaryCircleTagId,
  options,
}: {
  personId: string;
  tags: ApiTag[];
  primaryCircleTagId: string | null;
  options: ApiTag[];
}) {
  const circle = resolvePrimaryCircle(primaryCircleTagId, tags.filter((t) => t.kind === "circle"));
  const { busy, error, save } = usePersonTagsSaver(personId);

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <span className="w-8 shrink-0 pt-1 text-xs text-muted-foreground">标签</span>
        <div className="min-w-0 flex-1">
          <LabelsPicker
            options={options}
            value={tags.filter((t) => t.kind !== "circle")}
            disabled={busy}
            chipHref={(t) => `/people?tag=${encodeURIComponent(t.name)}`}
            onChange={(labels) => void save(circle ? [...labels, circle] : labels)}
          />
        </div>
      </div>
      {error ? <p className="pl-10 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
