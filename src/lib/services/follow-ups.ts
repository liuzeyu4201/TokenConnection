import { and, asc, eq } from "drizzle-orm";

import { followUps, people } from "@/db/schema";
import type { ServiceContext } from "@/lib/auth/context";
import { getPrivacySettings } from "@/lib/auth/settings";
import { withTenant } from "@/lib/auth/tenant";
import { consumeQuota } from "@/lib/auth/usage";
import { formatDay } from "@/lib/format";
import {
  followUpPromptFields,
  followUpSchedule,
  suggestFollowUps,
  type FollowUpSuggestions,
} from "@/lib/followups/plan";
import { generateFollowUpSuggestions } from "@/lib/llm/follow-up";
import { isMockProvider } from "@/lib/llm/provider";
import type { FollowUpStatus, Tier } from "@/lib/schemas/enums";

import { todayIso, type DbClient } from "./db-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PersonFollowUp = {
  id: string;
  offset_days: number;
  due_on: string;
  suggestion: string;
  status: FollowUpStatus;
};

export type PendingFollowUp = {
  id: string;
  offset_days: number;
  due_on: string;
  suggestion: string;
  status: FollowUpStatus;
  person: { id: string; name: string; tier: Tier };
};

function dateOnly(value: string | Date): string {
  return formatDay(value);
}

/**
 * Write the four-step plan once, the first time this person is stored.
 * Later edits do not call this, and an existing plan is left as the user left it.
 * A closed switch, a mock model, or a failed call must not fail the save.
 */
export async function ensureFollowUpPlan(ctx: ServiceContext, personId: string): Promise<void> {
  try {
    const settings = await getPrivacySettings(ctx.userId);
    if (!settings.follow_up_enabled) return;

    const person = await withTenant(ctx, async (tx) => {
      const [row] = await tx
        .select({
          id: people.id,
          how_met: people.how_met,
          summary: people.summary,
          created_at: people.created_at,
        })
        .from(people)
        .where(and(eq(people.id, personId), eq(people.owner_id, ctx.userId)))
        .limit(1);
      if (!row) return null;
      const [existing] = await tx
        .select({ id: followUps.id })
        .from(followUps)
        .where(and(eq(followUps.person_id, personId), eq(followUps.owner_id, ctx.userId)))
        .limit(1);
      if (existing) return null;
      return row;
    });
    if (!person) return;

    const suggestions = await buildSuggestions(ctx, person.how_met, person.summary, settings);
    const schedule = followUpSchedule(todayIso(person.created_at));
    await withTenant(ctx, async (tx) => {
      await tx
        .insert(followUps)
        .values(
          schedule.map((step, index) => ({
            owner_id: ctx.userId,
            person_id: personId,
            offset_days: step.offset_days,
            due_on: step.due_on,
            suggestion: suggestions[index],
            status: "pending" as const,
          })),
        )
        .onConflictDoNothing({ target: [followUps.person_id, followUps.offset_days] });
    });
  } catch (error) {
    console.error("[follow-up] 没能写入回访方案", personId, error);
  }
}

async function buildSuggestions(
  ctx: ServiceContext,
  howMet: string | null,
  summary: string | null,
  settings: { llm_enabled: boolean; redact_contacts: boolean },
): Promise<FollowUpSuggestions> {
  const llmEnabled = settings.llm_enabled && !isMockProvider();
  const canAsk =
    llmEnabled &&
    followUpPromptFields({ howMet, summary, redact: settings.redact_contacts }) !== null;
  let generate: ((prompt: string) => Promise<unknown>) | undefined;
  if (canAsk) {
    const quota = await consumeQuota(ctx.userId, "extract");
    if (quota.ok) {
      generate = async (prompt) => {
        try {
          return await generateFollowUpSuggestions(prompt);
        } catch (error) {
          console.error("[follow-up] 模型没能生成，改用模板", error instanceof Error ? error.name : "error");
          throw error;
        }
      };
    }
  }
  const outcome = await suggestFollowUps(
    { howMet, summary, llmEnabled, redact: settings.redact_contacts },
    generate,
  );
  return outcome.suggestions;
}

export async function listPersonFollowUps(ctx: ServiceContext, personId: string): Promise<PersonFollowUp[]> {
  return withTenant(ctx, async (tx) => loadPersonFollowUps(ctx, personId, tx));
}

async function loadPersonFollowUps(ctx: ServiceContext, personId: string, tx: DbClient): Promise<PersonFollowUp[]> {
  const rows = await tx
    .select({
      id: followUps.id,
      offset_days: followUps.offset_days,
      due_on: followUps.due_on,
      suggestion: followUps.suggestion,
      status: followUps.status,
    })
    .from(followUps)
    .where(and(eq(followUps.person_id, personId), eq(followUps.owner_id, ctx.userId)))
    .orderBy(asc(followUps.offset_days));
  return rows.map((row) => ({ ...row, due_on: dateOnly(row.due_on) }));
}

export async function listPendingFollowUps(ctx: ServiceContext): Promise<PendingFollowUp[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: followUps.id,
        offset_days: followUps.offset_days,
        due_on: followUps.due_on,
        suggestion: followUps.suggestion,
        status: followUps.status,
        person_id: people.id,
        name: people.name,
        tier: people.tier,
      })
      .from(followUps)
      .innerJoin(people, and(eq(people.id, followUps.person_id), eq(people.owner_id, ctx.userId)))
      .where(and(eq(followUps.owner_id, ctx.userId), eq(followUps.status, "pending")));
    return rows.map((row) => ({
      id: row.id,
      offset_days: row.offset_days,
      due_on: dateOnly(row.due_on),
      suggestion: row.suggestion,
      status: row.status,
      person: { id: row.person_id, name: row.name, tier: row.tier },
    }));
  });
}

export async function setFollowUpStatus(
  ctx: ServiceContext,
  id: string,
  status: "done" | "skipped",
): Promise<void> {
  if (!UUID_RE.test(id)) return;
  const today = todayIso();
  await withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ status: followUps.status, due_on: followUps.due_on })
      .from(followUps)
      .where(and(eq(followUps.id, id), eq(followUps.owner_id, ctx.userId)))
      .limit(1);
    if (!row || row.status !== "pending") return;
    if (dateOnly(row.due_on) > today) return;
    await tx
      .update(followUps)
      .set({ status, completed_at: new Date() })
      .where(and(eq(followUps.id, id), eq(followUps.owner_id, ctx.userId), eq(followUps.status, "pending")));
  });
}
