// File: app/api/admin/calendar-event-types/route.ts

import { NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

// Forwards to Laravel with the admin's session token (httpOnly cookie).
// Access is already limited to superadmin by middleware.ts and Laravel.
async function forward(req: NextRequest, method: string, withBody: boolean) {
  const token = req.cookies.get("adminToken")?.value;

  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let response: Response;

  try {
    response = await fetch(`${laravelUrl}/api/admin/calendar-event-types`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: withBody ? await req.text() : undefined,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { message: "Calendar service unavailable." },
      { status: 503 },
    );
  }

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(req: NextRequest) {
  return forward(req, "GET", false);
}

export async function POST(req: NextRequest) {
  return forward(req, "POST", true);
}
