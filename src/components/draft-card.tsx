"use client";

import * as React from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";

import { NativeSelect } from "@/components/native-select";
import { TagChip } from "@/components/tag-chip";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { contactLabel, QUICK_CONTACT_KEYS } from "@/lib/format";
import type { Draft, DraftEvent, DraftTag } from "@/lib/schemas/draft";
import {
  EVENT_KIND_LABEL,
  EVENT_KIND_VALUES,
  GENDER_LABEL,
  GENDER_VALUES,
  TIER_LABEL,
  TIER_VALUES,
} from "@/lib/schemas/enums";
import type { ApiCandidate, ApiInboxApplyResult, ApiInboxParseResult } from "@/lib/types";

export const CONFIDENCE_THRESHOLD = 0.7;

function splitDraftTags(source: Draft): { circle: string; draft: Draft } {
  const circles = source.tags.filter((tag) => tag.kind === "circle");
  const rest = source.tags.filter((tag) => tag.kind !== "circle");
  const [keep, ...extra] = circles;
  return {
    circle: keep?.name ?? "",
    draft: {
      ...source,
      tags: [...rest, ...extra.map((tag) => ({ ...tag, kind: "other" as const }))],
    },
  };
}

type ContactRow = { key: string; value: string };

type Props = {
  inboxId: string;
  rawText: string;
  initialDraft: Draft;
  candidates: ApiCandidate[];
  /** Set when the LLM failed and this is the manual fallback form. */
  error?: string | null;
  allowReparse?: boolean;
  onApplied?: (result: ApiInboxApplyResult) => void;
  onDiscarded?: () => void;
  onReparsed?: (result: ApiInboxParseResult) => void;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toRows(contacts: Record<string, string>): ContactRow[] {
  return Object.entries(contacts).map(([key, value]) => ({ key, value }));
}

function toRecord(rows: ContactRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (key && value) out[key] = value;
  }
  return out;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-muted-foreground ${className ?? ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h4>;
}

export function DraftCard({
  inboxId,
  rawText,
  initialDraft,
  candidates,
  error,
  allowReparse = true,
  onApplied,
  onDiscarded,
  onReparsed,
}: Props) {
  const opened = splitDraftTags(initialDraft);
  const [draft, setDraft] = React.useState<Draft>(opened.draft);
  const [circle, setCircle] = React.useState(opened.circle);
  const [contacts, setContacts] = React.useState<ContactRow[]>(() => toRows(initialDraft.person.contacts ?? {}));
  const [newTag, setNewTag] = React.useState("");
  const [busy, setBusy] = React.useState<"apply" | "discard" | "reparse" | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  // Reset the editable copy when the parent hands over a new draft (reparse).
  const [seenDraft, setSeenDraft] = React.useState(initialDraft);
  if (seenDraft !== initialDraft) {
    const next = splitDraftTags(initialDraft);
    setSeenDraft(initialDraft);
    setDraft(next.draft);
    setCircle(next.circle);
    setContacts(toRows(initialDraft.person.contacts ?? {}));
    setMessage(null);
  }

  const isUpdate = draft.intent === "update";
  const needsTarget = isUpdate && !draft.target_person_id;
  const lowConfidence = isUpdate && draft.target_person_id && draft.target_confidence < CONFIDENCE_THRESHOLD;
  const showCandidates = candidates.length > 0 || isUpdate;
  const selected = candidates.find((c) => c.id === draft.target_person_id) ?? null;

  const setPerson = <K extends keyof Draft["person"]>(key: K, value: Draft["person"][K]) =>
    setDraft((d) => ({ ...d, person: { ...d.person, [key]: value } }));

  const text = (value: string) => (value.trim() === "" ? null : value);

  const pickCandidate = (candidate: ApiCandidate) => {
    setDraft((d) => ({ ...d, intent: "update", target_person_id: candidate.id, target_confidence: 1 }));
  };

  const setIntent = (intent: "add" | "update") => {
    setDraft((d) => ({
      ...d,
      intent,
      target_person_id: intent === "add" ? null : d.target_person_id,
      target_confidence: intent === "add" ? 0 : d.target_confidence,
    }));
  };

  const addTag = () => {
    const name = newTag.trim();
    if (!name) return;
    setDraft((d) => (d.tags.some((t) => t.name === name) ? d : { ...d, tags: [...d.tags, { name, kind: "skill" }] }));
    setNewTag("");
  };

  const updateEvent = (index: number, patch: Partial<DraftEvent>) =>
    setDraft((d) => ({ ...d, events: d.events.map((e, i) => (i === index ? { ...e, ...patch } : e)) }));

  const buildDraft = (): Draft => ({
    ...draft,
    person: { ...draft.person, contacts: toRecord(contacts) },
    tags: [
      ...draft.tags.filter((t) => t.kind !== "circle" && t.name.trim()),
      ...(circle.trim() ? [{ name: circle.trim(), kind: "circle" as const }] : []),
    ],
    events: draft.events.filter((e) => e.content.trim()),
  });

  const apply = async () => {
    setMessage(null);
    if (needsTarget) {
      setMessage("请先选择要更新的人，或切换为「新增」。");
      return;
    }
    if (!isUpdate && !draft.person.name?.trim()) {
      setMessage("请填写姓名。");
      return;
    }
    setBusy("apply");
    try {
      const result = await apiFetch<ApiInboxApplyResult>(`/api/v1/inbox/${inboxId}/apply`, {
        method: "POST",
        body: { draft: buildDraft() },
      });
      onApplied?.(result);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    setBusy("discard");
    setMessage(null);
    try {
      await apiFetch(`/api/v1/inbox/${inboxId}/discard`, { method: "POST" });
      onDiscarded?.();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const reparse = async () => {
    setBusy("reparse");
    setMessage(null);
    try {
      const result = await apiFetch<ApiInboxParseResult>(`/api/v1/inbox/${inboxId}/reparse`, { method: "POST" });
      onReparsed?.(result);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{isUpdate ? "更新已有的人" : "新增一个人"}</h3>
          <p className="mt-0.5 text-xs whitespace-pre-line text-muted-foreground">原文：{rawText.replace(/^[+＋?？]/, "")}</p>
        </div>
        <div className="inline-flex rounded-lg border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setIntent("add")}
            className={`rounded-md px-2.5 py-1 ${!isUpdate ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            新增
          </button>
          <button
            type="button"
            onClick={() => setIntent("update")}
            className={`rounded-md px-2.5 py-1 ${isUpdate ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            更新已有
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">自动解析失败，已为你准备好空表单，原文放在「摘要」里，请手动填写后入库。</p>
            <p className="mt-1 break-all opacity-80">{error}</p>
          </div>
        </div>
      ) : null}

      {showCandidates ? (
        <div className="space-y-2">
          <SectionTitle>{isUpdate ? "要更新的人" : "库里可能已有这个人"}</SectionTitle>
          {lowConfidence || needsTarget ? (
            <p className="text-xs text-amber-700">不太确定是哪一位，请点选确认。</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => {
              const active = c.id === draft.target_person_id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickCandidate(c)}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors ${
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{c.name}</span>
                  <TierBadge tier={c.tier} />
                  {c.location ? <span className="text-xs text-muted-foreground">{c.location}</span> : null}
                </button>
              );
            })}
            {candidates.length === 0 ? (
              <span className="text-xs text-muted-foreground">没有找到相似的人，可切换为「新增」。</span>
            ) : null}
          </div>
          {isUpdate && selected ? (
            <p className="text-xs text-muted-foreground">
              将追加到 <span className="font-medium text-foreground">{selected.name}</span>
              ；下面留空的字段保持原值，填写的字段会覆盖。
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={isUpdate ? "姓名（留空不改）" : "姓名 *"} className="col-span-2 sm:col-span-1">
          <Input
            value={draft.person.name ?? ""}
            onChange={(e) => setPerson("name", text(e.target.value))}
            placeholder="小王 / 老李"
          />
        </Field>
        <Field label="性别">
          <NativeSelect
            value={draft.person.gender ?? ""}
            onChange={(e) => setPerson("gender", (e.target.value || null) as Draft["person"]["gender"])}
          >
            <option value="">{isUpdate ? "不改" : "未知"}</option>
            {GENDER_VALUES.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABEL[g]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="关系远近">
          <NativeSelect
            value={draft.person.tier ?? ""}
            onChange={(e) => setPerson("tier", (e.target.value || null) as Draft["person"]["tier"])}
          >
            <option value="">{isUpdate ? "不改" : "未定（默认 People I know of）"}</option>
            {TIER_VALUES.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="所在地">
          <Input value={draft.person.location ?? ""} onChange={(e) => setPerson("location", text(e.target.value))} placeholder="深圳" />
        </Field>
        <Field label="怎么认识的" className="col-span-2 sm:col-span-1">
          <Input value={draft.person.how_met ?? ""} onChange={(e) => setPerson("how_met", text(e.target.value))} placeholder="球馆认识" />
        </Field>
        <Field label="认识日期">
          <Input type="date" value={draft.person.met_at ?? ""} onChange={(e) => setPerson("met_at", e.target.value || null)} />
        </Field>
        <Field label="摘要（他是谁、做什么）" className="col-span-2 sm:col-span-3">
          <Textarea
            rows={2}
            value={draft.person.summary ?? ""}
            onChange={(e) => setPerson("summary", text(e.target.value))}
            placeholder="羽毛球教练，在深圳带成人班"
          />
        </Field>
        <Field label="我的印象（私密）" className="col-span-2 sm:col-span-3">
          <Textarea
            rows={2}
            value={draft.person.impression ?? ""}
            onChange={(e) => setPerson("impression", text(e.target.value))}
            placeholder="人很热情，靠谱但话少"
          />
        </Field>
      </div>

      <div className="space-y-2">
        <SectionTitle>联系方式</SectionTitle>
        <div className="space-y-2">
          {contacts.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="w-28 shrink-0"
                value={row.key}
                placeholder="wechat"
                onChange={(e) => setContacts((rows) => rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
              />
              <Input
                value={row.value}
                placeholder="wx123"
                onChange={(e) => setContacts((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
              />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="删除联系方式" onClick={() => setContacts((rows) => rows.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_CONTACT_KEYS.map((key) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="xs"
              disabled={contacts.some((r) => r.key === key)}
              onClick={() => setContacts((rows) => [...rows, { key, value: "" }])}
            >
              <Plus /> {contactLabel(key)}
            </Button>
          ))}
          <Button type="button" variant="ghost" size="xs" onClick={() => setContacts((rows) => [...rows, { key: "", value: "" }])}>
            <Plus /> 自定义
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle>圈子和标签{isUpdate ? "（标签会追加）" : ""}</SectionTitle>
        <Input value={circle} onChange={(e) => setCircle(e.target.value)} placeholder="圈子，只填一个，例如 球友" />
        <div className="flex flex-wrap gap-1.5">
          {draft.tags.filter((tag) => tag.kind !== "circle").map((tag: DraftTag, i) => (
            <TagChip key={`${tag.kind}-${tag.name}-${i}`} name={tag.name} kind={tag.kind} onRemove={() => setDraft((d) => ({ ...d, tags: d.tags.filter((item) => item !== tag) }))} />
          ))}
          {draft.tags.every((tag) => tag.kind === "circle") ? <span className="text-xs text-muted-foreground">暂无标签</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newTag}
            placeholder="标签，例如 羽毛球"
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={addTag}>
            添加
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle>时间线事件</SectionTitle>
        <div className="space-y-2">
          {draft.events.map((event, i) => (
            <div key={i} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 sm:grid-cols-[7rem_1fr_9rem_auto]">
              <NativeSelect value={event.kind} onChange={(e) => updateEvent(i, { kind: e.target.value as DraftEvent["kind"] })}>
                {EVENT_KIND_VALUES.map((k) => (
                  <option key={k} value={k}>
                    {EVENT_KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
              <Input value={event.content} onChange={(e) => updateEvent(i, { content: e.target.value })} placeholder="发生了什么" />
              <Input
                type="date"
                className="col-span-2 sm:col-span-1"
                value={event.happened_at}
                onChange={(e) => updateEvent(i, { happened_at: e.target.value || todayIso() })}
              />
              <Button type="button" variant="ghost" size="icon-sm" className="col-start-3 row-start-1 sm:col-start-4" aria-label="删除事件" onClick={() => setDraft((d) => ({ ...d, events: d.events.filter((_, j) => j !== i) }))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {draft.events.length === 0 ? <p className="text-xs text-muted-foreground">暂无事件</p> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setDraft((d) => ({ ...d, events: [...d.events, { kind: "note", content: "", happened_at: todayIso() }] }))}
        >
          <Plus /> 添加事件
        </Button>
      </div>

      {message ? <p className="text-sm text-destructive">{message}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={busy !== null}>
            {busy === "discard" ? "丢弃中…" : "丢弃"}
          </Button>
          {allowReparse ? (
            <Button type="button" variant="ghost" size="sm" onClick={reparse} disabled={busy !== null}>
              {busy === "reparse" ? "解析中…" : "重新解析"}
            </Button>
          ) : null}
        </div>
        <Button type="button" onClick={apply} disabled={busy !== null}>
          {busy === "apply" ? "入库中…" : isUpdate ? "确认更新" : "确认入库"}
        </Button>
      </div>
    </div>
  );
}
