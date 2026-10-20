import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth/actions";
import { getProfile } from "@/lib/auth/account";
import { requireUser } from "@/lib/auth/dal";
import { getPrivacySettings } from "@/lib/auth/settings";
import { updateFollowUpSettingAction } from "@/lib/followups/actions";
import { countPendingInbox } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "我" };

export default async function SettingsPage() {
  const ctx = await requireUser("/settings");
  const profile = await getProfile(ctx.userId);
  const pending = await countPendingInbox(ctx).catch(() => 0);
  const settings = await getPrivacySettings(ctx.userId);
  const groups = [
    {
      title: "库",
      items: [
        { href: "/inbox", label: "收件箱", extra: pending > 0 ? `${pending} 条待处理` : null },
        { href: "/shared", label: "收到的分享", extra: null },
        { href: "/shares", label: "我发出的分享", extra: null },
        { href: "/tags", label: "圈子和标签", extra: null },
        { href: "/reminders", label: "该联系了", extra: null },
      ],
    },
    {
      title: "账号",
      items: [
        { href: "/settings/account", label: "账号资料", extra: null },
        { href: "/settings/security", label: "安全", extra: null },
        { href: "/settings/sessions", label: "登录设备", extra: null },
        { href: "/settings/tokens", label: "API 令牌", extra: null },
        { href: "/settings/privacy", label: "隐私与模型", extra: null },
      ],
    },
  ];
  if (ctx.role === "admin") {
    groups.push({
      title: "管理",
      items: [
        { href: "/admin/users", label: "用户", extra: null },
        { href: "/admin/invites", label: "邀请", extra: null },
      ],
    });
  }
  const initial = (profile?.name || profile?.username || "?").slice(0, 1);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary text-lg text-primary-foreground">{initial}</span>
        <div>
          <h1 className="text-xl font-semibold">{profile?.name}</h1>
          <p className="text-sm text-muted-foreground">@{profile?.username} · {profile?.email}</p>
        </div>
      </div>
      <section className="space-y-2">
        <h2 className="text-xs font-medium text-muted-foreground">回访</h2>
        <form action={updateFollowUpSettingAction} className="space-y-3 rounded-xl border bg-card p-4 text-sm">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block">新加入的人做回访提醒</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                打开后，新加入的人会在第 2 天、3 天、1 周、1 个月提醒回访。已经在库里的人不会补上。关掉后，没完成的回访先从提醒里拿掉，再打开会回来。
              </span>
            </span>
            <input type="checkbox" name="follow_up_enabled" defaultChecked={settings.follow_up_enabled} className="mt-1" />
          </label>
          <Button type="submit">保存</Button>
        </form>
      </section>
      {groups.map((group) => (
        <section key={group.title} className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground">{group.title}</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/50">
                  <span className="flex-1">{item.label}</span>
                  {item.extra ? <span className="text-xs text-muted-foreground">{item.extra}</span> : null}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <form action={logoutAction}>
        <button type="submit" className="text-sm text-destructive">退出登录</button>
      </form>
    </div>
  );
}
