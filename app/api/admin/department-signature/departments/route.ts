// app/api/admin/department-signature/departments/route.ts
import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/admin-proxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return proxyToLaravel(request, "/api/admin/department-signature/departments");
}
