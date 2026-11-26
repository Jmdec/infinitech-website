// File: app/api/admin/my-tasks/[[...path]]/route.ts
//
// One file handles every my-tasks call:
//   GET   /api/admin/my-tasks            -> list
//   GET   /api/admin/my-tasks/timeline   -> segments for the bar
//   PATCH /api/admin/my-tasks/5/start    -> start / pause / resume / progress / complete
//
// For task management, copy this file to
// app/api/admin/task-management/[[...path]]/route.ts
// and change BASE to "/api/admin/task-management".
import { type NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { forwardAsUser } from "@/lib/forward-as-user";

const BASE = "/api/admin/my-tasks";

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
