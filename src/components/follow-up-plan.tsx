import { setFollowUpStatusAction } from "@/lib/followups/actions";
import { followUpOffsetLabel, followUpPhase } from "@/lib/followups/plan";
import { formatDay } from "@/lib/format";
import type { PersonFollowUp } from "@/lib/services/follow-ups";
import { todayIso } from "@/lib/services/db-client";

const PHASE_CLASS: Record<ReturnType<typeof followUpPhase>, string> = {
  未到期: "bg-muted text-muted-foreground",
  该回访了: "bg-amber-50 text-amber-800 ring-1 ring-amber-200 ring-inset",
  已完成: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 ring-inset",
  已跳过: "bg-muted text-muted-foreground",
};

export function FollowUpPlan({ personId, steps }: { personId: string; steps: PersonFollowUp[] }) {
  if (steps.length === 0) return null;
  const today = todayIso();
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">回访</h2>
        <p className="text-xs text-muted-foreground">从加入人脉库的那天算起，不是认识的那天。</p>
      </div>
      <ol className="divide-y rounded-xl border bg-card">
        {steps.map((step) => {
          const phase = followUpPhase(step.status, step.due_on, today);
          return (
            <li key={step.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {followUpOffsetLabel(step.offset_days)} · {formatDay(step.due_on)}
                </p>
                <p className="mt-0.5 text-sm">{step.suggestion}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_CLASS[phase]}`}>{phase}</span>
                {phase === "该回访了" ? (
                  <div className="flex gap-2">
                    <form action={setFollowUpStatusAction}>
                      <input type="hidden" name="id" value={step.id} />
                      <input type="hidden" name="person_id" value={personId} />
                      <input type="hidden" name="status" value="done" />
                      <button type="submit" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                        完成
                      </button>
                    </form>
                    <form action={setFollowUpStatusAction}>
                      <input type="hidden" name="id" value={step.id} />
                      <input type="hidden" name="person_id" value={personId} />
                      <input type="hidden" name="status" value="skipped" />
                      <button type="submit" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                        跳过
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
