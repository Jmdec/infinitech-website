// FILE: app/api/admin/timekeeping/[id]/route.ts
import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/timekeeping-proxy";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return proxyToLaravel(
    req,
    `/api/admin/timekeeping/${encodeURIComponent(id)}`,
  );
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return proxyToLaravel(
    req,
    `/api/admin/timekeeping/${encodeURIComponent(id)}`,
  );
}
