import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { changePasswordAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "安全" };

export default async function SecurityPage() {
  await requireUser("/settings/security");
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/settings" className="text-sm text-muted-foreground">‹ 我</Link>
      <h1 className="text-xl font-semibold">安全</h1>
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">密码</h2>
        <p className="text-sm text-muted-foreground">修改后，其它设备会退出登录。</p>
        <AuthForm
          action={changePasswordAction}
          submitLabel="修改密码"
          fields={[
            { name: "current", label: "当前密码", type: "password" },
            { name: "next", label: "新密码", type: "password" },
            { name: "confirm", label: "再输入一次", type: "password" },
          ]}
        />
      </section>
      <section className="space-y-2 rounded-xl border p-4 text-sm text-muted-foreground">
        <h2 className="font-medium text-foreground">Passkey</h2>
        <p>稍后推出。需要 HTTPS 域名，局域网 IP 下不可用。</p>
      </section>
      <section className="space-y-2 rounded-xl border p-4 text-sm text-muted-foreground">
        <h2 className="font-medium text-foreground">两步验证</h2>
        <p>稍后推出。</p>
      </section>
      <Link href="/settings/sessions" className="text-sm underline-offset-2 hover:underline">查看登录设备</Link>
    </div>
  );
}
