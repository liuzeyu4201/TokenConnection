import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { PublicShareCard } from "@/components/public-share-card";
import { ApiError } from "@/lib/api/errors";
import { getOptionalUser } from "@/lib/auth/dal";
import { shareCookieMatches, shareUnlockCookieName } from "@/lib/shares/unlock-cookie";
import { readPublicShare } from "@/lib/services/shares";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "分享" };

export default async function PublicSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const jar = await cookies();
  const unlocked = shareCookieMatches(token, jar.get(shareUnlockCookieName(token))?.value);
  const loaded = await loadPublicShare(token, unlocked);
  if (loaded.status === "passcode") {
    return <PublicShareCard token={token} card={null} signedIn={false} needsPasscode />;
  }
  if (loaded.status === "gone") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">这条分享已经失效</h1>
        <p className="mt-2 text-sm text-muted-foreground">链接可能过期、被撤销，或打开次数已经用完。</p>
        <Link href="/login" className="mt-6 inline-block text-sm underline-offset-2 hover:underline">
          返回登录
        </Link>
      </main>
    );
  }
  return <PublicShareCard token={token} card={loaded.card} signedIn={loaded.signedIn} />;
}

async function loadPublicShare(token: string, unlocked: boolean) {
  try {
    const card = await readPublicShare(token, unlocked);
    const user = await getOptionalUser();
    return { status: "ok" as const, card, signedIn: Boolean(user) };
  } catch (error) {
    if (error instanceof ApiError && error.code === "share_passcode_required") {
      return { status: "passcode" as const };
    }
    return { status: "gone" as const };
  }
}
