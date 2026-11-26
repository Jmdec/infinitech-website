import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ message: "Invalid item." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }
  return proxyJson({
    method: "POST",
    path: `/api/admin/office-supplies/items/${id}/movements`,
    request,
    body,
    forwardSession: true,
  });
}
