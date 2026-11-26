// File: app/api/admin/evaluations/[id]/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^\d+$/.test(id);

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!validId(id))
    return Response.json({ message: "Not found" }, { status: 404 });
  return proxyJson({
    method: "GET",
    path: `/api/admin/evaluations/${id}`,
    request,
    forwardSession: true,
  });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!validId(id))
    return Response.json({ message: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  return proxyJson({
    method: "PATCH",
    path: `/api/admin/evaluations/${id}`,
    body,
    request,
    forwardSession: true,
  });
}
