// app/api/admin/leave-credits/convert/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function POST(request: NextRequest) {
  return proxyJson({
    method: "POST",
    path: "/api/admin/leave-credits/convert",
    body: await request.json(),
    request,
    forwardSession: true,
  });
}
