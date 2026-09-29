"use client";

import * as React from "react";
import { cn } from "cn";

export type FilterOption = { value: string; label: string; count?: number; hint?: string };

type Props = {
  options: FilterOption[];
  /** Label of the empty choice, e.g. 「全部标签」. */
  allLabel: string;
  "aria-label": string;
  /**
   * Form mode: writes the chosen value into a hidden input with this name and
   * submits the surrounding GET form, like the native select it replaces.
   */
  name?: string;
  defaultValue?: string;
  /** Controlled mode: used when `name` is not set. */
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
};

/** Search box over a finite option list; typing only filters, never creates values. */
export function FilterCombobox({
  options: rawOptions,
  allLabel,
  "aria-label": ariaLabel,
  name,
  defaultValue,
  value,
  onValueChange,
  className,
}: Props) {
  const [formValue, setFormValue] = React.useState(defaultValue ?? "");
  const [prevDefault, setPrevDefault] = React.useState(defaultValue ?? "");
  if ((defaultValue ?? "") !== prevDefault) {
    setPrevDefault(defaultValue ?? "");
    setFormValue(defaultValue ?? "");
  }
  const selected = name ? formValue : (value ?? "");
  const selectedLabel = selected ? (rawOptions.find((o) => o.value === selected)?.label ?? selected) : "";
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(selectedLabel);
  const [dirty, setDirty] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const hiddenRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();

  const options = React.useMemo<FilterOption[]>(() => {
    const all: FilterOption[] = [{ value: "", label: allLabel }, ...rawOptions];
    const needle = dirty ? query.trim().toLowerCase() : "";
    if (!needle) return all;
    const hits = all.filter((o) => o.value !== "" && o.label.toLowerCase().includes(needle));
    const starts = (o: FilterOption) => (o.label.toLowerCase().startsWith(needle) ? 0 : 1);
    return hits.sort((a, b) => starts(a) - starts(b));
  }, [rawOptions, allLabel, query, dirty]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function openList() {
    setQuery(selectedLabel);
    setDirty(false);
    setActive(0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setDirty(false);
    setQuery(selectedLabel);
  }

  function pick(option: FilterOption) {
    setQuery(option.value ? option.label : "");
    setOpen(false);
    setDirty(false);
    if (name) {
      const hidden = hiddenRef.current;
      if (!hidden) return;
      hidden.value = option.value;
      setFormValue(option.value);
      hidden.form?.requestSubmit();
    } else {
      onValueChange?.(option.value);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (options.length ? (i + delta + options.length) % options.length : 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = options[active];
      if (option) pick(option);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name ? <input ref={hiddenRef} type="hidden" name={name} value={formValue} readOnly /> : null}
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={`${allLabel}（输入搜索）`}
        value={open ? query : selectedLabel}
        onFocus={(e) => {
          openList();
          e.currentTarget.select();
        }}
        onClick={() => {
          if (!open) openList();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setDirty(true);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          {options.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">没有匹配的选项</li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.value || "__all"}
                data-index={index}
                role="option"
                aria-selected={option.value === selected}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5",
                  index === active && "bg-accent text-accent-foreground",
                  option.value === selected && "font-medium",
                )}
              >
                <span className="truncate">
                  {option.label}
                  {option.count !== undefined ? `（${option.count}）` : null}
                </span>
                {option.hint ? <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
