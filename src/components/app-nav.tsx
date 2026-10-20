"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUser, Home, Radar, Share2, Users } from "lucide-react";

import { logoutAction } from "@/lib/auth/actions";
import { cn } from "cn";

function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="284 122 256 256" className={className} aria-hidden="true">
      <g fill="none" stroke="#6a2c3c" strokeWidth="10" strokeLinecap="round">
        <circle cx="412" cy="250" r="40" />
        <circle cx="412" cy="250" r="80" />
        <circle cx="412" cy="250" r="122" />
      </g>
      <g fill="#6a2c3c">
        <circle cx="412" cy="250" r="8" />
        <circle cx="456" cy="216" r="7" />
        <circle cx="358" cy="292" r="7" />
        <circle cx="490" cy="306" r="7" />
      </g>
    </svg>
  );
}

type NavItem = { href: string; label: string; mobile?: string; icon: typeof Home; exact?: boolean; desktopOnly?: boolean };

const ITEMS: NavItem[] = [
  { href: "/", label: "首页", icon: Home, exact: true },
  { href: "/people", label: "人脉", icon: Users },
  { href: "/map", label: "地图", icon: Radar },
  { href: "/shared", label: "分享", icon: Share2, desktopOnly: true },
  { href: "/settings", label: "设置", mobile: "我", icon: CircleUser },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (href === "/shared") return pathname === "/shared" || pathname.startsWith("/shares");
  if (href === "/settings") {
    return (
      pathname === "/settings" ||
      pathname.startsWith("/settings/") ||
      pathname.startsWith("/tags") ||
      pathname.startsWith("/inbox") ||
      pathname.startsWith("/reminders") ||
      pathname.startsWith("/admin")
    );
  }
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Top bar on desktop, bottom tab bar on phones. */
export function AppNav({
  pendingCount,
  user,
}: {
  pendingCount: number;
  user?: { name: string; username: string | null; role: string } | null;
}) {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-40 hidden border-b bg-background/90 backdrop-blur md:block">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <BrandMark className="size-5" />
            朋友圈
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {ITEMS.map(({ href, label, exact }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
                  isActive(pathname, href, exact) && "bg-muted text-foreground",
                )}
              >
                {label}
                {href === "/settings" && pendingCount > 0 ? (
                  <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{pendingCount}</span>
                ) : null}
              </Link>
            ))}
          </nav>
          {user ? (
            <details className="relative ml-auto">
              <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">
                {user.name.slice(0, 1)}
              </summary>
              <div className="absolute right-0 z-50 mt-2 w-44 rounded-lg border bg-popover p-1 text-sm shadow-md">
                <p className="px-2 py-1.5">
                  <span className="block font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">@{user.username}</span>
                </p>
                <Link href="/settings" className="block rounded-md px-2 py-1.5 hover:bg-muted">设置</Link>
                <Link href="/settings/security" className="block rounded-md px-2 py-1.5 hover:bg-muted">安全</Link>
                <Link href="/settings/tokens" className="block rounded-md px-2 py-1.5 hover:bg-muted">API 令牌</Link>
                {user.role === "admin" ? <Link href="/admin/users" className="block rounded-md px-2 py-1.5 hover:bg-muted">管理后台</Link> : null}
                <form action={logoutAction}>
                  <button type="submit" className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted">退出登录</button>
                </form>
              </div>
            </details>
          ) : null}
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-3xl grid-cols-4">
          {ITEMS.filter((item) => !item.desktopOnly).map(({ href, label, mobile, icon: Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "relative flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground",
                    active && "text-foreground",
                  )}
                >
                  <Icon className={cn("size-5", active && "stroke-[2.5]")} />
                  <span className="md:hidden">{mobile ?? label}</span>
                  <span className="hidden md:inline">{label}</span>
                  {href === "/settings" && pendingCount > 0 ? (
                    <span className="absolute top-1 right-[calc(50%-1.1rem)] min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
                      {pendingCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
