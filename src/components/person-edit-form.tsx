"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { NativeSelect } from "@/components/native-select";
import { TagChip } from "@/components/tag-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { contactLabel, QUICK_CONTACT_KEYS } from "@/lib/format";
import {
  GENDER_LABEL,
  GENDER_VALUES,
  TAG_KIND_LABEL,
  TAG_KIND_VALUES,
  TIER_LABEL,
  TIER_VALUES,
  type Gender,
  type TagKind,
  type Tier,
} from "@/lib/schemas/enums";
import type { ApiPerson } from "@/lib/types";

type ContactRow = { key: string; value: string };
type TagDraft = { name: string; kind: TagKind };

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-muted-foreground ${className ?? ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Manual editing of every field (design.md §17: works without the LLM). */
export function PersonEditForm({ person, initialOpen = false }: { person: ApiPerson; initialOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(initialOpen);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(person.name);
  const [gender, setGender] = React.useState<Gender>(person.gender);
  const [tier, setTier] = React.useState<Tier>(person.tier);
  const [location, setLocation] = React.useState(person.location ?? "");
  const [summary, setSummary] = React.useState(person.summary ?? "");
  const [impression, setImpression] = React.useState(person.impression ?? "");
  const [howMet, setHowMet] = React.useState(person.how_met ?? "");
  const [metAt, setMetAt] = React.useState(person.met_at ?? "");
  const [contacts, setContacts] = React.useState<ContactRow[]>(
    Object.entries(person.contacts).map(([key, value]) => ({ key, value })),
  );
  const [tags, setTags] = React.useState<TagDraft[]>(person.tags.map((t) => ({ name: t.name, kind: t.kind })));
  const [newTag, setNewTag] = React.useState<TagDraft>({ name: "", kind: "skill" });

  // Geo (design.md §14.2): "auto" follows the offline geocoder, "manual" pins coordinates.
  const [geoMode, setGeoMode] = React.useState<"auto" | "manual">(person.geo_manual ? "manual" : "auto");
  const [lat, setLat] = React.useState(person.lat != null ? String(person.lat) : "");
  const [lng, setLng] = React.useState(person.lng != null ? String(person.lng) : "");
  const [cityQuery, setCityQuery] = React.useState("");
  const [cityResults, setCityResults] = React.useState<Array<{ name: string; en: string; lat: number; lng: number }>>([]);

  const searchCity = async (q: string) => {
    setCityQuery(q);
    if (q.trim().length < 1) {
      setCityResults([]);
      return;
    }
    try {
      const res = await apiFetch<{ items: Array<{ name: string; en: string; lat: number; lng: number }> }>(
        `/api/v1/geo/cities?q=${encodeURIComponent(q.trim())}&limit=6`,
      );
      setCityResults(res.items);
    } catch {
      setCityResults([]);
    }
  };

  const pickCity = (c: { name: string; lat: number; lng: number }) => {
    setGeoMode("manual");
    setLat(String(c.lat));
    setLng(String(c.lng));
    setCityResults([]);
    setCityQuery(c.name);
  };

  const addTag = () => {
    const n = newTag.name.trim();
    if (!n) return;
    setTags((list) => (list.some((t) => t.name === n && t.kind === newTag.kind) ? list : [...list, { name: n, kind: newTag.kind }]));
    setNewTag((t) => ({ ...t, name: "" }));
  };

  const save = async () => {
    if (!name.trim()) {
      setError("姓名不能为空");
      return;
    }
    if (geoMode === "manual") {
      const la = Number(lat);
      const ln = Number(lng);
      if (!lat.trim() || !lng.trim() || !Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
        setError("手动坐标需要合法的纬度（-90~90）和经度（-180~180）");
        return;
      }
    }
    setBusy(true);
    setError(null);
    const record: Record<string, string> = {};
    for (const row of contacts) {
      if (row.key.trim() && row.value.trim()) record[row.key.trim()] = row.value.trim();
    }
    try {
      await apiFetch(`/api/v1/people/${person.id}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          gender,
          tier,
          location: location || null,
          summary: summary || null,
          impression: impression || null,
          how_met: howMet || null,
          met_at: metAt || null,
          contacts: record,
          tags,
          ...(geoMode === "manual"
            ? { lat: Number(lat), lng: Number(lng), geo_manual: true }
            : { geo_manual: false }),
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`确定删除「${person.name}」？相关标签关联、事件和向量都会一起删除。`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/people/${person.id}`, { method: "DELETE" });
      router.push("/people");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil /> 编辑
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={remove} disabled={busy}>
          <Trash2 /> 删除
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold">编辑资料</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="姓名 *" className="col-span-2 sm:col-span-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="性别">
          <NativeSelect value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            {GENDER_VALUES.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABEL[g]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="关系远近">
          <NativeSelect value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            {TIER_VALUES.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="所在地">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="怎么认识的" className="col-span-2 sm:col-span-1">
          <Input value={howMet} onChange={(e) => setHowMet(e.target.value)} />
        </Field>
        <Field label="认识日期">
          <Input type="date" value={metAt} onChange={(e) => setMetAt(e.target.value)} />
        </Field>
        <Field label="摘要（他是谁、做什么）" className="col-span-2 sm:col-span-3">
          <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <Field label="我的印象（私密）" className="col-span-2 sm:col-span-3">
          <Textarea rows={2} value={impression} onChange={(e) => setImpression(e.target.value)} />
        </Field>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">联系方式</h4>
        {contacts.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input className="w-28 shrink-0" value={row.key} placeholder="wechat" onChange={(e) => setContacts((rows) => rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))} />
            <Input value={row.value} onChange={(e) => setContacts((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label="删除联系方式" onClick={() => setContacts((rows) => rows.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_CONTACT_KEYS.map((key) => (
            <Button key={key} type="button" variant="outline" size="xs" disabled={contacts.some((r) => r.key === key)} onClick={() => setContacts((rows) => [...rows, { key, value: "" }])}>
              <Plus /> {contactLabel(key)}
            </Button>
          ))}
          <Button type="button" variant="ghost" size="xs" onClick={() => setContacts((rows) => [...rows, { key: "", value: "" }])}>
            <Plus /> 自定义
          </Button>
        </div>
      </div>

      <div className="space-y-2" id="geo">
        <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">地图坐标</h4>
        <div className="inline-flex rounded-lg border p-0.5 text-xs">
          <button type="button" onClick={() => setGeoMode("auto")} className={`rounded-md px-2.5 py-1 ${geoMode === "auto" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            按所在地自动
          </button>
          <button type="button" onClick={() => setGeoMode("manual")} className={`rounded-md px-2.5 py-1 ${geoMode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            手动填写
          </button>
        </div>
        {geoMode === "auto" ? (
          <p className="text-xs text-muted-foreground">
            保存时用离线城市表匹配「所在地」。
            {person.lat != null && !person.geo_manual ? ` 当前已定位到 ${person.lat.toFixed(2)}, ${person.lng?.toFixed(2)}。` : person.geo_manual ? " 保存后将放弃手动坐标并重新匹配。" : person.location ? " 当前所在地没有匹配到城市，可换成城市名或改为手动。" : ""}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="纬度 lat">
                <Input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="30.29" />
              </Field>
              <Field label="经度 lng">
                <Input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="120.16" />
              </Field>
            </div>
            <div className="relative">
              <Input value={cityQuery} onChange={(e) => void searchCity(e.target.value)} placeholder="或搜一个城市名填入坐标，例如 杭州 / Tokyo" />
              {cityResults.length > 0 ? (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-sm shadow-md">
                  {cityResults.map((c) => (
                    <li key={`${c.name}-${c.en}`}>
                      <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-muted" onClick={() => pickCity(c)}>
                        <span>{c.name} <span className="text-xs text-muted-foreground">{c.en}</span></span>
                        <span className="font-mono text-[11px] text-muted-foreground">{c.lat.toFixed(2)}, {c.lng.toFixed(2)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">标签</h4>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <TagChip key={`${tag.kind}-${tag.name}`} name={tag.name} kind={tag.kind} onRemove={() => setTags((list) => list.filter((_, j) => j !== i))} />
          ))}
          {tags.length === 0 ? <span className="text-xs text-muted-foreground">暂无标签</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect className="w-24 shrink-0" value={newTag.kind} onChange={(e) => setNewTag((t) => ({ ...t, kind: e.target.value as TagKind }))}>
            {TAG_KIND_VALUES.map((k) => (
              <option key={k} value={k}>
                {TAG_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
          <Input
            value={newTag.name}
            placeholder="羽毛球 / 前同事"
            onChange={(e) => setNewTag((t) => ({ ...t, name: e.target.value }))}
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={remove} disabled={busy}>
          <Trash2 /> 删除这个人
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            取消
          </Button>
          <Button type="button" onClick={save} disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
