import Link from "next/link";
import { MapPin } from "lucide-react";

import { TagChip } from "@/components/tag-chip";
import { TierBadge } from "@/components/tier-badge";
import { formatRelative, truncate } from "@/lib/format";
import type { ApiPerson } from "@/lib/types";

/**
 * List item for a person. Shows the objective summary only — `impression`
 * is private and appears on the detail page (decision on design.md §19 Q4).
 */
export function PersonCard({
  person,
  footer,
  className,
}: {
  person: ApiPerson;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={`/people/${person.id}`}
      className={`block rounded-xl border bg-card p-3.5 transition-colors hover:bg-muted/50 active:bg-muted ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{person.name}</span>
            <TierBadge tier={person.tier} />
            {person.location ? (
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                <MapPin className="size-3" />
                {person.location}
              </span>
            ) : null}
          </div>
          {person.summary ? (
            <p className="mt-1 text-sm text-muted-foreground">{truncate(person.summary, 80)}</p>
          ) : null}
        </div>
        {person.last_contact_at ? (
          <span className="shrink-0 text-[11px] text-muted-foreground" title="最近联系">
            {formatRelative(person.last_contact_at)}
          </span>
        ) : null}
      </div>
      {person.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {person.tags.slice(0, 8).map((tag) => (
            <TagChip key={tag.id} name={tag.name} kind={tag.kind} />
          ))}
          {person.tags.length > 8 ? (
            <span className="text-xs text-muted-foreground">+{person.tags.length - 8}</span>
          ) : null}
        </div>
      ) : null}
      {footer}
    </Link>
  );
}
