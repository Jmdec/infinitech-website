// File: app/api/admin/task-management/[[...path]]/route.ts
//
// Same idea as the my-tasks proxy: forwards the signed-in user's own token,
// so Laravel knows who is assigning (assigned_by).
import { type NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { forwardAsUser } from "@/lib/forward-as-user";

const BASE = "/api/admin/task-management";

type Ctx = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

async function handle(request: NextRequest, ctx: Ctx) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { path = [] } = await ctx.params;
  const suffix = path
    .map((segment) => `/${encodeURIComponent(segment)}`)
    .join("");
  return forwardAsUser(request, `${BASE}${suffix}`);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
