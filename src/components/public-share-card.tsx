"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { contactLabel } from "@/lib/format";
import type { ShareSnapshot } from "@/lib/shares/snapshot";

type Card = {
  share: { kind: string; owner_name: string | null; message: string | null; expires_at: string | Date };
  items: ShareSnapshot[];
};

export function PublicShareCard({
  token,
  card,
  signedIn,
  needsPasscode = false,
}: {
  token: string;
  card: Card | null;
  signedIn: boolean;
  needsPasscode?: boolean;
}) {
  const router = useRouter();
  const [passcode, setPasscode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/s/${token}/unlock`, { method: "POST", body: { passcode } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const collect = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/s/${token}/collect`, { method: "POST" });
      router.push("/inbox");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (needsPasscode || !card) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-lg font-semibold">这张卡片有口令</h1>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void unlock();
          }}
        >
          <Input value={passcode} onChange={(event) => setPasscode(event.target.value)} placeholder="口令" autoFocus />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={busy || passcode.length < 4}>
            {busy ? "验证中…" : "打开"}
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <header>
        <p className="text-xs text-muted-foreground">{card.share.owner_name ? `@${card.share.owner_name} 分享` : "一份人脉分享"}</p>
        {card.share.message ? <p className="mt-1 text-sm">{card.share.message}</p> : null}
      </header>
      {card.items.map((item) => (
        <article key={item.name} className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-lg font-semibold">{item.name}</h2>
          <p className="text-sm text-muted-foreground">
            {[item.location, item.how_met, ...(item.tags ?? []).map((tag) => tag.name)].filter(Boolean).join(" · ")}
          </p>
          {item.summary ? <p className="text-sm">{item.summary}</p> : null}
          {item.impression ? <p className="text-sm">{item.impression}</p> : null}
          {item.contacts ? (
            <dl className="space-y-1 text-sm">
              {Object.entries(item.contacts).map(([key, value]) => (
                <div key={key} className="flex gap-3">
                  <dt className="w-14 text-muted-foreground">{contactLabel(key)}</dt>
                  <dd className="font-mono text-[13px]">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </article>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {signedIn ? (
        <Button type="button" disabled={busy} onClick={() => void collect()}>
          {busy ? "收录中…" : "收录到我的人脉"}
        </Button>
      ) : (
        <Link href={`/login?next=${encodeURIComponent(`/s/${token}`)}`} className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm text-primary-foreground">
          登录后收录
        </Link>
      )}
    </main>
  );
}
