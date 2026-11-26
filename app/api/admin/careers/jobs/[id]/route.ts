import { NextRequest, NextResponse } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

type RouteContext = { params: Promise<{ id: string }> };

function validId(id: string): boolean {
  return /^\d+$/.test(id);
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!validId(id)) {
    return NextResponse.json(
      { message: "Invalid job listing ID." },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    return proxyJson({
      method: "PUT",
      path: `/api/admin/careers/jobs/${id}`,
      request,
      body,
      forwardSession: true,
    });
  } catch {
    return NextResponse.json(
      { message: "Invalid job listing details." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!validId(id)) {
    return NextResponse.json(
      { message: "Invalid job listing ID." },
      { status: 400 },
    );
  }

  return proxyJson({
    method: "DELETE",
    path: `/api/admin/careers/jobs/${id}`,
    request,
    forwardSession: true,
  });
}
