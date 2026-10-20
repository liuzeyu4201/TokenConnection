import type { Metadata } from "next";
import Link from "next/link";

import { AccountDanger } from "@/components/account-danger";
import { AuthForm } from "@/components/auth-form";
import { updateProfileAction } from "@/lib/auth/actions";
import { getProfile } from "@/lib/auth/account";
import { requireUser } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "账号资料" };

export default async function AccountPage() {
  const ctx = await requireUser("/settings/account");
  const profile = await getProfile(ctx.userId);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/settings" className="text-sm text-muted-foreground">‹ 我</Link>
      <h1 className="text-xl font-semibold">账号资料</h1>
      <p className="text-sm text-muted-foreground">分享对象通过用户名找到你。</p>
      <AuthForm
        action={updateProfileAction}
        submitLabel="保存"
        fields={[
          { name: "name", label: "名字", defaultValue: profile?.name ?? "" },
          { name: "username", label: "用户名", defaultValue: profile?.username ?? "" },
          { name: "email", label: "邮箱", type: "email", defaultValue: profile?.email ?? "" },
        ]}
      />
      <AccountDanger />
    </div>
  );
}
