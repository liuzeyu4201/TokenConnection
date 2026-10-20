import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { disableUserAction, issueResetLinkAction, loadAdminUsers, resetTwoFactorAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "用户" };

export default async function AdminUsersPage() {
  const users = await loadAdminUsers();
  return (
    <div className="space-y-4">
      <Link href="/settings" className="text-sm text-muted-foreground">‹ 我</Link>
      <h1 className="text-xl font-semibold">用户</h1>
      <p className="text-sm text-muted-foreground">这里看不到任何人的人脉内容或数量。</p>
      <ul className="divide-y rounded-xl border bg-card">
        {users.map((user) => (
          <li key={user.id} className="space-y-2 px-3 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{user.name} @{user.username}</span>
              <span className="text-xs text-muted-foreground">{user.role} · {user.status}</span>
            </div>
            <p className="text-xs text-muted-foreground">{user.email}</p>
            <div className="flex flex-wrap gap-3">
              <form action={resetTwoFactorAction}>
                <input type="hidden" name="id" value={user.id} />
                <button className="text-xs underline-offset-2 hover:underline" type="submit">重置两步验证</button>
              </form>
              <form action={disableUserAction}>
                <input type="hidden" name="id" value={user.id} />
                <input type="hidden" name="disabled" value={user.status === "disabled" ? "0" : "1"} />
                <button className="text-xs underline-offset-2 hover:underline" type="submit">
                  {user.status === "disabled" ? "恢复" : "停用"}
                </button>
              </form>
            </div>
            <AuthForm action={issueResetLinkAction} submitLabel="生成重置链接" hidden={{ id: user.id }} fields={[]} />
          </li>
        ))}
      </ul>
    </div>
  );
}
