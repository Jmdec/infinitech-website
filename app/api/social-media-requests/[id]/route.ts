// 📁 app/api/social-media-requests/[id]/route.ts
import { NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

type Ctx = { params: Promise<{ id: string }> };

const path = (id: string) => `/api/social-media-requests/${id}`;

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  return proxyJson({
    method: "GET",
    path: path(id),
    request: req,
    forwardSession: true,
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
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

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  return proxyJson({
    method: "DELETE",
    path: path(id),
    request: req,
    forwardSession: true,
  });
}
