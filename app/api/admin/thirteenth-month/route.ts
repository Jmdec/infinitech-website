// File: app/api/admin/thirteenth-month/route.ts
//
// Proxies /api/admin/thirteenth-month to Laravel.
// middleware.ts has already checked the "thirteenth_month_pay" permission and
// put the service token in the Authorization header + x-admin-authorized: true.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";
const BASE = "/api/admin/thirteenth-month";

async function proxy(request: NextRequest) {
  if (request.headers.get("x-admin-authorized") !== "true") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json(
      { message: "Admin API is not configured." },
      { status: 503 },
    );
  }

  const hasBody = !["GET", "HEAD"].includes(request.method);

  try {
    const response = await fetch(
      `${laravelUrl}${BASE}${request.nextUrl.search}`,
      {
        method: request.method,
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        body: hasBody ? await request.text() : undefined,
        cache: "no-store",
      },
    );

    const data = await response.json().catch(() => ({}));

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "13th month service unavailable." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
