import { AppNav } from "@/components/app-nav";
import { getProfile } from "@/lib/auth/account";
import { getOptionalUser } from "@/lib/auth/dal";
import { countPendingInbox } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getOptionalUser();
  const profile = user ? await getProfile(user.userId) : null;
  const pendingCount = user ? await countPendingInbox(user).catch(() => 0) : 0;
  return (
    <>
      <AppNav pendingCount={pendingCount} user={profile} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-24 md:pt-6 md:pb-10">{children}</main>
    </>
  );
}
