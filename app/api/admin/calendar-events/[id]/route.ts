// File: app/api/admin/calendar-events/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

type Context = { params: Promise<{ id: string }> };

// Forwards to Laravel with the admin's session token (httpOnly cookie).
// Access is already limited to superadmin by middleware.ts and Laravel.
async function forward(
  req: NextRequest,
  { params }: Context,
  method: string,
  withBody: boolean,
) {
  const token = req.cookies.get("adminToken")?.value;

  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  let response: Response;

  try {
    response = await fetch(`${laravelUrl}/api/admin/calendar-events/${id}`, {
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

export async function PUT(req: NextRequest, ctx: Context) {
  return forward(req, ctx, "PUT", true);
}

export async function DELETE(req: NextRequest, ctx: Context) {
  return forward(req, ctx, "DELETE", false);
}
