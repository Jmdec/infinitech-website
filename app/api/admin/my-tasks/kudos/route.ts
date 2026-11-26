// app/api/admin/my-tasks/kudos/read/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  return proxyJson({
    method: "PATCH",
    path: "/api/admin/my-tasks/kudos/read",
    request,
    body: {},
    forwardSession: true,
  });
}
