"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, Radar, Tags, Users } from "lucide-react";
import { cn } from "cn";

type NavItem = { href: string; label: string; icon: typeof Home; exact?: boolean };

const ITEMS: NavItem[] = [
  { href: "/", label: "首页", icon: Home, exact: true },
  { href: "/people", label: "人脉", icon: Users },
  { href: "/map", label: "地图", icon: Radar },
  { href: "/tags", label: "标签", icon: Tags },
  { href: "/inbox", label: "收件箱", icon: Inbox },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Top bar on desktop, bottom tab bar on phones. */
export function AppNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-40 hidden border-b bg-background/90 backdrop-blur md:block">
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-block size-5 rounded-full border-[3px] border-foreground" />
            人脉
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
                {href === "/inbox" && pendingCount > 0 ? (
                  <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{pendingCount}</span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {ITEMS.map(({ href, label, icon: Icon, exact }) => {
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
                  {label}
                  {href === "/inbox" && pendingCount > 0 ? (
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
