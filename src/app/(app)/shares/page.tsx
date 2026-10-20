import type { Metadata } from "next";
import Link from "next/link";

import { SentShares } from "@/components/sent-shares";
import { requireUser } from "@/lib/auth/dal";
import { listSentShares } from "@/lib/services/shares";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "我发出的分享" };

export default async function SharesPage() {
  const user = await requireUser("/shares");
  const items = await listSentShares(user);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">我发出的分享</h1>
          <p className="text-sm text-muted-foreground">撤销会清掉快照和链接。已经收录的副本还在对方库里。</p>
        </div>
        <Link href="/shared" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          收到的
        </Link>
      </div>
      <SentShares items={items} />
    </div>
  );
}
