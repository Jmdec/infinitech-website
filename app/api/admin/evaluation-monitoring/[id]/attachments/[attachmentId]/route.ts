// File: app/api/admin/evaluation-monitoring/[id]/attachments/[attachmentId]/route.ts
import { type NextRequest } from "next/server";
import { proxyFile, proxyJson } from "@/lib/laravelProxy";

const isId = (value: string) => /^\d+$/.test(value);

// GET -> download one uploaded evaluation file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params;
  if (!isId(id) || !isId(attachmentId)) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }
  return proxyFile({
    path: `/api/admin/evaluation-monitoring/${id}/attachments/${attachmentId}`,
    request,
  });
}

// DELETE -> remove one uploaded evaluation file
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params;
  if (!isId(id) || !isId(attachmentId)) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }
  return proxyJson({
    method: "DELETE",
    path: `/api/admin/evaluation-monitoring/${id}/attachments/${attachmentId}`,
    request,
  });
}
