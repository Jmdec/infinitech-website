import { NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("adminToken")?.value;

  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(`${laravelUrl}/api/admin/my-documents`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach the server." },
      { status: 503 },
    );
  }
}
