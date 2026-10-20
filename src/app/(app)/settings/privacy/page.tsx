import type { Metadata } from "next";
import Link from "next/link";

import { loadPrivacy, updatePrivacyAction } from "@/lib/auth/actions";
import { readQuotaLimits } from "@/lib/llm/quota";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "隐私与模型" };

export default async function PrivacyPage() {
  const { settings, usage } = await loadPrivacy();
  const limits = readQuotaLimits();
  const rows = [
    ["llm_enabled", "使用模型抽取与搜索", settings.llm_enabled],
    ["redact_contacts", "发送前脱敏联系方式", settings.redact_contacts],
    ["vision_enabled", "允许图片识别", settings.vision_enabled],
    ["notify_share_email", process.env.SMTP_URL?.trim() ? "有人分享给我时发邮件" : "有人分享给我时发邮件（未配置邮件，保存后也不会发出）", settings.notify_share_email],
  ] as const;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/settings" className="text-sm text-muted-foreground">‹ 我</Link>
      <h1 className="text-xl font-semibold">隐私与模型</h1>
      <p className="text-sm text-muted-foreground">
        今日抽取 {usage.extract_count}/{limits.extract}，图片 {usage.vision_count}/{limits.vision}，向量 {usage.embed_count}/{limits.embed}。
        关闭模型后仍可手工记人。
      </p>
      <form action={updatePrivacyAction} className="space-y-3 rounded-xl border p-4 text-sm">
        {rows.map(([name, label, on]) => (
          <label key={name} className="flex items-center justify-between gap-3">
            <span>{label}</span>
            <input type="checkbox" name={name} defaultChecked={on} />
          </label>
        ))}
        <Button type="submit">保存</Button>
      </form>
    </div>
  );
}
