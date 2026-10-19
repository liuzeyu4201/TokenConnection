"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const password = String(data.get("password") ?? "");
        const confirm = String(data.get("confirm") ?? "");
        if (password !== confirm) {
          setMessage("两次密码不一致");
          return;
        }
        setPending(true);
        const response = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, newPassword: password }),
        });
        setPending(false);
        if (!response.ok) {
          setMessage("链接无效或已过期");
          return;
        }
        router.push("/login?reset=1");
      }}
    >
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <label className="block space-y-1 text-sm">
        <span>新密码</span>
        <Input name="password" type="password" required minLength={10} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>再输入一次</span>
        <Input name="confirm" type="password" required minLength={10} />
      </label>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "请稍候…" : "更新密码"}
      </Button>
    </form>
  );
}
