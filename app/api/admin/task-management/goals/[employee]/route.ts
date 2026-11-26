// app/api/admin/task-management/goals/[employee]/route.ts
import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ employee: string }> };

export async function PUT(request: NextRequest, { params }: Context) {
  const { employee } = await params;
  return proxyJson({
    method: "PUT",
    path: `/api/admin/task-management/goals/${encodeURIComponent(employee)}`,
    request,
    body: await request.json().catch(() => ({})),
    forwardSession: true,
  });
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const { employee } = await params;
  return proxyJson({
    method: "DELETE",
    path: `/api/admin/task-management/goals/${encodeURIComponent(employee)}`,
    request,
    forwardSession: true,
  });
}
