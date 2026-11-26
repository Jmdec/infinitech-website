// FILE: app/api/admin/overtime-requests/route.ts
import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/timekeeping-proxy";

export const dynamic = "force-dynamic";

// GET  ?mine=1 | ?start_date=&end_date=  -> list
// POST (FormData: employee_id, date, minutes, note, proof) -> file a request
export async function GET(req: NextRequest) {
  return proxyToLaravel(
    req,
    `/api/admin/overtime-requests${req.nextUrl.search}`,
  );
}

export async function POST(req: NextRequest) {
  return proxyToLaravel(req, "/api/admin/overtime-requests");
}
