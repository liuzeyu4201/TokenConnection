"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { TAG_KIND_LABEL, TAG_KIND_VALUES, type TagKind } from "@/lib/schemas/enums";
import type { ApiTagWithCount } from "@/lib/types";

export function TagsManager({ tags }: { tags: ApiTagWithCount[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newTag, setNewTag] = React.useState<{ name: string; kind: TagKind }>({ name: "", kind: "skill" });
  const [editing, setEditing] = React.useState<{ id: string; name: string; kind: TagKind } | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const name = newTag.name.trim();
      if (!name) return;
      await apiFetch("/api/v1/tags", { method: "POST", body: { name, kind: newTag.kind } });
      setNewTag((t) => ({ ...t, name: "" }));
    });

  const saveEdit = () =>
    run(async () => {
      if (!editing) return;
      await apiFetch(`/api/v1/tags/${editing.id}`, {
        method: "PATCH",
        body: { name: editing.name.trim(), kind: editing.kind },
      });
      setEditing(null);
    });

  const remove = (tag: ApiTagWithCount) => {
    if (!window.confirm(`删除标签「${tag.name}」？${tag.people_count} 个人会失去这个标签。`)) return;
    void run(() => apiFetch(`/api/v1/tags/${tag.id}`, { method: "DELETE" }));
  };

  const groups = TAG_KIND_VALUES.map((kind) => ({ kind, items: tags.filter((t) => t.kind === kind) }));

  return (
    <div className="space-y-6">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <NativeSelect className="w-24 shrink-0" value={newTag.kind} onChange={(e) => setNewTag((t) => ({ ...t, kind: e.target.value as TagKind }))}>
          {TAG_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {TAG_KIND_LABEL[k]}
            </option>
          ))}
        </NativeSelect>
        <Input value={newTag.name} onChange={(e) => setNewTag((t) => ({ ...t, name: e.target.value }))} placeholder="新标签名，例如 羽毛球 / 前同事" />
        <Button type="submit" disabled={busy || !newTag.name.trim()}>
          <Plus /> 新建
        </Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {tags.length === 0 ? <EmptyState>还没有标签。记人时会自动打上能力和圈子标签。</EmptyState> : null}

      {groups.map(({ kind, items }) =>
        items.length === 0 ? null : (
          <section key={kind} className="space-y-2">
            <h2 className="text-sm font-semibold">
              {TAG_KIND_LABEL[kind]} <span className="font-normal text-muted-foreground">{items.length}</span>
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {items.map((tag) => {
                const isEditing = editing?.id === tag.id;
                return (
                  <li key={tag.id} className="flex items-center gap-2 px-3 py-2">
                    {isEditing ? (
                      <>
                        <NativeSelect className="w-24 shrink-0" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as TagKind })}>
                          {TAG_KIND_VALUES.map((k) => (
                            <option key={k} value={k}>
                              {TAG_KIND_LABEL[k]}
                            </option>
                          ))}
                        </NativeSelect>
                        <Input
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void saveEdit();
                            }
                            if (e.key === "Escape") setEditing(null);
                          }}
                          autoFocus
                        />
                        <Button size="icon-sm" variant="outline" onClick={saveEdit} disabled={busy} aria-label="保存">
                          <Check />
                        </Button>
                        <Button size="icon-sm" variant="ghost" onClick={() => setEditing(null)} aria-label="取消">
                          <X />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Link href={`/people?tag=${encodeURIComponent(tag.name)}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                          {tag.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">{tag.people_count} 人</span>
                        <Button size="icon-sm" variant="ghost" onClick={() => setEditing({ id: tag.id, name: tag.name, kind: tag.kind })} aria-label="编辑">
                          <Pencil />
                        </Button>
                        <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => remove(tag)} disabled={busy} aria-label="删除">
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
