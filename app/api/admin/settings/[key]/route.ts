import { NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ message: "Invalid request." }, { status: 422 });
  }

  const response = await fetch(
    `${laravelUrl}/api/admin/settings/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: request.headers.get("authorization") ?? "",
      },
      body: JSON.stringify(payload),
    },
  );
  const body = await response.json().catch(() => ({}));
  return NextResponse.json(body, { status: response.status });
}
