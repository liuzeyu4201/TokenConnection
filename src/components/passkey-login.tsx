"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function PasskeyLoginButton({ next }: { next: string }) {
  const router = useRouter();
  const [message, setMessage] = React.useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          if (!window.isSecureContext) {
            setMessage("局域网 IP 或纯 http 不能使用 Passkey。请用 localhost 或 HTTPS。");
            return;
          }
          void authClient.signIn.passkey().then((result) => {
            if (result.error) {
              setMessage(result.error.message || "没有用 Passkey 登录");
              return;
            }
            router.push(next);
            router.refresh();
          });
        }}
      >
        使用 Passkey 登录
      </Button>
      <p className="text-xs text-muted-foreground">局域网 IP 或纯 http 不能使用 Passkey。</p>
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}
