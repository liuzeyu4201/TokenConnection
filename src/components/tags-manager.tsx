"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { TagKind } from "@/lib/schemas/enums";
import type { ApiTagWithCount } from "@/lib/types";

export function TagsManager({ tags }: { tags: ApiTagWithCount[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newCircle, setNewCircle] = React.useState("");
  const [newTag, setNewTag] = React.useState("");
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

  const create = (name: string, kind: TagKind, clear: () => void) =>
    run(async () => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await apiFetch("/api/v1/tags", { method: "POST", body: { name: trimmed, kind } });
      clear();
    });

  const saveEdit = () =>
    run(async () => {
      if (!editing) return;
      await apiFetch(`/api/v1/tags/${editing.id}`, {
        method: "PATCH",
        body: { name: editing.name.trim() },
      });
      setEditing(null);
    });

  const remove = (tag: ApiTagWithCount) => {
    if (!window.confirm(`删除标签「${tag.name}」？${tag.people_count} 个人会失去这个标签。`)) return;
    void run(() => apiFetch(`/api/v1/tags/${tag.id}`, { method: "DELETE" }));
  };

  const groups = [
    { title: "圈子", hint: "一个人只能属于其中一个。", items: tags.filter((t) => t.kind === "circle") },
    { title: "标签", hint: "用来查找，可以打很多个。", items: tags.filter((t) => t.kind !== "circle") },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create(newCircle, "circle", () => setNewCircle(""));
          }}
        >
          <Input value={newCircle} onChange={(e) => setNewCircle(e.target.value)} placeholder="新圈子，例如 球友" />
          <Button type="submit" disabled={busy || !newCircle.trim()}>
            <Plus /> 圈子
          </Button>
        </form>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create(newTag, "skill", () => setNewTag(""));
          }}
        >
          <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="新标签，例如 羽毛球" />
          <Button type="submit" variant="outline" disabled={busy || !newTag.trim()}>
            <Plus /> 标签
          </Button>
        </form>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {tags.length === 0 ? <EmptyState>还没有圈子或标签。记人时会自动补上。</EmptyState> : null}

      {groups.map(({ title, hint, items }) =>
        items.length === 0 ? null : (
          <section key={title} className="space-y-2">
            <h2 className="text-sm font-semibold">
              {title} <span className="font-normal text-muted-foreground">{items.length}</span>
              <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {items.map((tag) => {
                const isEditing = editing?.id === tag.id;
                return (
                  <li key={tag.id} className="flex items-center gap-2 px-3 py-2">
                    {isEditing ? (
                      <>
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
