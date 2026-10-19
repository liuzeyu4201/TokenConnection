import { eq, ne } from "drizzle-orm";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { username } from "better-auth/plugins/username";

import { db } from "@/db";
import { authSchema, pendingResetLinks, users } from "@/db/schema";

import { audit, clientIp } from "@/lib/audit";
import { finishNewUser, instanceHasUsers, rememberUsersExist } from "./bootstrap";
import { checkInvite, hashInviteCode, inviteFailureMessage } from "./invite";
import { findUserByIdentity, loginBlockReason } from "./login-guard";
import { passwordProblems } from "./password-policy";
import { encryptSecret } from "./secret-box";
import { readIdleDays, sessionIdleSeconds, sessionUpdateAgeSeconds } from "./session-policy";
import { sha256Hex } from "./pat";

function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing required environment variable BETTER_AUTH_SECRET");
  }
  return "dev-only-secret-change-me-please-32b";
}

function authBaseUrl(): string {
  return process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
}

function openSignup(): boolean {
  return process.env.AUTH_OPEN_SIGNUP === "true";
}

async function storeResetLink(userId: string, url: string, issuedBy: string | null): Promise<void> {
  const expires = new Date(Date.now() + 15 * 60 * 1000);
  await db.insert(pendingResetLinks).values({
    user_id: userId,
    url_hash: sha256Hex(url),
    url_encrypted: encryptSecret(url),
    issued_by: issuedBy,
    expires_at: expires,
  });
}

export const auth = betterAuth({
  appName: "朋友圈",
  baseURL: authBaseUrl(),
  secret: authSecret(),
  trustedOrigins: [authBaseUrl()],
  telemetry: { enabled: false },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
    usePlural: true,
  }),
  advanced: {
    database: { generateId: "uuid" },
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  session: {
    expiresIn: sessionIdleSeconds(readIdleDays()),
    updateAge: sessionUpdateAgeSeconds(),
    cookieCache: { enabled: false },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    requireEmailVerification: false,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 15 * 60,
    sendResetPassword: async ({ user, url }, request) => {
      // No mailer in A 期. The link is stored for an admin to copy.
      // A configured SMTP_URL is logged so it is obvious mail was not sent.
      if (process.env.SMTP_URL?.trim()) {
        console.warn("[auth] SMTP_URL is set but this build does not send mail; the reset link was stored for an admin.");
      }
      await storeResetLink(user.id, url, null);
      void request;
    },
    onPasswordReset: async ({ user }, request) => {
      await audit({
        action: "auth.password.reset",
        actorUserId: user.id,
        subjectUserId: user.id,
        ip: request ? clientIp(request.headers) : null,
        userAgent: request?.headers.get("user-agent"),
      });
    },
  },
  user: {
    additionalFields: {
      status: { type: "string", required: true, defaultValue: "active", input: false },
      failedLoginCount: { type: "number", required: false, defaultValue: 0, input: false, returned: false },
      lockedUntil: { type: "date", required: false, input: false, returned: false },
      inviteCode: { type: "string", required: false, input: true, returned: false },
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/*": { window: 60, max: 10 },
      "/sign-up/*": { window: 60, max: 10 },
      "/request-password-reset": { window: 60, max: 10 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const first = !(await instanceHasUsers());
          return {
            data: {
              ...user,
              role: first ? "admin" : (user.role ?? "member"),
              status: "active",
            },
          };
        },
        after: async (user, context) => {
          const others = await db.select({ id: users.id }).from(users).where(ne(users.id, user.id)).limit(1);
          const inviteCode = typeof user.inviteCode === "string" ? user.inviteCode : null;
          await finishNewUser({
            userId: user.id,
            inviteCode,
            isFirst: others.length === 0,
            ip: context?.request ? clientIp(context.request.headers) : null,
            userAgent: context?.request?.headers.get("user-agent") ?? null,
          });
          if (inviteCode) {
            await db.update(users).set({ inviteCode: null }).where(eq(users.id, user.id));
          }
          rememberUsersExist();
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const body = (ctx.body ?? {}) as {
        email?: string;
        username?: string;
        password?: string;
        newPassword?: string;
        inviteCode?: string;
      };
      if (ctx.path === "/sign-up/email" || ctx.path === "/reset-password" || ctx.path === "/change-password") {
        const password = ctx.path === "/sign-up/email" ? body.password : body.newPassword;
        if (password) {
          const problems = passwordProblems(password, { email: body.email, username: body.username });
          if (problems.length > 0) {
            throw APIError.from("BAD_REQUEST", { message: problems[0]!, code: "WEAK_PASSWORD" });
          }
        }
      }
      if (ctx.path === "/sign-in/email" || ctx.path === "/sign-in/username") {
        const user = await findUserByIdentity({ email: body.email, username: body.username });
        const blocked = loginBlockReason(user);
        if (blocked) {
          throw APIError.from(blocked.includes("停用") ? "FORBIDDEN" : "TOO_MANY_REQUESTS", {
            message: blocked,
            code: blocked.includes("停用") ? "ACCOUNT_DISABLED" : "ACCOUNT_LOCKED",
          });
        }
      }
      if (ctx.path !== "/sign-up/email") return;
      if (!(await instanceHasUsers())) return;
      if (openSignup()) return;
      const email = body.email ?? "";
      const code = body.inviteCode?.trim();
      if (!code) throw APIError.from("FORBIDDEN", { message: inviteFailureMessage("missing"), code: "INVITE_REQUIRED" });
      const { invites } = await import("@/db/schema");
      const [invite] = await db.select().from(invites).where(eq(invites.code_hash, hashInviteCode(code))).limit(1);
      const verdict = checkInvite(
        invite
          ? { expiresAt: invite.expires_at, usedAt: invite.used_at, revokedAt: invite.revoked_at, email: invite.email }
          : null,
        email,
      );
      if (!verdict.ok) throw APIError.from("FORBIDDEN", { message: inviteFailureMessage(verdict.reason), code: "INVITE_REJECTED" });
    }),
  },
  plugins: [
    username({
      displayUsername: false,
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value) => /^[\p{L}\p{N}_.-]+$/u.test(value),
    }),
    admin({
      defaultRole: "member",
      adminRoles: ["admin"],
    }),
    // Must stay last so Server Actions persist the session cookie.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
