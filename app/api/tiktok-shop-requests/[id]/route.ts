// 📁 app/api/tiktok-shop-requests/[id]/route.ts
import { NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const path = (id: string) => `/api/tiktok-shop-requests/${id}`;

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  return proxyJson({
    method: "GET",
    path: path(id),
    request: req,
    forwardSession: true,
  });
}

// Partial update, e.g. changing status ("pending" -> "contacted" -> "approved")
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = await req.json();

  return proxyJson({
    method: "PATCH",
    path: path(id),
    request: req,
    forwardSession: true,
    body,
  });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  return proxyJson({
    method: "DELETE",
    path: path(id),
    request: req,
    forwardSession: true,
  });
}
