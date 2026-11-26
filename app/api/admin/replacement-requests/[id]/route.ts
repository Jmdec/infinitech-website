// File: app/api/admin/replacement-requests/[id]/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return proxyJson({
    method: "GET",
    path: `/api/admin/replacement-requests/${encodeURIComponent(id)}`,
    request,
    forwardSession: true,
  });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyJson({
    method: "PATCH",
    path: `/api/admin/replacement-requests/${encodeURIComponent(id)}`,
    request,
    body,
    forwardSession: true,
  });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return proxyJson({
    method: "DELETE",
    path: `/api/admin/replacement-requests/${encodeURIComponent(id)}`,
    request,
    forwardSession: true,
  });
}
