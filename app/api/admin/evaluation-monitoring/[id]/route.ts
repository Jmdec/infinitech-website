// app/api/admin/evaluation-monitoring/[id]/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;

  return proxyJson({
    method: "PATCH",
    path: `/api/admin/evaluation-monitoring/${encodeURIComponent(id)}`,
    body: await request.json(),
    request,
    forwardSession: true,
  });
}

// The page uses PATCH only. Remove this if you don't want PUT as an alias.
export const PUT = PATCH;