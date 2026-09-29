import Link from "next/link";

import { FilterCombobox } from "@/components/filter-combobox";
import { TagFilterCombobox } from "@/components/tag-filter-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TIER_LABEL, TIER_VALUES } from "@/lib/schemas/enums";
import type { ApiTagWithCount } from "@/lib/types";

export type PeopleFilterValues = {
  tier?: string;
  tag?: string;
  location?: string;
  q?: string;
};

/**
 * Plain GET form so filters live in the URL, work without JavaScript and are
 * shareable. Server-rendered on purpose.
 */
export function PeopleFilters({ values, tags }: { values: PeopleFilterValues; tags: ApiTagWithCount[] }) {
  const hasAny = Boolean(values.tier || values.tag || values.location || values.q);
  return (
    <form method="get" action="/people#all" className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
      <FilterCombobox
        name="tier"
        defaultValue={values.tier}
        allLabel="全部关系"
        aria-label="关系远近"
        options={TIER_VALUES.map((t) => ({ value: t, label: TIER_LABEL[t] }))}
      />
      <TagFilterCombobox tags={tags} defaultValue={values.tag} />
      <Input name="q" defaultValue={values.q ?? ""} placeholder="关键词：姓名 / 摘要 / 印象" className="h-9" />
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <Button type="submit" size="lg" className="flex-1 sm:flex-none">
          筛选
        </Button>
        {hasAny ? (
          <Button variant="ghost" size="lg" nativeButton={false} render={<Link href="/people" />}>
            清除
          </Button>
        ) : null}
      </div>
    </form>
  );
}
