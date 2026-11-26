// File: app/api/admin/employees/lookup/route.ts
import { type NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/timekeeping-proxy";

export const dynamic = "force-dynamic";

// 404 (employee not found) is expected while typing, and passes through as-is.
export async function GET(request: NextRequest) {
  return proxyToLaravel(request, "/api/admin/employees/lookup");
}
