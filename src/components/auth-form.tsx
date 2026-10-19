"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/actions";

export function AuthForm({
  action,
  submitLabel,
  fields,
  hidden,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  fields: Array<{ name: string; label: string; type?: string; defaultValue?: string; autoComplete?: string; required?: boolean }>;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      {hidden
        ? Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)
        : null}
      {state?.message ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.message}</p> : null}
      {state?.token ? (
        <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">{state.token}</p>
      ) : null}
      {state?.url ? <p className="break-all rounded-md bg-muted px-3 py-2 text-xs">{state.url}</p> : null}
      {fields.map((field) => (
        <label key={field.name} className="block space-y-1 text-sm">
          <span>{field.label}</span>
          <Input name={field.name} type={field.type ?? "text"} defaultValue={field.defaultValue} autoComplete={field.autoComplete} required={field.required !== false} />
        </label>
      ))}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "请稍候…" : submitLabel}
      </Button>
    </form>
  );
}
