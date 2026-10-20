"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { audit, clientIp } from "@/lib/audit";
import { enableRowLevelSecurity } from "@/db/enable-rls";

import {
  contentCounts,
  createInvite,
  createToken,
  findInvite,
  getProfile,
  latestResetLink,
  listInvites,
  listTokens,
  listUsersForAdmin,
  revokeInvite,
  revokeToken,
  setUserDisabled,
} from "./account";
import { instanceHasUsers } from "./bootstrap";
import { safeNextPath } from "./dal";
import { checkInvite, inviteFailureMessage } from "./invite";
import { findUserByIdentity, loginBlockReason, notePasswordAttempt } from "./login-guard";
import { passwordProblems } from "./password-policy";
import { auth } from "./server";
import { getPrivacySettings, updatePrivacySettings } from "./settings";
import { readUsage } from "./usage";
import { SCOPE_PRESETS, type Scope } from "./context";
import { requireUser } from "./dal";

export type FormState = { message?: string; token?: string; url?: string } | undefined;

function originFrom(headerStore: Headers): string {
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function setupAction(_state: FormState, formData: FormData): Promise<FormState> {
  if (await instanceHasUsers()) return { message: "这个实例已经初始化" };
  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!name || !username || !email) return { message: "请填写名字、用户名和邮箱" };
  if (password !== confirm) return { message: "两次密码不一致" };
  const problems = passwordProblems(password, { email, username });
  if (problems.length > 0) return { message: problems[0] };
  const headerStore = await headers();
  try {
    await auth.api.signUpEmail({
      body: { name, email, password, username },
      headers: headerStore,
    });
  } catch (error) {
    return { message: error instanceof Error ? error.message : "创建管理员失败" };
  }
  await enableRowLevelSecurity();
  redirect("/");
}

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  if (!(await instanceHasUsers())) redirect("/setup");
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/"));
  const identity = identifier.includes("@") ? { email: identifier } : { username: identifier };
  const existing = await findUserByIdentity(identity);
  const blocked = loginBlockReason(existing);
  if (blocked) return { message: blocked };
  const headerStore = await headers();
  try {
    const result = identity.email
      ? await auth.api.signInEmail({ body: { email: identity.email, password }, headers: headerStore })
      : await auth.api.signInUsername({ body: { username: identity.username ?? "", password }, headers: headerStore });
    if (result && typeof result === "object" && "twoFactorRedirect" in result && result.twoFactorRedirect) {
      redirect(`/two-factor?next=${encodeURIComponent(next)}`);
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    await notePasswordAttempt(identity, false, clientIp(headerStore));
    return { message: "邮箱、用户名或密码不正确" };
  }
  await notePasswordAttempt(identity, true, clientIp(headerStore));
  redirect(next);
}

export async function registerAction(_state: FormState, formData: FormData): Promise<FormState> {
  const open = process.env.AUTH_OPEN_SIGNUP === "true";
  const invite = String(formData.get("invite") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!open && !invite) return { message: inviteFailureMessage("missing") };
  if (password !== confirm) return { message: "两次密码不一致" };
  const problems = passwordProblems(password, { email, username });
  if (problems.length > 0) return { message: problems[0] };
  if (!open) {
    const row = await findInvite(invite);
    const verdict = checkInvite(
      row ? { expiresAt: row.expires_at, usedAt: row.used_at, revokedAt: row.revoked_at, email: row.email } : null,
      email,
    );
    if (!verdict.ok) return { message: inviteFailureMessage(verdict.reason) };
  }
  const headerStore = await headers();
  try {
    await auth.api.signUpEmail({
      body: { name, email, password, username, inviteCode: invite || undefined },
      headers: headerStore,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "注册失败";
    return { message: message.includes("invite") ? message : message || "注册失败" };
  }
  redirect("/");
}

export async function logoutAction() {
  const headerStore = await headers();
  try {
    const session = await auth.api.getSession({ headers: headerStore });
    await auth.api.signOut({ headers: headerStore });
    if (session?.user) {
      await audit({
        action: "auth.logout",
        actorUserId: session.user.id,
        ip: clientIp(headerStore),
        userAgent: headerStore.get("user-agent"),
      });
    }
  } catch {
    // still leave the page
  }
  redirect("/login");
}

export async function changePasswordAction(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireUser("/settings/security");
  const currentPassword = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const profile = await getProfile(ctx.userId);
  if (next !== confirm) return { message: "两次密码不一致" };
  const problems = passwordProblems(next, { email: profile?.email, username: profile?.username });
  if (problems.length > 0) return { message: problems[0] };
  const headerStore = await headers();
  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword: next, revokeOtherSessions: true },
      headers: headerStore,
    });
  } catch {
    return { message: "当前密码不正确" };
  }
  await audit({ action: "auth.password.changed", actorUserId: ctx.userId, ip: clientIp(headerStore) });
  return { message: "密码已更新，其它设备已退出登录" };
}

