import type { Metadata } from "next";
import Link from "next/link";

import { ReceivedShares } from "@/components/received-shares";
import { requireUser } from "@/lib/auth/dal";
import { listReceivedShares } from "@/lib/services/shares";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "收到的分享" };

export default async function SharedPage() {
  const user = await requireUser("/shared");
  const items = await listReceivedShares(user);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">收到的分享</h1>
          <p className="text-sm text-muted-foreground">收录之后是你自己的副本，对方撤销不会把它收回去。</p>
        </div>
        <Link href="/shares" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          我发出的
        </Link>
      </div>
      <ReceivedShares items={items} />
    </div>
  );
}
