"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export type PasskeyItem = {
  id: string;
  name: string | null;
  createdAt: string | Date | null;
};

export function PasskeyManager({ initial }: { initial: PasskeyItem[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const add = async () => {
    if (!window.isSecureContext) {
      setMessage("当前地址不是安全上下文。Passkey 只能在 localhost 或 HTTPS 上注册。");
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await authClient.passkey.addPasskey({ name: name.trim() || "这台设备" });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message || "浏览器没有完成 Passkey 注册");
      return;
    }
    setName("");
    router.refresh();
  };

  const remove = async (id: string) => {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/v1/passkeys/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      setMessage("没有删掉这把 Passkey");
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">添加后可以用这把 Passkey 登录。局域网 IP 或纯 http 不是安全上下文，点添加时会被拒绝。</p>
      {initial.length === 0 ? <p className="text-muted-foreground">还没有 Passkey。</p> : null}
      <ul className="space-y-2">
        {initial.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3">
            <span>{item.name || "未命名"}</span>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove(item.id)}>
              删除
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={name} placeholder="给这把钥匙起个名字" onChange={(event) => setName(event.target.value)} />
        <Button type="button" disabled={busy} onClick={() => void add()}>
          添加 Passkey
        </Button>
      </div>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
