import { NextResponse } from "next/server";

import { route } from "@/lib/api/handler";
import { exportAccountZip } from "@/lib/auth/account-data";

export const POST = route(async (_request, _ctx, auth) => {
  const bytes = await exportAccountZip(auth);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="tokenconnection-export.zip"',
    },
  });
}, { session: "required" });
