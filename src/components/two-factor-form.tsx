"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TwoFactorForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [backup, setBackup] = React.useState("");
  const [trust, setTrust] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, trustDevice: trust }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.message || "验证没有通过");
      return;
    }
    router.push(next);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit("/api/auth/two-factor/verify-totp", { code: code.trim() });
        }}
      >
        <label className="block space-y-1 text-sm">
          <span>验证器里的 6 位码</span>
          <Input value={code} inputMode="numeric" onChange={(event) => setCode(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={trust} onChange={(event) => setTrust(event.target.checked)} />
          30 天内这台设备不用再输入验证码
        </label>
        <Button type="submit" className="w-full" disabled={busy || code.trim().length < 6}>
          确认
        </Button>
      </form>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit("/api/auth/two-factor/verify-backup-code", { code: backup.trim() });
        }}
      >
        <label className="block space-y-1 text-sm">
          <span>或使用一次性恢复码</span>
          <Input value={backup} onChange={(event) => setBackup(event.target.value)} />
        </label>
        <Button type="submit" variant="outline" className="w-full" disabled={busy || backup.trim().length < 4}>
          用恢复码登录
        </Button>
      </form>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
