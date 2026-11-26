// FILE: app/api/admin/overtime-requests/[id]/route.ts
import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/timekeeping-proxy";

export const dynamic = "force-dynamic";

// PATCH { status }  -> Approved / Rejected (HR) or Cancelled (employee)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToLaravel(
    req,
    `/api/admin/overtime-requests/${encodeURIComponent(id)}`,
  );
}
