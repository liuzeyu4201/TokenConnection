import type { Metadata } from "next";
import Link from "next/link";

import { loadSessions, revokeOtherSessionsAction, revokeSessionAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登录设备" };

export default async function SessionsPage() {
  const { rows, currentToken } = await loadSessions();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/settings" className="text-sm text-muted-foreground">‹ 我</Link>
      <h1 className="text-xl font-semibold">登录设备</h1>
      <ul className="divide-y rounded-xl border bg-card">
        {rows.map((row) => (
          <li key={row.token} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
            <div>
              <p>{row.userAgent || "未知设备"}</p>
              <p className="text-xs text-muted-foreground">{row.ipAddress || "IP 未知"} · {row.token === currentToken ? "当前设备" : "其它设备"}</p>
            </div>
            {row.token === currentToken ? null : (
              <form action={revokeSessionAction}>
                <input type="hidden" name="token" value={row.token} />
                <button className="text-xs text-destructive" type="submit">撤销</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <form action={revokeOtherSessionsAction}>
        <button className="text-sm underline-offset-2 hover:underline" type="submit">注销其它所有设备</button>
      </form>
    </div>
  );
}
