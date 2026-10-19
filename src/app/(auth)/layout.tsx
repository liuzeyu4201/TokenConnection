export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <p className="text-lg font-semibold">朋友圈</p>
          <p className="text-sm text-muted-foreground">一句话记人，一句话找人</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
