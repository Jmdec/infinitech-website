// FILE: app/api/admin/timekeeping/route.ts
import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/timekeeping-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return proxyToLaravel(req, "/api/admin/timekeeping");
}

export async function POST(req: NextRequest) {
  return proxyToLaravel(req, "/api/admin/timekeeping");
}
