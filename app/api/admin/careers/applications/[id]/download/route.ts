import { NextRequest, NextResponse } from "next/server";
import { laravelServiceHeaders } from "@/lib/laravel-service-auth";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (request.headers.get("x-admin-authorized") !== "true") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json(
      { message: "Invalid application ID." },
      { status: 400 },
    );
  }

  const adminSession = request.cookies.get("adminToken")?.value;
  if (!adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(
      `${laravelUrl}/api/admin/careers/applications/${id}/download`,
      {
        headers: {
          ...laravelServiceHeaders(),
          Accept: "application/json, application/octet-stream",
          "X-Admin-Session": adminSession,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const body = await response.text();
      try {
        return NextResponse.json(JSON.parse(body), {
          status: response.status,
          headers: { "Cache-Control": "private, no-store" },
        });
      } catch {
        return NextResponse.json(
          {
            message: `The careers backend returned an unexpected response while downloading the resume (HTTP ${response.status}).`,
          },
          {
            status: response.status,
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      }
    }

    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const contentType = response.headers.get("content-type");
    const contentDisposition = response.headers.get("content-disposition");
    if (contentType) headers.set("Content-Type", contentType);
    if (contentDisposition)
      headers.set("Content-Disposition", contentDisposition);

    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error("Career resume download proxy failed:", error);
    return NextResponse.json(
      { message: "Failed to connect to the careers backend." },
      { status: 502 },
    );
  }
}
