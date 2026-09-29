"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";

import { DraftCard } from "@/components/draft-card";
import { SearchResults } from "@/components/search-results";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  buildSubmission,
  findNextPlaceholder,
  hasPlaceholder,
  type OmniboxTemplate,
  RECORD_TEMPLATES,
} from "@/lib/omnibox/templates";
import type { ApiInboxApplyResult, ApiInboxParseResult } from "@/lib/types";

type State =
  | { kind: "idle" }
  | { kind: "loading"; text: string }
  | { kind: "parsed"; result: ApiInboxParseResult }
  | { kind: "applied"; result: ApiInboxApplyResult }
  | { kind: "discarded" }
  | { kind: "failed"; message: string };

const PLACEHOLDER = "记一个人、追加一句，或者找人。例如：今天球馆认识小王，羽毛球教练，深圳…";

/**
 * The single entry point (design.md §3 #2, §11): record, update and query all
 * start here. The model decides the intent. Fill-in templates sit under the
 * box; `+` / `?` prefixes still force record or query.
 * Results expand in place — draft card, search results or a candidate picker.
 */
export function UniversalInput() {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [image, setImage] = React.useState<File | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pendingSelection = React.useRef<{ start: number; end: number } | null>(null);

  const clearImage = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImage(null);
    setImageUrl(null);
  };

  // Apply a selection requested by a template insert once React has flushed the new text.
  React.useEffect(() => {
    const sel = pendingSelection.current;
    const el = textareaRef.current;
    if (!sel || !el) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(sel.start, sel.end);
  }, [text]);

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

  const submission = buildSubmission(text, "auto");
  const canSubmit = (submission.length > 0 || image !== null) && state.kind !== "loading";

  const takeImage = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setState({ kind: "failed", message: "只支持 jpg、png、webp、gif 图片" });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setState({ kind: "failed", message: "图片不能超过 4MB" });
      return;
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImage(file);
    setImageUrl(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (!canSubmit) return;
    const shown = submission.replace(/^[+＋?？]/, "") || "这张图片";
    setState({ kind: "loading", text: shown });
    try {
      const result = image
        ? await apiFetch<ApiInboxParseResult>("/api/v1/inbox", {
            method: "POST",
            form: (() => {
              const form = new FormData();
              form.set("raw_text", submission);
              form.set("source", "web");
              form.set("image", image);
              return form;
            })(),
          })
        : await apiFetch<ApiInboxParseResult>("/api/v1/inbox", {
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
    clearImage();
    setState({ kind: "idle" });
    textareaRef.current?.focus();
  };

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border bg-card p-3 shadow-xs">
        {imageUrl ? (
          <div className="mb-2 flex items-center gap-2">
            <div
              role="img"
              aria-label="待识别的图片"
              className="h-16 w-16 shrink-0 rounded-md border bg-cover bg-center"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{image?.name || "粘贴的图片"}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="移除图片" onClick={clearImage}>
              <X />
            </Button>
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            takeImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const file = Array.from(e.clipboardData.files).find((item) => item.type.startsWith("image/"));
            if (!file) return;
            e.preventDefault();
            takeImage(file);
          }}
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
          rows={text.includes("\n") ? 7 : 2}
          placeholder={PLACEHOLDER}
          className="min-h-16 resize-none border-0 bg-transparent p-1 text-base shadow-none focus-visible:ring-0 md:text-base"
          autoFocus
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="上传图片"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus />
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {hasPlaceholder(text) ? (
                <>Tab 跳到下一个【】，没填的空会自动忽略。</>
              ) : (
                <>
                  回车提交。可粘贴名片或聊天截图。<span className="font-mono">+</span> 强制记录，
                  <span className="font-mono">?</span> 强制查询。
                </>
              )}
            </p>
          </div>
          <Button size="icon" onClick={submit} disabled={!canSubmit} aria-label="提交">
            {state.kind === "loading" ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>

      {state.kind === "idle" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">模板：</span>
          {RECORD_TEMPLATES.map((chip) => (
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
