// File: app/api/admin/announcements/[id]/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyJson({
    method: "PUT",
    path: `/api/admin/announcements/${encodeURIComponent(id)}`,
    request,
    body,
    forwardSession: true,
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  return proxyJson({
    method: "DELETE",
    path: `/api/admin/announcements/${encodeURIComponent(id)}`,
    request,
    forwardSession: true,
  });
}
