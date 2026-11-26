import { NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  return proxyJson({
    method: "POST",
    path: `/api/admin/careers/applications/${id}/reject`,
    request,
    body,
    forwardSession: true,
  });
}
