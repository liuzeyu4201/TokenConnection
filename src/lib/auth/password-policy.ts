export const MIN_PASSWORD_LENGTH = 10;

export const LOGIN_FAIL_LIMIT = 10;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

export function passwordProblems(
  password: string,
  identity: { email?: string | null; username?: string | null } = {},
): string[] {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) problems.push(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
  const lower = password.toLowerCase();
  if (identity.email && lower === identity.email.trim().toLowerCase()) problems.push("密码不能与邮箱相同");
  if (identity.username && lower === identity.username.trim().toLowerCase()) problems.push("密码不能与用户名相同");
  return problems;
}

export function isAccountLocked(lockedUntil: Date | null | undefined, now = new Date()): boolean {
  return lockedUntil != null && lockedUntil.getTime() > now.getTime();
}

/** Next counter after one failed password attempt. The 10th failure starts the 15-minute lock. */
export function lockoutAfterFailure(
  failedCount: number,
  now = new Date(),
): { failedLoginCount: number; lockedUntil: Date | null } {
  const failedLoginCount = failedCount + 1;
  if (failedLoginCount >= LOGIN_FAIL_LIMIT) {
    return { failedLoginCount, lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MS) };
  }
  return { failedLoginCount, lockedUntil: null };
}
