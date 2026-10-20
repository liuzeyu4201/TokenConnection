"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { contactLabel } from "@/lib/format";

type Kind = "person" | "circle";

type Created = {
  link?: { url: string };
  recipients: Array<{ username: string | null }>;
};

export function ShareButton({
  kind,
  personId,
  circleTagId,
  title,
  contactKeys = [],
  hasImpression = false,
  hasSummary = false,
  eventCount = 0,
  label = "分享",
}: {
  kind: Kind;
  personId?: string;
  circleTagId?: string;
  title: string;
  contactKeys?: string[];
  hasImpression?: boolean;
  hasSummary?: boolean;
  eventCount?: number;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [gender, setGender] = React.useState(true);
  const [location, setLocation] = React.useState(true);
  const [tags, setTags] = React.useState<"all" | "skills" | "none">("all");
  const [howMet, setHowMet] = React.useState(true);
  const [metAt, setMetAt] = React.useState(true);
  const [summary, setSummary] = React.useState(false);
  const [impression, setImpression] = React.useState(false);
  const [confirmImpression, setConfirmImpression] = React.useState(false);
  const [tier, setTier] = React.useState(false);
  const [events, setEvents] = React.useState(false);
  const [contacts, setContacts] = React.useState<string[]>([]);
  const [showOwner, setShowOwner] = React.useState(true);
  const [recipients, setRecipients] = React.useState("");
  const [withLink, setWithLink] = React.useState(false);
  const [days, setDays] = React.useState<1 | 7 | 30>(7);
  const [maxViews, setMaxViews] = React.useState("");
  const [passcode, setPasscode] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<Created | null>(null);

  const toggleContact = (key: string) => {
    setContacts((list) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]));
  };

  const onImpression = (checked: boolean) => {
    if (!checked) {
      setImpression(false);
      setConfirmImpression(false);
      return;
    }
    const ok = window.confirm("印象是你对这个人的私人记录。确定要放进分享吗？对方会看到原文。");
    setImpression(ok);
    setConfirmImpression(ok);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const people = recipients
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      const result = await apiFetch<Created>("/api/v1/shares", {
        method: "POST",
        body: {
          kind,
          person_id: personId,
          circle_tag_id: circleTagId,
          message: message.trim() || undefined,
          recipients: people,
          fields: {
            gender,
            location,
            tags,
            how_met: howMet,
            met_at: metAt,
            summary,
            impression,
            confirm_impression: confirmImpression,
            contacts,
            events: events ? "all" : "none",
            tier,
            show_owner_name: showOwner,
          },
          link: withLink
            ? {
                expires_in_days: days,
                max_views: maxViews.trim() ? Number(maxViews) : null,
                passcode: passcode.trim() || null,
              }
            : undefined,
        },
      });
      setCreated(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            className="max-h-[90vh] w-full overflow-auto rounded-t-2xl bg-background p-4 shadow-xl md:max-w-lg md:rounded-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="share-title" className="text-base font-semibold">
                  分享{kind === "circle" ? "圈子" : ""}「{title}」
                </h2>
                <p className="text-xs text-muted-foreground">发出去的是当时的快照，之后你改了原记录，对方不会跟着变。</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                关闭
              </Button>
            </div>

            {created ? (
              <div className="space-y-3 text-sm">
                <p>已发送{created.recipients.length > 0 ? `给 ${created.recipients.length} 人` : ""}。</p>
                {created.link ? (
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">链接只显示这一次</span>
                    <Input readOnly value={created.link.url} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                ) : null}
                <Button type="button" onClick={() => setOpen(false)}>
                  完成
                </Button>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <fieldset className="space-y-2">
                  <legend className="text-xs text-muted-foreground">对方能看到</legend>
                  <Check label="性别" checked={gender} onChange={setGender} />
                  <Check label="所在地" checked={location} onChange={setLocation} />
                  <label className="flex items-center gap-2">
                    <span className="w-16 text-muted-foreground">标签</span>
                    <select className="h-8 rounded-md border bg-background px-2" value={tags} onChange={(event) => setTags(event.target.value as typeof tags)}>
                      <option value="all">全部</option>
                      <option value="skills">只能力</option>
                      <option value="none">不分享</option>
                    </select>
                  </label>
                  <Check label="认识方式" checked={howMet} onChange={setHowMet} />
                  <Check label="认识日期" checked={metAt} onChange={setMetAt} />
                  <Check label="显示我是谁" checked={showOwner} onChange={setShowOwner} />
                  {hasSummary ? <Check label="摘要" checked={summary} onChange={setSummary} /> : null}
                  {hasImpression ? <Check label="印象（需确认）" checked={impression} onChange={onImpression} /> : null}
                  <Check label="关系远近" checked={tier} onChange={setTier} />
                  {eventCount > 0 ? <Check label={`时间线（${eventCount} 条）`} checked={events} onChange={setEvents} /> : null}
                  {contactKeys.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">联系方式默认不分享</p>
                      {contactKeys.map((key) => (
                        <Check key={key} label={contactLabel(key)} checked={contacts.includes(key)} onChange={() => toggleContact(key)} />
                      ))}
                    </div>
                  ) : null}
                </fieldset>

                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">发给站内用户，一行一个 @用户名 或邮箱</span>
                  <textarea
                    className="min-h-16 w-full rounded-md border bg-background px-2 py-1.5"
                    value={recipients}
                    placeholder={"@beibei"}
                    onChange={(event) => setRecipients(event.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">附言</span>
                  <Input value={message} maxLength={500} onChange={(event) => setMessage(event.target.value)} />
                </label>
                <Check label="同时生成链接" checked={withLink} onChange={setWithLink} />
                {withLink ? (
                  <div className="grid grid-cols-3 gap-2">
                    <label className="space-y-1 text-xs">
                      有效期
                      <select className="h-8 w-full rounded-md border bg-background px-2" value={days} onChange={(event) => setDays(Number(event.target.value) as 1 | 7 | 30)}>
                        <option value={1}>1 天</option>
                        <option value={7}>7 天</option>
                        <option value={30}>30 天</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs">
                      最多打开
                      <Input value={maxViews} inputMode="numeric" placeholder="不限" onChange={(event) => setMaxViews(event.target.value)} />
                    </label>
                    <label className="space-y-1 text-xs">
                      口令
                      <Input value={passcode} placeholder="可选" onChange={(event) => setPasscode(event.target.value)} />
                    </label>
                  </div>
                ) : null}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="button" disabled={busy} onClick={() => void submit()}>
                  {busy ? "发送中…" : "发送"}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
