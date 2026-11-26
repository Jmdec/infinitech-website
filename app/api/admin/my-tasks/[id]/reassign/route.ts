// app/api/admin/my-tasks/[id]/reassign/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;
  return proxyJson({
    method: "PATCH",
    path: `/api/admin/my-tasks/${encodeURIComponent(id)}/reassign`,
    request,
    body: await request.json().catch(() => ({})),
    forwardSession: true,
  });
}
