import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { loadSetupPreview, setupAction } from "@/lib/auth/actions";
import { instanceHasUsers } from "@/lib/auth/bootstrap";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "初始化" };

export default async function SetupPage() {
  if (await instanceHasUsers()) notFound();
  const preview = await loadSetupPreview();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">初始化朋友圈</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          这是第一个账号，拥有管理员权限。库里现有的 {preview?.people ?? 0} 个人、{preview?.tags ?? 0} 个标签会归到这个账号名下。
        </p>
        {preview?.legacy ? (
          <p className="mt-2 text-sm text-muted-foreground">现有快捷指令令牌将自动迁移，90 天内继续可用。</p>
        ) : null}
      </div>
      <AuthForm
        action={setupAction}
        submitLabel="创建管理员"
        fields={[
          { name: "name", label: "名字", autoComplete: "name" },
          { name: "username", label: "用户名", autoComplete: "username" },
          { name: "email", label: "邮箱", type: "email", autoComplete: "email" },
          { name: "password", label: "密码", type: "password", autoComplete: "new-password" },
          { name: "confirm", label: "再输入一次密码", type: "password", autoComplete: "new-password" },
        ]}
      />
    </div>
  );
}
