import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { createTokenAction, loadTokens, revokeTokenAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "API 令牌" };

export default async function TokensPage() {
  const tokens = await loadTokens();
  const legacy = tokens.find((token) => token.legacy && !token.revoked_at);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/settings" className="text-sm text-muted-foreground">‹ 我</Link>
      <h1 className="text-xl font-semibold">API 令牌</h1>
      {legacy?.expires_at ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          「{legacy.name}」将于 {legacy.expires_at.toLocaleDateString("zh-CN")} 过期。建议新建一个只有「记一句」权限的令牌，替换快捷指令里的旧值。
        </p>
      ) : null}
      <ul className="divide-y rounded-xl border bg-card">
        {tokens.length === 0 ? <li className="px-3 py-4 text-sm text-muted-foreground">还没有令牌。</li> : null}
        {tokens.map((token) => (
          <li key={token.id} className="space-y-1 px-3 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{token.name}</span>
              {token.revoked_at ? <span className="text-xs text-muted-foreground">已撤销</span> : (
                <form action={revokeTokenAction}>
                  <input type="hidden" name="id" value={token.id} />
                  <button className="text-xs text-destructive" type="submit">撤销</button>
                </form>
              )}
            </div>
            <p className="font-mono text-xs text-muted-foreground">{token.token_prefix}… · {token.scopes.join(" ")}</p>
            <p className="text-xs text-muted-foreground">
              {token.legacy ? "由旧 API_TOKEN 迁移 · " : ""}
              {token.expires_at ? `${token.expires_at.toLocaleDateString("zh-CN")} 过期` : "永不过期"}
            </p>
          </li>
        ))}
      </ul>
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">新建令牌</h2>
        <AuthForm
          action={createTokenAction}
          submitLabel="创建"
          fields={[
            { name: "name", label: "名字", defaultValue: "iPhone 快捷指令" },
            { name: "preset", label: "权限：shortcut / readonly / full", defaultValue: "shortcut" },
            { name: "days", label: "有效天数，填 never 表示永不", defaultValue: "365" },
          ]}
        />
        <p className="text-xs text-muted-foreground">明文只在创建后出现一次。快捷指令说明见 shortcuts/README.md。</p>
      </section>
    </div>
  );
}
