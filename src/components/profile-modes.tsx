"use client";

import * as React from "react";
import { Pencil } from "lucide-react";

import { PersonEditForm } from "@/components/person-edit-form";
import { Button } from "@/components/ui/button";
import type { TagOption } from "@/components/tag-combobox";
import type { ApiPerson } from "@/lib/types";

const ProfileModeContext = React.createContext<{
  editing: boolean;
  setEditing: (editing: boolean) => void;
} | null>(null);

function useProfileMode() {
  const value = React.useContext(ProfileModeContext);
  if (!value) throw new Error("Profile mode components must be inside ProfileModes");
  return value;
}

/** Switches a person profile between read-only display and a single edit form. */
export function ProfileModes({
  initialEditing = false,
  children,
}: {
  initialEditing?: boolean;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState(initialEditing);
  return <ProfileModeContext.Provider value={{ editing, setEditing }}>{children}</ProfileModeContext.Provider>;
}

export function ProfileView({ children }: { children: React.ReactNode }) {
  const { editing } = useProfileMode();
  if (editing) return null;
  return <div className="space-y-6">{children}</div>;
}

export function ProfileEdit({ children }: { children: React.ReactNode }) {
  const { editing } = useProfileMode();
  if (!editing) return null;
  return <div className="space-y-6">{children}</div>;
}

export function EnterEditButton() {
  const { setEditing } = useProfileMode();
  return (
    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
      <Pencil /> 编辑
    </Button>
  );
}

export function PersonEditPanel({ person, vocabulary }: { person: ApiPerson; vocabulary: TagOption[] }) {
  const { setEditing } = useProfileMode();
  return <PersonEditForm person={person} vocabulary={vocabulary} embedded onDone={() => setEditing(false)} />;
}
