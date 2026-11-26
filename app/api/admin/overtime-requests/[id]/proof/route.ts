// FILE: app/api/admin/overtime-requests/[id]/proof/route.ts
import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/timekeeping-proxy";

export const dynamic = "force-dynamic";

// GET -> streams the proof file (image / PDF)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToLaravel(
    req,
    `/api/admin/overtime-requests/${encodeURIComponent(id)}/proof`,
  );
}