export async function revokeSessionAction(formData: FormData) {
  await requireUser("/settings/sessions");
  const token = String(formData.get("token") ?? "");
  if (!token) return;
  const headerStore = await headers();
  await auth.api.revokeSession({ body: { token }, headers: headerStore });
  const session = await auth.api.getSession({ headers: headerStore });
  await audit({ action: "auth.session.revoked", actorUserId: session?.user.id, meta: { all: false } });
  redirect("/settings/sessions");
}

export async function revokeOtherSessionsAction() {
  const ctx = await requireUser("/settings/sessions");
  const headerStore = await headers();
  await auth.api.revokeOtherSessions({ headers: headerStore });
  await audit({ action: "auth.session.revoked", actorUserId: ctx.userId, meta: { all: true } });
  redirect("/settings/sessions");
}

export async function createTokenAction(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireUser("/settings/tokens");
  const name = String(formData.get("name") ?? "").trim();
  const preset = String(formData.get("preset") ?? "shortcut");
  const daysRaw = String(formData.get("days") ?? "365");
  if (!name) return { message: "请填写名字" };
  const scopes: Scope[] =
    preset === "full" ? [...SCOPE_PRESETS.full] : preset === "readonly" ? [...SCOPE_PRESETS.readonly] : [...SCOPE_PRESETS.shortcut];
  const expiresInDays = daysRaw === "never" ? null : Number(daysRaw);
  try {
    const created = await createToken(ctx, { name, scopes, expiresInDays });
    return { token: created.token, message: "令牌已创建。关闭后不会再显示明文。" };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "创建失败" };
  }
}

export async function revokeTokenAction(formData: FormData) {
  const ctx = await requireUser("/settings/tokens");
  await revokeToken(ctx, String(formData.get("id") ?? ""));
  redirect("/settings/tokens");
}

export async function updatePrivacyAction(formData: FormData) {
  const ctx = await requireUser("/settings/privacy");
  const next = await updatePrivacySettings(ctx.userId, {
    llm_enabled: formData.get("llm_enabled") === "on",
    redact_contacts: formData.get("redact_contacts") === "on",
    vision_enabled: formData.get("vision_enabled") === "on",
    notify_share_email: formData.get("notify_share_email") === "on",
  });
  await audit({
    action: "privacy.updated",
    actorUserId: ctx.userId,
    meta: {
      llm_enabled: next.llm_enabled,
      redact_contacts: next.redact_contacts,
      vision_enabled: next.vision_enabled,
    },
  });
  redirect("/settings/privacy");
}

