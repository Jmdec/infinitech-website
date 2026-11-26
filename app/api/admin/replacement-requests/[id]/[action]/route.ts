// File: app/api/admin/replacement-requests/[id]/[action]/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

const ACTIONS = new Set([
  "submit",
  "endorse",
  "approve",
  "reject",
  "release",
  "revert",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ message: "Unknown action." }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  return proxyJson({
    method: "POST",
    path: `/api/admin/replacement-requests/${encodeURIComponent(id)}/${action}`,
    request,
    body,
    forwardSession: true,
  });
}
