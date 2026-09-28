export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
