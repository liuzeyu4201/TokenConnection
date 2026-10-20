"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Enabled = { totpURI?: string; backupCodes?: string[] };

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [setup, setSetup] = React.useState<Enabled | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const post = async (path: string, body: unknown) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; code?: string } & Enabled;
      if (!response.ok) {
        setMessage(payload?.message || "没有成功");
        return null;
      }
      return payload;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        {enabled ? "两步验证已开启。登录时需要验证器里的 6 位码，或一次性恢复码。" : "用验证器 App 扫码。本机没有验证器时，可以把密钥抄进测试工具。"}
      </p>
      <Input type="password" value={password} placeholder="当前密码" onChange={(event) => setPassword(event.target.value)} />
      {!enabled && !setup ? (
        <Button
          type="button"
          disabled={busy || password.length < 10}
          onClick={() => {
            void post("/api/auth/two-factor/enable", { password, method: "totp" }).then((result) => {
              if (result) setSetup(result);
            });
          }}
        >
          开启两步验证
        </Button>
      ) : null}
      {setup?.totpURI ? (
        <div className="space-y-2">
          <p className="break-all font-mono text-xs">{setup.totpURI}</p>
          {setup.backupCodes?.length ? (
            <p className="text-xs text-muted-foreground">恢复码只显示这一次：{setup.backupCodes.join(" ")}</p>
          ) : null}
          <Input value={code} inputMode="numeric" placeholder="6 位验证码" onChange={(event) => setCode(event.target.value)} />
          <Button
            type="button"
            disabled={busy || code.trim().length < 6}
            onClick={() => {
              void post("/api/auth/two-factor/verify-totp", { code: code.trim() }).then((result) => {
                if (result) {
                  setMessage("已开启。请重新登录时带上验证码。");
                  setSetup(null);
                }
              });
            }}
          >
            确认验证码
          </Button>
        </div>
      ) : null}
      {enabled ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy || password.length < 10}
          onClick={() => {
            void post("/api/auth/two-factor/disable", { password }).then((result) => {
              if (result) setMessage("已关闭两步验证。");
            });
          }}
        >
          关闭两步验证
        </Button>
      ) : null}
      {message ? <p>{message}</p> : null}
    </div>
  );
}
