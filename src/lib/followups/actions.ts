"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/dal";
import { updatePrivacySettings } from "@/lib/auth/settings";
import { setFollowUpStatus } from "@/lib/services/follow-ups";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function updateFollowUpSettingAction(formData: FormData) {
  const ctx = await requireUser("/settings");
  await updatePrivacySettings(ctx.userId, {
    follow_up_enabled: formData.get("follow_up_enabled") === "on",
  });
  revalidatePath("/settings");
  revalidatePath("/people");
  revalidatePath("/reminders");
  revalidatePath("/");
  redirect("/settings");
}

export async function setFollowUpStatusAction(formData: FormData) {
  const ctx = await requireUser("/people");
  const id = String(formData.get("id") ?? "");
  const personId = String(formData.get("person_id") ?? "");
  const raw = String(formData.get("status") ?? "");
  if (raw !== "done" && raw !== "skipped") return;
  await setFollowUpStatus(ctx, id, raw);
  revalidatePath("/people");
  revalidatePath("/reminders");
  revalidatePath("/");
  if (UUID_RE.test(personId)) revalidatePath(`/people/${personId}`);
}
