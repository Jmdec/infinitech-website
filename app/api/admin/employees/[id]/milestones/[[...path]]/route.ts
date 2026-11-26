// File: app/api/admin/employees/[id]/milestones/[[...path]]/route.ts
//
//   GET    /api/admin/employees/5/milestones      -> list
//   POST   /api/admin/employees/5/milestones      -> add
//   DELETE /api/admin/employees/5/milestones/12   -> remove
import { type NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { forwardAsUser } from "@/lib/forward-as-user";

export const dynamic = "force-dynamic";

type Ctx = {
  params:
    | Promise<{ id: string; path?: string[] }>
    | { id: string; path?: string[] };
};

async function handle(request: NextRequest, ctx: Ctx) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { id, path = [] } = await ctx.params;
  const suffix = path
    .map((segment) => `/${encodeURIComponent(segment)}`)
    .join("");

  return forwardAsUser(
    request,
    `/api/admin/employees/${encodeURIComponent(id)}/milestones${suffix}`,
  );
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
