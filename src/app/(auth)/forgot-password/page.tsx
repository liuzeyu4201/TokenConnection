import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "找回密码" };

export default function ForgotPasswordPage() {
  const hasMail = Boolean(process.env.SMTP_URL?.trim());
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold">找回密码</h1>
      {hasMail ? (
        <p className="text-muted-foreground">如果该邮箱已注册，重置链接已发送。没有收到就联系管理员。</p>
      ) : (
        <p className="text-muted-foreground">本实例未配置邮件，请联系管理员为你生成重置链接。</p>
      )}
      <Link href="/login" className="underline-offset-2 hover:underline">返回登录</Link>
    </div>
  );
}
