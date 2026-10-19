import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { loginAction } from "@/lib/auth/actions";
import { instanceHasUsers } from "@/lib/auth/bootstrap";
import { getOptionalUser, safeNextPath } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登录" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!(await instanceHasUsers())) redirect("/setup");
  const user = await getOptionalUser();
  const raw = await searchParams;
  const next = safeNextPath(typeof raw.next === "string" ? raw.next : "/");
  if (user) redirect(next);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">登录</h1>
      <AuthForm
        action={loginAction}
        submitLabel="登录"
        hidden={{ next }}
        fields={[
          { name: "identifier", label: "邮箱或用户名", autoComplete: "username" },
          { name: "password", label: "密码", type: "password", autoComplete: "current-password" },
        ]}
      />
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground underline-offset-2 hover:underline">忘记密码</Link>
        <Link href="/register" className="text-muted-foreground underline-offset-2 hover:underline">有邀请码？注册</Link>
      </div>
    </div>
  );
}
