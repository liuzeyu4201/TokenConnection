import { PersonCard } from "@/components/person-card";
import { reasonLabel } from "@/lib/format";
import type { ApiSearchResponse } from "@/lib/types";

export function SearchResults({ results }: { results: ApiSearchResponse }) {
  if (results.hits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        没有找到和「{results.query}」相关的人。
        {results.semantic_skipped ? "（语义检索暂不可用，只用了关键词）" : ""}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        找到 {results.hits.length} 人，按「语义 × 关系远近 × 关键词」排序
        {results.semantic_skipped ? "（语义检索暂不可用，只用了关键词）" : ""}
      </p>
      {results.hits.map((hit) => (
        <PersonCard
          key={hit.person.id}
          person={hit.person}
          footer={
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{hit.score.toFixed(2)}</span>
              {hit.reasons.map((reason) => (
                <span key={reason} className="rounded border px-1.5 py-0.5">
                  {reasonLabel(reason)}
                </span>
              ))}
            </div>
          }
        />
      ))}
    </div>
  );
}
