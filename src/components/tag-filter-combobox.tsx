"use client";

import { FilterCombobox } from "@/components/filter-combobox";
import type { ApiTagWithCount } from "@/lib/types";

/** Tag search box for the people filter bar; writes `tag` and submits the GET form. */
export function TagFilterCombobox({ tags, defaultValue }: { tags: ApiTagWithCount[]; defaultValue?: string }) {
  return (
    <FilterCombobox
      name="tag"
      defaultValue={defaultValue}
      allLabel="全部标签"
      aria-label="标签"
      options={tags.map((t) => ({
        value: t.name,
        label: t.name,
        count: t.people_count,
        hint: t.kind === "circle" ? "圈子" : undefined,
      }))}
    />
  );
}
