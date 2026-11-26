import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyJson({
    method: "PATCH",
    path: `/api/admin/evaluation-requests/${encodeURIComponent(id)}`,
    body: await request.json(),
    request,
    forwardSession: true,
  });
}
