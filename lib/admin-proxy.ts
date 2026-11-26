// lib/admin-proxy.ts
import { NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

export async function proxyToLaravel(
  request: NextRequest,
  path: string,
  options: { method?: string; body?: unknown } = {},
) {
  const token = request.cookies.get("adminToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(`${laravelUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Service unavailable." },
      { status: 503 },
    );
  }
}
