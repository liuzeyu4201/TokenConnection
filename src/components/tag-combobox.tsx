"use client";

import * as React from "react";
import Link from "next/link";

import { TagChip } from "@/components/tag-chip";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import type { TagKind } from "@/lib/schemas/enums";

export type TagOption = { name: string; kind: TagKind };

export const TAGS_SETTINGS_HREF = "/tags";

/** Client-side fetch of the vocabulary for forms that are not server-rendered with it. */
export function useTagVocabulary(): TagOption[] {
  const [items, setItems] = React.useState<TagOption[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: TagOption[] }>("/api/v1/tags")
      .then((res) => {
        if (!cancelled) setItems(res.items.map(({ name, kind }) => ({ name, kind })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return items;
}

function matches(option: TagOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || option.name.toLowerCase().includes(q);
}

/**
 * Search box over a fixed list of circles or tags. Only listed options can be
 * picked; typing a new name never creates one (they are defined in settings).
 */
export function TagCombobox<T extends TagOption>({
  options,
  onPick,
  placeholder,
  noun,
  disabled,
  className,
}: {
  options: T[];
  onPick: (option: T) => void;
  placeholder: string;
  /** 圈子 / 标签, used in the "not found" hint. */
  noun: string;
  disabled?: boolean;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const filtered = options.filter((o) => matches(o, query));

  const pick = (option: T) => {
    onPick(option);
    setQuery("");
    setActive(0);
    setOpen(false);
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <Input
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        className="h-8"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const option = filtered[active];
            if (open && option) pick(option);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover text-sm shadow-md">
          {filtered.length > 0 ? (
            <ul role="listbox">
              {filtered.map((option, i) => (
                <li key={`${option.kind}-${option.name}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    className={`flex w-full items-center px-3 py-1.5 text-left ${i === active ? "bg-muted" : "hover:bg-muted"}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(option)}
                  >
                    {option.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {query.trim() ? `没有「${query.trim()}」这个${noun}。` : `没有可选的${noun}。`}
              新{noun}要先在{" "}
              <Link href={TAGS_SETTINGS_HREF} className="underline" onMouseDown={(e) => e.preventDefault()}>
                设置 › 圈子和标签
              </Link>{" "}
              里添加。
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SettingsHint({ noun }: { noun: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      还没有{noun}，请先在{" "}
      <Link href={TAGS_SETTINGS_HREF} className="underline underline-offset-2">
        设置 › 圈子和标签
      </Link>{" "}
      里添加。
    </span>
  );
}

/** One circle per person, chosen from the circles defined in settings. */
export function CirclePicker<T extends TagOption>({
  circles,
  value,
  onChange,
  disabled,
}: {
  circles: T[];
  value: T | null;
  onChange: (circle: T | null) => void;
  disabled?: boolean;
}) {
  if (circles.length === 0 && !value) return <SettingsHint noun="圈子" />;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      {value ? (
        <TagChip name={value.name} kind="circle" onRemove={disabled ? undefined : () => onChange(null)} />
      ) : (
        <span className="text-xs text-muted-foreground">未分类</span>
      )}
      <TagCombobox
        className="min-w-40 flex-1"
        options={circles.filter((c) => c.name !== value?.name)}
        onPick={onChange}
        placeholder={value ? "搜索并换一个圈子" : "搜索并选择圈子"}
        noun="圈子"
        disabled={disabled}
      />
    </div>
  );
}

/** Searchable tags (skill / other), chosen from the tags defined in settings. */
export function LabelsPicker({
  options,
  value,
  onChange,
  disabled,
  chipHref,
}: {
  options: TagOption[];
  value: TagOption[];
  onChange: (labels: TagOption[]) => void;
  disabled?: boolean;
  chipHref?: (tag: TagOption) => string;
}) {
  const chosen = new Set(value.map((t) => `${t.kind}\u0000${t.name}`));
  const available = options.filter((o) => !chosen.has(`${o.kind}\u0000${o.name}`));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <TagChip
            key={`${tag.kind}-${tag.name}`}
            name={tag.name}
            kind={tag.kind}
            href={chipHref?.(tag)}
            onRemove={disabled ? undefined : () => onChange(value.filter((t) => t !== tag))}
          />
        ))}
        {value.length === 0 ? <span className="text-xs text-muted-foreground">暂无标签</span> : null}
      </div>
      {options.length === 0 ? (
        <SettingsHint noun="标签" />
      ) : (
        <TagCombobox
          options={available}
          onPick={(tag) => onChange([...value, tag])}
          placeholder="搜索并添加标签，例如 羽毛球"
          noun="标签"
          disabled={disabled}
        />
      )}
    </div>
  );
}
