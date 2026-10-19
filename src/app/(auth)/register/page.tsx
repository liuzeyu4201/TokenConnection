import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { registerAction } from "@/lib/auth/actions";
import { findInvite } from "@/lib/auth/account";
import { checkInvite, inviteFailureMessage } from "@/lib/auth/invite";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "注册" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const raw = await searchParams;
  const invite = typeof raw.invite === "string" ? raw.invite : "";
  const open = process.env.AUTH_OPEN_SIGNUP === "true";
  if (!open && !invite) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-semibold">需要邀请码</h1>
        <p className="text-muted-foreground">请向管理员要一个注册链接。</p>
        <Link href="/login" className="underline-offset-2 hover:underline">返回登录</Link>
      </div>
    );
  }
  if (invite) {
    const row = await findInvite(invite);
    const verdict = checkInvite(
      row ? { expiresAt: row.expires_at, usedAt: row.used_at, revokedAt: row.revoked_at, email: row.email } : null,
      row?.email ?? "",
    );
    if (!verdict.ok && verdict.reason !== "email_mismatch") {
      return <p className="text-sm">{inviteFailureMessage(verdict.reason)}</p>;
    }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">注册</h1>
      <p className="text-sm text-muted-foreground">我知道这是一个自托管实例，数据由管理员保管。</p>
      <AuthForm
        action={registerAction}
        submitLabel="注册并进入"
        hidden={{ invite }}
        fields={[
          { name: "name", label: "名字" },
          { name: "username", label: "用户名" },
          { name: "email", label: "邮箱", type: "email", defaultValue: "" },
          { name: "password", label: "密码", type: "password" },
          { name: "confirm", label: "再输入一次密码", type: "password" },
        ]}
      />
    </div>
  );
}
