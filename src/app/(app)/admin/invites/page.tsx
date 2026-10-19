import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { createInviteAction, loadAdminInvites, revokeInviteAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "邀请" };

export default async function InvitesPage() {
  const invites = await loadAdminInvites();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/settings" className="text-sm text-muted-foreground">‹ 我</Link>
      <h1 className="text-xl font-semibold">邀请</h1>
      <AuthForm
        action={createInviteAction}
        submitLabel="新建邀请"
        fields={[
          { name: "email", label: "绑定邮箱（可空）", type: "email", required: false },
          { name: "role", label: "角色 member 或 admin", defaultValue: "member" },
        ]}
      />
      <ul className="divide-y rounded-xl border bg-card">
        {invites.map((invite) => (
          <li key={invite.id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
            <div>
              <p>{invite.email || "不绑定邮箱"} · {invite.role}</p>
              <p className="text-xs text-muted-foreground">
                {invite.revoked_at ? "已撤销" : invite.used_at ? "已使用" : `${invite.expires_at.toLocaleDateString("zh-CN")} 过期`}
              </p>
            </div>
            {invite.used_at || invite.revoked_at ? null : (
              <form action={revokeInviteAction}>
                <input type="hidden" name="id" value={invite.id} />
                <button className="text-xs text-destructive" type="submit">撤销</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
