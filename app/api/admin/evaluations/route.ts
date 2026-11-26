// File: app/api/admin/evaluations/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/evaluations",
    query: request.nextUrl.searchParams,
    request,
    forwardSession: true,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyJson({
    method: "POST",
    path: "/api/admin/evaluations",
    body,
    request,
    forwardSession: true,
  });
}
