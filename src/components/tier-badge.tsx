import { cn } from "cn";

import { TIER_LABEL, type Tier } from "@/lib/schemas/enums";

const TIER_CLASSES: Record<Tier, string> = {
  best_bros: "bg-rose-100 text-rose-800 ring-rose-200",
  close_friends: "bg-orange-100 text-orange-800 ring-orange-200",
  friends: "bg-amber-100 text-amber-800 ring-amber-200",
  interacted: "bg-sky-100 text-sky-800 ring-sky-200",
  known_of: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        TIER_CLASSES[tier],
        className,
      )}
      title="关系远近"
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
