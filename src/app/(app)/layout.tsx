import { AppNav } from "@/components/app-nav";
import { countPendingInbox } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const pendingCount = await countPendingInbox().catch(() => 0);
  return (
    <>
      <AppNav pendingCount={pendingCount} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-24 md:pt-6 md:pb-10">{children}</main>
    </>
  );
}
