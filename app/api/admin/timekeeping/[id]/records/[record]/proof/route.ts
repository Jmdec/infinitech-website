// FILE: app/api/admin/timekeeping/[id]/records/[record]/proof/route.ts
import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/timekeeping-proxy";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; record: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id, record } = await params;
  return proxyToLaravel(
    req,
    `/api/admin/timekeeping/${encodeURIComponent(id)}/records/${encodeURIComponent(record)}/proof`,
  );
}
