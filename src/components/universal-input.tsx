"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, CheckCircle2, Loader2 } from "lucide-react";

import { DraftCard } from "@/components/draft-card";
import { SearchResults } from "@/components/search-results";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  buildSubmission,
  findNextPlaceholder,
  hasPlaceholder,
  isOmniboxMode,
  OMNIBOX_MODE_STORAGE_KEY,
  OMNIBOX_MODES,
  type OmniboxMode,
  type OmniboxTemplate,
  QUERY_TEMPLATES,
  RECORD_TEMPLATES,
} from "@/lib/omnibox/templates";
import type { ApiInboxApplyResult, ApiInboxParseResult } from "@/lib/types";
import { cn } from "cn";

type State =
  | { kind: "idle" }
  | { kind: "loading"; text: string }
  | { kind: "parsed"; result: ApiInboxParseResult }
  | { kind: "applied"; result: ApiInboxApplyResult }
  | { kind: "discarded" }
  | { kind: "failed"; message: string };

const AUTO_EXAMPLES: OmniboxTemplate[] = [
  { label: "今天球馆认识小王，羽毛球教练，深圳，微信 wx123，人很热情", text: "今天球馆认识小王，羽毛球教练，深圳，微信 wx123，人很热情" },
  { label: "小王上周帮我修了球拍", text: "小王上周帮我修了球拍" },
  { label: "想找个人教我打羽毛球", text: "想找个人教我打羽毛球" },
];

function chipsForMode(mode: OmniboxMode): OmniboxTemplate[] {
  if (mode === "record") return RECORD_TEMPLATES;
  if (mode === "query") return QUERY_TEMPLATES;
  return AUTO_EXAMPLES;
}

