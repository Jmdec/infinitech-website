import type { NextRequest } from "next/server";

export function laravelServiceHeaders(
  request?: NextRequest,
  forwardSession = false,
): Record<string, string> {
  const token = process.env.LARAVEL_SERVICE_TOKEN;
  if (!token) {
    throw new Error("LARAVEL_SERVICE_TOKEN is not configured for the server.");
  }

  const session = forwardSession
    ? request?.cookies.get("adminToken")?.value
    : undefined;

  return {
    Authorization: `Bearer ${token}`,
    ...(session ? { "X-Admin-Session": session } : {}),
  };
}
