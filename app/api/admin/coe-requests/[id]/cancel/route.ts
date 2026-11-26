import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyJson({
    method: "POST",
    path: `/api/admin/coe-requests/${id}/cancel`,
    body: await request.json(),
    request,
    forwardSession: true,
  });
}
