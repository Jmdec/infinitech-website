// app/api/admin/coe-requests/[id]/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyJson({
    method: "PATCH",
    path: `/api/admin/coe-requests/${id}`,
    body: await request.json(),
    request,
    forwardSession: true,
  });
}