export async function updateProfileAction(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireUser("/settings/account");
  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!name || !username || !email) return { message: "名字、用户名和邮箱都不能空" };
  const headerStore = await headers();
  try {
    await auth.api.updateUser({ body: { name, username }, headers: headerStore });
  } catch (error) {
    return { message: error instanceof Error ? error.message : "保存失败" };
  }
  const current = await getProfile(ctx.userId);
  if (current && email.toLowerCase() !== current.email.toLowerCase()) {
    const { users } = await import("@/db/schema");
    const { db } = await import("@/db");
    const { eq, sql } = await import("drizzle-orm");
    const [taken] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
    if (taken && taken.id !== ctx.userId) return { message: "这个邮箱已被使用" };
    await db.update(users).set({ email, updatedAt: new Date() }).where(eq(users.id, ctx.userId));
  }
  redirect("/settings/account");
}

export async function createInviteAction(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireUser("/admin/invites");
  const headerStore = await headers();
  try {
    const created = await createInvite(
      ctx,
      { email: String(formData.get("email") ?? ""), role: String(formData.get("role") ?? "member"), days: 7 },
      originFrom(headerStore),
    );
    return { url: created.url, message: "邀请已创建。链接只显示这一次。" };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "创建失败" };
  }
}

export async function revokeInviteAction(formData: FormData) {
  const ctx = await requireUser("/admin/invites");
  await revokeInvite(ctx, String(formData.get("id") ?? ""));
  redirect("/admin/invites");
}

export async function resetTwoFactorAction(formData: FormData) {
  const ctx = await requireUser("/admin/users");
  const id = String(formData.get("id") ?? "");
  try {
    const { resetUserTwoFactor } = await import("./account");
    await resetUserTwoFactor(ctx, id);
  } catch (error) {
    console.error(error);
  }
  redirect("/admin/users");
}

export async function disableUserAction(formData: FormData) {
  const ctx = await requireUser("/admin/users");
  const id = String(formData.get("id") ?? "");
  const disabled = String(formData.get("disabled") ?? "1") !== "0";
  try {
    await setUserDisabled(ctx, id, disabled);
  } catch (error) {
    console.error(error);
  }
  redirect("/admin/users");
}

export async function issueResetLinkAction(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireUser("/admin/users");
  if (ctx.role !== "admin") return { message: "需要管理员权限" };
  const userId = String(formData.get("id") ?? "");
  const profile = await getProfile(userId);
  if (!profile) return { message: "用户不存在" };
  const headerStore = await headers();
  await auth.api.requestPasswordReset({
    body: { email: profile.email, redirectTo: "/reset-password" },
    headers: headerStore,
  });
  const link = await latestResetLink(userId);
  await audit({ action: "admin.user.reset_link_issued", actorUserId: ctx.userId, subjectUserId: userId, targetType: "user", targetId: userId });
  if (!link) return { message: "没能生成重置链接" };
  return { url: link.url, message: "把这个链接发给对方。15 分钟内有效，只能用一次。" };
}

export async function loadSessions() {
  const headerStore = await headers();
  await requireUser("/settings/sessions");
  const rows = await auth.api.listSessions({ headers: headerStore });
  const current = await auth.api.getSession({ headers: headerStore });
  return { rows, currentToken: current?.session.token ?? "" };
}

export async function loadPrivacy() {
  const ctx = await requireUser("/settings/privacy");
  const [settings, usage] = await Promise.all([getPrivacySettings(ctx.userId), readUsage(ctx.userId)]);
  return { settings, usage };
}

export async function loadTokens() {
  const ctx = await requireUser("/settings/tokens");
  return listTokens(ctx.userId);
}

export async function loadAdminUsers() {
  const ctx = await requireUser("/admin/users");
  if (ctx.role !== "admin") redirect("/settings");
  return listUsersForAdmin();
}

export async function loadAdminInvites() {
  const ctx = await requireUser("/admin/invites");
  if (ctx.role !== "admin") redirect("/settings");
  return listInvites();
}

export async function loadSetupPreview() {
  if (await instanceHasUsers()) return null;
  const counts = await contentCounts();
  return { ...counts, legacy: Boolean(process.env.API_TOKEN?.trim()) };
}
