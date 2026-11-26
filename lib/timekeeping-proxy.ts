// FILE: lib/timekeeping-proxy.ts
// Forwards /api/admin/timekeeping* and /api/admin/overtime-requests* from
// Next.js to Laravel with the service token + the admin session.
import { NextRequest, NextResponse } from "next/server";

const LARAVEL_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";
const SERVICE_TOKEN = process.env.LARAVEL_SERVICE_TOKEN || ""; // <-- rename if needed

export async function proxyToLaravel(req: NextRequest, path: string) {
  // Laravel's service.token middleware uses the Authorization header, so the
  // real login goes in X-Admin-Session (same as the leave routes).
  const session =
    req.cookies.get("adminToken")?.value ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${SERVICE_TOKEN}`,
  };
  if (session) headers["X-Admin-Session"] = session;

  const hasBody = req.method !== "GET" && req.method !== "DELETE";
  let body: ArrayBuffer | undefined;

  if (hasBody) {
    // Keep the ORIGINAL content type (multipart boundary or application/json)
    const contentType = req.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;
    // Raw bytes: req.text() would corrupt binary files
    body = await req.arrayBuffer();
  }

  // The query string (?foo=bar) is appended here, so callers pass the path only
  const search = req.nextUrl.search;

  try {
    const res = await fetch(`${LARAVEL_URL}${path}${search}`, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });

    // Response as raw bytes too, so proof images / PDFs come back intact
    const out: Record<string, string> = {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
    };
    const disposition = res.headers.get("content-disposition");
    if (disposition) out["Content-Disposition"] = disposition;

    return new NextResponse(await res.arrayBuffer(), {
      status: res.status,
      headers: out,
    });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach the server." },
      { status: 502 },
    );
  }
}
