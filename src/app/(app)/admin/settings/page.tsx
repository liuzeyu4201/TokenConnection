import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/dal";
import { readQuotaLimits } from "@/lib/llm/quota";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "实例设置" };

export default async function AdminSettingsPage() {
  await requireAdmin("/admin/settings");
  const quota = readQuotaLimits();
  const open = process.env.AUTH_OPEN_SIGNUP === "true";
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/admin/users" className="text-sm text-muted-foreground">‹ 用户</Link>
      <h1 className="text-xl font-semibold">实例设置</h1>
      <p className="text-sm text-muted-foreground">这些值来自环境变量，改完需要重启进程。页面不把密钥写回数据库。</p>
      <dl className="space-y-2 rounded-xl border p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt>开放注册</dt>
          <dd>{open ? "开启" : "关闭，需要邀请码"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>每日抽取</dt>
          <dd>{quota.extract}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>每日识图</dt>
          <dd>{quota.vision}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>每日向量</dt>
          <dd>{quota.embed}</dd>
        </div>
      </dl>
      <Link href="/admin/audit" className="text-sm underline-offset-2 hover:underline">
        查看审计
      </Link>
    </div>
  );
}
