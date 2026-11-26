import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/evaluation-requests",
    query: request.nextUrl.searchParams,
    request,
    forwardSession: true,
  });
}

export async function POST(request: NextRequest) {
  return proxyJson({
    method: "POST",
    path: "/api/admin/evaluation-requests",
    body: await request.json(),
    request,
    forwardSession: true,
  });
}
