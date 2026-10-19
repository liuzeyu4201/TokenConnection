import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "重置密码" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const raw = await searchParams;
  const token = typeof raw.token === "string" ? raw.token : "";
  if (!token) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-semibold">链接无效</h1>
        <p className="text-muted-foreground">重置链接缺少令牌，或已经失效。</p>
        <Link href="/forgot-password" className="underline-offset-2 hover:underline">重新申请</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">设置新密码</h1>
      <ResetPasswordForm token={token} />
    </div>
  );
}
