"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2 } from "lucide-react";

import { DraftCard } from "@/components/draft-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { ApiInboxParseResult } from "@/lib/types";

/**
 * "追加一句" on the person detail page (design.md §11, scenario B). The text
 * goes through the same inbox pipeline with a `person_id` hint, so the LLM is
 * forced into "update this person" mode; the draft is confirmed inline.
 */
export function AppendInput({ personId, personName }: { personId: string; personName: string }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<ApiInboxParseResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const submit = async () => {
    const raw = text.trim();
    if (!raw) return;
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      const parsed = await apiFetch<ApiInboxParseResult>("/api/v1/inbox", {
        method: "POST",
        body: { raw_text: raw, source: "web", person_id: personId },
      });
      setResult(parsed);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`追加一句关于 ${personName} 的事，例如「上周帮我修了球拍」`}
          className="h-10 text-base md:text-sm"
        />
        <Button type="submit" size="icon-lg" disabled={!text.trim() || loading} aria-label="提交">
          {loading ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {done ? <p className="text-sm text-emerald-700">{done}</p> : null}
      {result ? (
        <DraftCard
          inboxId={result.inbox.id}
          rawText={result.inbox.raw_text}
          initialDraft={result.draft}
          candidates={result.candidates}
          error={result.error}
          allowReparse={false}
          onApplied={() => {
            setResult(null);
            setText("");
            setDone("已追加。");
            router.refresh();
          }}
          onDiscarded={() => {
            setResult(null);
            setText("");
          }}
        />
      ) : null}
    </div>
  );
}
