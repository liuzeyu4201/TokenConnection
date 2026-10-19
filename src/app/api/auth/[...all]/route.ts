import { toNextJsHandler } from "better-auth/next-js";

import { notePasswordAttempt } from "@/lib/auth/login-guard";
import { auth } from "@/lib/auth/server";
import { clientIp } from "@/lib/audit";

const handler = toNextJsHandler(auth);

async function note(request: Request, response: Response) {
  const url = new URL(request.url);
  const path = url.pathname;
  const signIn = path.endsWith("/sign-in/email") || path.endsWith("/sign-in/username");
  if (!signIn || request.method !== "POST") return response;
  const body = (await request.clone().json().catch(() => null)) as { email?: string; username?: string } | null;
  if (!body) return response;
  await notePasswordAttempt({ email: body.email, username: body.username }, response.ok, clientIp(request.headers));
  return response;
}

export async function GET(request: Request) {
  return handler.GET(request);
}

export async function POST(request: Request) {
  const response = await handler.POST(request);
  return note(request, response);
}
