import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userSettings } from "@/db/schema";

export type PrivacySettings = {
  llm_enabled: boolean;
  redact_contacts: boolean;
  vision_enabled: boolean;
  notify_share_email: boolean;
  follow_up_enabled: boolean;
};

const DEFAULTS: PrivacySettings = {
  llm_enabled: true,
  redact_contacts: true,
  vision_enabled: true,
  notify_share_email: false,
  follow_up_enabled: true,
};

export async function ensureUserSettings(userId: string): Promise<PrivacySettings> {
  await db.insert(userSettings).values({ user_id: userId }).onConflictDoNothing();
  return getPrivacySettings(userId);
}

export async function getPrivacySettings(userId: string): Promise<PrivacySettings> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.user_id, userId)).limit(1);
  if (!row) return { ...DEFAULTS };
  return {
    llm_enabled: row.llm_enabled,
    redact_contacts: row.redact_contacts,
    vision_enabled: row.vision_enabled,
    notify_share_email: row.notify_share_email,
    follow_up_enabled: row.follow_up_enabled,
  };
}

export async function updatePrivacySettings(
  userId: string,
  patch: Partial<PrivacySettings>,
): Promise<PrivacySettings> {
  await ensureUserSettings(userId);
  const [row] = await db
    .update(userSettings)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(userSettings.user_id, userId))
    .returning();
  return {
    llm_enabled: row.llm_enabled,
    redact_contacts: row.redact_contacts,
    vision_enabled: row.vision_enabled,
    notify_share_email: row.notify_share_email,
    follow_up_enabled: row.follow_up_enabled,
  };
}
