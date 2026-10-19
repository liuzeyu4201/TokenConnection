import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { instanceHasUsers } from "./bootstrap";
import type { ServiceContext } from "./context";
import { isRejection, sessionContextFromHeaders } from "./request-context";

export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\n")) return fallback;
  return value;
}

export const getOptionalUser = cache(async (): Promise<ServiceContext | null> => {
  if (!(await instanceHasUsers())) return null;
  const result = await sessionContextFromHeaders(await headers());
  if (!result || isRejection(result)) return null;
  return result;
});

/** Secure check for a page. Layouts must not be the only gate (Next 16 partial rendering). */
export const requireUser = cache(async (nextPath = "/"): Promise<ServiceContext> => {
  if (!(await instanceHasUsers())) redirect("/setup");
  const user = await getOptionalUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  return user;
});

export async function requireAdmin(nextPath = "/admin/users"): Promise<ServiceContext> {
  const user = await requireUser(nextPath);
  if (user.role !== "admin") redirect("/settings");
  return user;
}

export async function redirectIfSignedIn(fallback = "/"): Promise<void> {
  const user = await getOptionalUser();
  if (user) redirect(fallback);
}
