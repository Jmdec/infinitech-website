// app/api/admin/department-signature/route.ts
import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/admin-proxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const department = request.nextUrl.searchParams.get("department");
  const query = department
    ? `?department=${encodeURIComponent(department)}`
    : "";
  return proxyToLaravel(request, `/api/admin/department-signature${query}`);
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyToLaravel(request, "/api/admin/department-signature", {
    method: "PUT",
    body,
  });
}
