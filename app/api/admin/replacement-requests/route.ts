// File: app/api/admin/replacement-requests/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/replacement-requests",
    request,
    forwardSession: true,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyJson({
    method: "POST",
    path: "/api/admin/replacement-requests",
    request,
    body,
    forwardSession: true,
  });
}
