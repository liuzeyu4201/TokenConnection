export type RoleFlags = { rolsuper: boolean; rolbypassrls: boolean };

/** True when this connection would skip RLS (superuser or BYPASSRLS). */
export function roleBypassesRls(role: RoleFlags): boolean {
  return role.rolsuper || role.rolbypassrls;
}

export type StartupRoleDecision = "ok" | "warn" | "refuse";

/**
 * Production refuses to boot on a role that bypasses RLS.
 * Development only warns, so a local superuser URL still starts.
 */
export function startupRoleDecision(role: RoleFlags, env: "production" | "development" | string): StartupRoleDecision {
  if (!roleBypassesRls(role)) return "ok";
  return env === "production" ? "refuse" : "warn";
}

export function startupRoleMessage(role: RoleFlags): string {
  const why = role.rolsuper ? "superuser" : "BYPASSRLS";
  return `数据库角色绕过了行级安全（${why}）。应用必须使用 tc_app（NOBYPASSRLS）。请把 DATABASE_URL 改成 tc_app 的连接串。`;
}
