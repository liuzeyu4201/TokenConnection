import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";

import { AuthForm } from "@/components/auth-form";
import { PasskeyManager } from "@/components/passkey-manager";
import { TotpSetup } from "@/components/totp-setup";
import { db } from "@/db";
import { passkeys, users } from "@/db/schema";
import { changePasswordAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "安全" };

export default async function SecurityPage() {
  const ctx = await requireUser("/settings/security");
  const [row] = await db.select({ twoFactorEnabled: users.twoFactorEnabled }).from(users).where(eq(users.id, ctx.userId)).limit(1);
  const keys = await db
    .select({ id: passkeys.id, name: passkeys.name, createdAt: passkeys.createdAt })
    .from(passkeys)
    .where(eq(passkeys.userId, ctx.userId));
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
      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="font-medium">Passkey</h2>
        <PasskeyManager initial={keys} />
      </section>
      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="font-medium">两步验证</h2>
        <TotpSetup enabled={Boolean(row?.twoFactorEnabled)} />
      </section>
      <Link href="/settings/sessions" className="text-sm underline-offset-2 hover:underline">查看登录设备</Link>
    </div>
  );
}
