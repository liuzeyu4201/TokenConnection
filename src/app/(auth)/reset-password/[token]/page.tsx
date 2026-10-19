import { redirect } from "next/navigation";

export default async function ResetPasswordTokenPage({
  params,
  searchParams,
}: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  const raw = await searchParams;
  const callback = typeof raw.callbackURL === "string" ? raw.callbackURL : "/reset-password";
  redirect(`${callback}${callback.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`);
}
