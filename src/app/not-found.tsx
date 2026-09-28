import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">页面不存在</h1>
      <p className="text-sm text-muted-foreground">这个人或页面可能已经被删除。</p>
      <Link href="/" className="text-sm underline underline-offset-2">
        回到首页
      </Link>
    </main>
  );
}
