import { NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${laravelUrl}/api/admin/settings`, {
      headers: {
        Accept: "application/json",
        Authorization: request.headers.get("authorization") ?? "",
      },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Settings service unavailable." },
      { status: 503 },
    );
  }
}
