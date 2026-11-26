import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/employee-files/status",
    query: request.nextUrl.searchParams,
    request,
    forwardSession: true,
  });
}
