// app/api/admin/task-management/kudos/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return proxyJson({
    method: "POST",
    path: "/api/admin/task-management/kudos",
    request,
    body: await request.json().catch(() => ({})),
    forwardSession: true,
  });
}
