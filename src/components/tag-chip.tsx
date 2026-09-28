import { cn } from "cn";

import { TAG_KIND_LABEL, type TagKind } from "@/lib/schemas/enums";

const KIND_CLASSES: Record<TagKind, string> = {
  skill: "border-indigo-200 bg-indigo-50 text-indigo-700",
  circle: "border-emerald-200 bg-emerald-50 text-emerald-700",
  other: "border-gray-200 bg-gray-50 text-gray-700",
};

export function TagChip({
  name,
  kind,
  className,
  onRemove,
}: {
  name: string;
  kind: TagKind;
  className?: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs whitespace-nowrap",
        KIND_CLASSES[kind],
        className,
      )}
      title={TAG_KIND_LABEL[kind]}
    >
      {name}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 rounded px-0.5 leading-none opacity-60 hover:opacity-100"
          aria-label={`移除标签 ${name}`}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
