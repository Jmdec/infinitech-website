// File: app/api/admin/my-milestones/route.ts
import { type NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { forwardAsUser } from "@/lib/forward-as-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  return forwardAsUser(request, "/api/admin/my-milestones");
}
