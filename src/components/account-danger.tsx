"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AccountDanger() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const download = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/account/export", { method: "POST" });
      if (!response.ok) {
        setMessage("导出失败");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tokenconnection-export.zip";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (confirm !== "删除我的账号") {
      setMessage("请输入「删除我的账号」以确认");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirm }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) {
        setMessage(payload?.error?.message || "没有删除");
        return;
      }
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">导出与注销</h2>
      <p className="text-sm text-muted-foreground">导出是一个 zip，里面是你的人脉、标签、时间线和收件箱 JSON。注销会删掉你的库、会话和令牌，别人已经收录的副本还在。</p>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void download()}>
        下载导出
      </Button>
      <Input type="password" value={password} placeholder="当前密码" onChange={(event) => setPassword(event.target.value)} />
      <Input value={confirm} placeholder="输入：删除我的账号" onChange={(event) => setConfirm(event.target.value)} />
      <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>
        注销账号
      </Button>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </section>
  );
}
