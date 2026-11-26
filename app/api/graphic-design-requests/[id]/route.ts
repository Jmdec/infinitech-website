// 📁 app/api/graphic-design-requests/[id]/route.ts
import { NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

// This file used the Next.js 14 style (params as a plain object).
// If your project is on Next.js 15, change Ctx to
// { params: Promise<{ id: string }> } and use `const { id } = await params;`.
type Ctx = { params: { id: string } };

const path = (id: string) => `/api/graphic-design-requests/${id}`;

export async function GET(req: NextRequest, { params }: Ctx) {
  return proxyJson({
    method: "GET",
    path: path(params.id),
    request: req,
    forwardSession: true,
  });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { name, email, phone, businessName, designCategories, details } =
    await req.json();

  return proxyJson({
    method: "PUT",
    path: path(params.id),
    request: req,
    forwardSession: true,
    body: { name, email, phone, businessName, designCategories, details },
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return proxyJson({
    method: "DELETE",
    path: path(params.id),
    request: req,
    forwardSession: true,
  });
}
