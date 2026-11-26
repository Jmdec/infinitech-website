// app/api/admin/my-tasks/leaderboard/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  return proxyJson({
    method: "PATCH",
    path: "/api/admin/my-tasks/leaderboard",
    request,
    body: await request.json().catch(() => ({})),
    forwardSession: true,
  });
}
