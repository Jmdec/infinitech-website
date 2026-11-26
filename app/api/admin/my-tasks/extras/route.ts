// app/api/admin/my-tasks/extras/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/my-tasks/extras",
    request,
    forwardSession: true,
  });
}
