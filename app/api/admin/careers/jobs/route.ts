import { NextRequest, NextResponse } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/careers/jobs",
    request,
    forwardSession: true,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return proxyJson({
      method: "POST",
      path: "/api/admin/careers/jobs",
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
