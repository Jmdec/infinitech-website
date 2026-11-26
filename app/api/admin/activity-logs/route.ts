// app/api/admin/activity-logs/route.ts
import { NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("adminToken")?.value;
  if (!token)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const backendUrl = new URL("/api/admin/activity-logs", laravelUrl);
  backendUrl.search = request.nextUrl.search;

  const response = await fetch(backendUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") || "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}
