import { type NextRequest } from "next/server";

import { proxyJson } from "@/lib/laravelProxy";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  return proxyJson({
    method: "PATCH",
    path: `/api/admin/payroll/employees/${id}/fixed`,
    request,
    body,
    forwardSession: true,
  });
}
