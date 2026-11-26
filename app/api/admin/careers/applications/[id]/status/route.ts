import { NextRequest, NextResponse } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json(
      { message: "Invalid application ID." },
      { status: 400 },
    );
  }

  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "The application status is invalid." },
      { status: 400 },
    );
  }

  return proxyJson({
    method: "PUT",
    path: `/api/admin/careers/applications/${id}/status`,
    request,
    forwardSession: true,
    body,
  });
}
