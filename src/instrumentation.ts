export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) return;
  const { getSql } = await import("@/db");
  const { startupRoleDecision, startupRoleMessage } = await import("@/lib/auth/rls-check");
  try {
    const sql = getSql();
    const [row] = await sql<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolsuper, rolbypassrls from pg_roles where rolname = current_user
    `;
    if (!row) return;
    const decision = startupRoleDecision(row, process.env.NODE_ENV ?? "development");
    if (decision === "refuse") throw new Error(startupRoleMessage(row));
    if (decision === "warn") console.warn(startupRoleMessage(row));
    if (process.env.API_TOKEN?.trim()) console.warn("API_TOKEN is deprecated; it remains valid only as a legacy personal access token after /setup");
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    console.warn("[auth] startup role check skipped:", error instanceof Error ? error.message : error);
  }
}