// The chosen mode lives in localStorage; exposed as an external store so the
// server renders "auto" and the client re-renders with the saved value without
// a hydration mismatch.
const modeListeners = new Set<() => void>();
function subscribeMode(listener: () => void) {
  modeListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    modeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
let memoryMode: OmniboxMode | null = null;
function readStoredMode(): OmniboxMode {
  if (memoryMode) return memoryMode;
  try {
    const saved = window.localStorage.getItem(OMNIBOX_MODE_STORAGE_KEY);
    return isOmniboxMode(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}
function writeStoredMode(mode: OmniboxMode) {
  memoryMode = mode;
  try {
    window.localStorage.setItem(OMNIBOX_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable (private mode etc.) — the mode lives in memory for this page only.
  }
  for (const listener of modeListeners) listener();
}
const serverMode = (): OmniboxMode => "auto";

/**
 * The single entry point (design.md §3 #2, §11): record, update and query all
 * start here. Results expand in place — draft card, search results or a
 * candidate picker — never on another page.
 *
 * A mode switch (自动 / 记人 / 找人) forces the intent the same way the `+` / `?`
 * prefixes do, and 记人 mode offers fill-in templates with 【】 blanks.
 */
export function UniversalInput() {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const mode = React.useSyncExternalStore(subscribeMode, readStoredMode, serverMode);
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const pendingSelection = React.useRef<{ start: number; end: number } | null>(null);

  // Apply a selection requested by a template insert once React has flushed the new text.
  React.useEffect(() => {
    const sel = pendingSelection.current;
    const el = textareaRef.current;
    if (!sel || !el) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(sel.start, sel.end);
  }, [text]);

  const changeMode = (next: OmniboxMode) => {
    writeStoredMode(next);
    textareaRef.current?.focus();
  };

  const selectPlaceholder = (source: string, from: number) => {
    const next = findNextPlaceholder(source, from);
    if (next) pendingSelection.current = next;
  };

  const insertTemplate = (template: OmniboxTemplate) => {
    setText(template.text);
    selectPlaceholder(template.text, 0);
    if (!hasPlaceholder(template.text)) {
      pendingSelection.current = { start: template.text.length, end: template.text.length };
    }
  };

  const submission = buildSubmission(text, mode);
  const canSubmit = submission.length > 0 && state.kind !== "loading";
  const modeMeta = OMNIBOX_MODES.find((m) => m.value === mode) ?? OMNIBOX_MODES[0];

  const submit = async () => {
    if (!canSubmit) return;
    setState({ kind: "loading", text: submission.replace(/^[+＋?？]/, "") });
    try {
      const result = await apiFetch<ApiInboxParseResult>("/api/v1/inbox", {
        method: "POST",
        body: { raw_text: submission, source: "web" },
      });
      setState({ kind: "parsed", result });
    } catch (err) {
      setState({ kind: "failed", message: errorMessage(err) });
    }
  };

  const reset = () => {
    setText("");
    setState({ kind: "idle" });
    textareaRef.current?.focus();
  };

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border bg-card p-3 shadow-xs">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="输入模式" className="inline-flex rounded-lg border p-0.5 text-xs">
            {OMNIBOX_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="tab"
                aria-selected={mode === m.value}
                onClick={() => changeMode(m.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-muted-foreground transition-colors",
                  mode === m.value && "bg-primary text-primary-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {mode === "auto" ? "由模型判断是记还是找" : mode === "record" ? "这次一定当作记录" : "这次一定当作找人"}
          </p>
        </div>
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
              return;
            }
            if (e.key === "Tab" && !e.shiftKey && hasPlaceholder(text)) {
              const el = e.currentTarget;
              const next = findNextPlaceholder(text, el.selectionEnd);
              if (next) {
                e.preventDefault();
                el.setSelectionRange(next.start, next.end);
              }
            }
          }}
          rows={mode === "record" && text.includes("\n") ? 7 : 2}
          placeholder={modeMeta.hint}
          className="min-h-16 resize-none border-0 bg-transparent p-1 text-base shadow-none focus-visible:ring-0 md:text-base"
          autoFocus
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {hasPlaceholder(text) ? (
              <>
                Tab 跳到下一个【】，没填的空会自动忽略。
              </>
            ) : mode === "auto" ? (
              <>
                回车提交，Shift+回车换行。<span className="font-mono">+</span> 开头强制记录，
                <span className="font-mono">?</span> 开头强制查询。
              </>
            ) : (
              <>回车提交，Shift+回车换行。</>
            )}
          </p>
          <Button size="icon" onClick={submit} disabled={!canSubmit} aria-label="提交">
            {state.kind === "loading" ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>

      {state.kind === "idle" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {mode !== "auto" ? <span className="text-[11px] text-muted-foreground">{mode === "record" ? "模板：" : "例如："}</span> : null}
          {chipsForMode(mode).map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => insertTemplate(chip)}
              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      {state.kind === "loading" ? (
        <p className="text-sm text-muted-foreground">正在理解「{state.text}」…</p>
      ) : null}

      {state.kind === "failed" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {state.message}
          <Button variant="ghost" size="sm" className="ml-2" onClick={reset}>
            重试
          </Button>
        </div>
      ) : null}

      {state.kind === "parsed" && state.result.draft.intent === "query" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">找人结果</h3>
            <Button variant="ghost" size="sm" onClick={reset}>
              清除
            </Button>
          </div>
          {state.result.results ? <SearchResults results={state.result.results} /> : null}
        </div>
      ) : null}

      {state.kind === "parsed" && state.result.draft.intent !== "query" ? (
        <DraftCard
          inboxId={state.result.inbox.id}
          rawText={state.result.inbox.raw_text}
          initialDraft={state.result.draft}
          candidates={state.result.candidates}
          error={state.result.error}
          onApplied={(result) => {
            setState({ kind: "applied", result });
            setText("");
            router.refresh();
          }}
          onDiscarded={() => {
            setState({ kind: "discarded" });
            setText("");
            router.refresh();
          }}
          onReparsed={(result) => setState({ kind: "parsed", result })}
        />
      ) : null}

      {state.kind === "applied" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="size-4" />
          已记录：
          <Link href={`/people/${state.result.person.id}`} className="font-medium underline underline-offset-2">
            {state.result.person.name}
          </Link>
          <span className="text-emerald-800/70">
            {[state.result.person.location, state.result.person.summary].filter(Boolean).join(" / ")}
          </span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
            继续记
          </Button>
        </div>
      ) : null}

      {state.kind === "discarded" ? (
        <div className="flex items-center gap-2 rounded-xl border p-3 text-sm text-muted-foreground">
          已丢弃这条记录。
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
            继续
          </Button>
        </div>
      ) : null}
    </section>
  );
}
