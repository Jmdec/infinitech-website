import { NextRequest, NextResponse } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json(
      { message: "Invalid application ID." },
      { status: 400 },
    );
  }

  let body: { subject?: unknown; body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "The invitation details are invalid." },
      { status: 400 },
    );
  }

  return proxyJson({
    method: "POST",
    path: `/api/admin/careers/applications/${id}/interview-invitation`,
    request,
    forwardSession: true,
    body,
  });
}
