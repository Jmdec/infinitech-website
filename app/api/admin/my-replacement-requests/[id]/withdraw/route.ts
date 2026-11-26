import { type NextRequest, NextResponse } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  const text = await request.text();
  return proxyJson({
    method: "POST",
    path: `/api/admin/my-replacement-requests/${id}/withdraw`,
    request,
    body: text ? JSON.parse(text) : undefined,
    forwardSession: true,
  });
}
