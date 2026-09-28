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
import type { ApiInboxApplyResult, ApiInboxParseResult } from "@/lib/types";

type State =
  | { kind: "idle" }
  | { kind: "loading"; text: string }
  | { kind: "parsed"; result: ApiInboxParseResult }
  | { kind: "applied"; result: ApiInboxApplyResult }
  | { kind: "discarded" }
  | { kind: "failed"; message: string };

const EXAMPLES = [
  "今天球馆认识小王，羽毛球教练，深圳，微信 wx123，人很热情",
  "小王上周帮我修了球拍",
  "想找个人教我打羽毛球",
];

/**
 * The single entry point (design.md §3 #2, §11): record, update and query all
 * start here. Results expand in place — draft card, search results or a
 * candidate picker — never on another page.
 */
export function UniversalInput() {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const raw = text.trim();
    if (!raw) return;
    setState({ kind: "loading", text: raw });
    try {
      const result = await apiFetch<ApiInboxParseResult>("/api/v1/inbox", {
        method: "POST",
        body: { raw_text: raw, source: "web" },
      });
      setState({ kind: "parsed", result });
      if (result.draft.intent !== "query") router.refresh();
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
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          placeholder="记一个人、追加一句，或者找人。例如：今天球馆认识小王，羽毛球教练，深圳…"
          className="min-h-16 resize-none border-0 bg-transparent p-1 text-base shadow-none focus-visible:ring-0 md:text-base"
          autoFocus
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            回车提交，Shift+回车换行。<span className="font-mono">+</span> 开头强制记录，
            <span className="font-mono">?</span> 开头强制查询。
          </p>
          <Button size="icon" onClick={submit} disabled={!text.trim() || state.kind === "loading"} aria-label="提交">
            {state.kind === "loading" ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>

      {state.kind === "idle" ? (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {example}
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
