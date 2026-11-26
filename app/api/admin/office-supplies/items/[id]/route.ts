import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

type Ctx = { params: Promise<{ id: string }> };

async function validId(ctx: Ctx): Promise<string | null> {
  const { id } = await ctx.params;
  return /^\d+$/.test(id) ? id : null;
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const id = await validId(ctx);
  if (!id) return Response.json({ message: "Invalid item." }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }
  return proxyJson({
    method: "PUT",
    path: `/api/admin/office-supplies/items/${id}`,
    request,
    body,
    forwardSession: true,
  });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const id = await validId(ctx);
  if (!id) return Response.json({ message: "Invalid item." }, { status: 400 });

  return proxyJson({
    method: "DELETE",
    path: `/api/admin/office-supplies/items/${id}`,
    request,
    forwardSession: true,
  });
}
