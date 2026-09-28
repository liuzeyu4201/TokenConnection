import Link from "next/link";

import { NativeSelect } from "@/components/native-select";
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
    <form method="get" action="/people" className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_1.5fr_auto]">
      <NativeSelect name="tier" defaultValue={values.tier ?? ""} aria-label="关系远近">
        <option value="">全部关系</option>
        {TIER_VALUES.map((t) => (
          <option key={t} value={t}>
            {TIER_LABEL[t]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect name="tag" defaultValue={values.tag ?? ""} aria-label="标签">
        <option value="">全部标签</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.name}>
            {tag.name}（{tag.people_count}）
          </option>
        ))}
      </NativeSelect>
      <Input name="location" defaultValue={values.location ?? ""} placeholder="所在地" className="h-9" />
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
