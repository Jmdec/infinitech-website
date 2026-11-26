// File: app/api/admin/announcements/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/announcements",
    request,
    forwardSession: true,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyJson({
    method: "POST",
    path: "/api/admin/announcements",
    request,
    body,
    forwardSession: true,
  });
}
