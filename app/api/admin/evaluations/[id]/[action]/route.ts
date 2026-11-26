// File: app/api/admin/evaluations/[id]/[action]/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

const ACTIONS = ["submit", "review", "approve", "acknowledge", "revert"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  if (!/^\d+$/.test(id) || !ACTIONS.includes(action)) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  return proxyJson({
    method: "POST",
    path: `/api/admin/evaluations/${id}/${action}`,
    body,
    request,
    forwardSession: true,
  });
}
