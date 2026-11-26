import { type NextRequest, NextResponse } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  const text = await request.text();
  return proxyJson({
    method: "PATCH",
    path: `/api/admin/my-tasks/${id}/switch`,
    request,
    body: text ? JSON.parse(text) : undefined,
    forwardSession: true,
  });
}
