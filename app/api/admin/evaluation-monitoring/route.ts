// app/api/admin/evaluation-monitoring/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/evaluation-monitoring",
    query: request.nextUrl.searchParams,
    request,
    forwardSession: true,
  });
}
