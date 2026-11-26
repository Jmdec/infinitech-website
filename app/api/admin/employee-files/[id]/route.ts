import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyJson({
    method: "DELETE",
    path: `/api/admin/employee-files/${encodeURIComponent(id)}`,
    request,
    forwardSession: true,
  });
}
