import type { Metadata } from "next";

import { TwoFactorForm } from "@/components/two-factor-form";
import { safeNextPath } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "两步验证" };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const raw = await searchParams;
  const next = safeNextPath(raw.next);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">两步验证</h1>
      <p className="text-sm text-muted-foreground">密码已经通过。再输入验证码，或一张还没用过的恢复码。</p>
      <TwoFactorForm next={next} />
    </div>
  );
}
