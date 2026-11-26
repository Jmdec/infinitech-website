import { NextRequest, NextResponse } from "next/server";
import {
  getAdminDirectoryEntries,
  getAdminDirectoryOptions,
} from "@/lib/admin-navigation";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";
const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;

async function forward(request: NextRequest, path: string[] = []) {
  const token = request.cookies.get("adminToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    if (request.method === "GET" && path.length === 0) {
      if (!serviceToken) {
        return NextResponse.json(
          { message: "Roadmap directory sync is not configured." },
          { status: 503 },
        );
      }
      const syncResponse = await fetch(
        new URL("/api/admin/roadmap/directories/sync", laravelUrl),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${serviceToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            directories: getAdminDirectoryEntries(),
          }),
          cache: "no-store",
        },
      );
      if (!syncResponse.ok) {
        const message = await syncResponse.text();
        console.error("Roadmap directory sync failed:", message);
        return NextResponse.json(
          { message: "Unable to refresh roadmap directory choices." },
          { status: syncResponse.status },
        );
      }
    }

    const url = new URL(
      `/api/admin/roadmap${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}`,
      laravelUrl,
    );
    const response = await fetch(url, {
      method: request.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(request.headers.get("content-type")
          ? { "Content-Type": request.headers.get("content-type")! }
          : {}),
      },
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.text(),
      cache: "no-store",
    });
    const body = await response.text();

    if (response.ok && request.method === "GET" && path.length === 0) {
      return NextResponse.json(
        {
          ...JSON.parse(body),
          directories: getAdminDirectoryOptions(),
        },
        {
          status: response.status,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Roadmap API request failed:", error);
    return NextResponse.json(
      { message: "Unable to connect to the roadmap service." },
      { status: 502 },
    );
  }
}

type RouteContext = { params: Promise<{ path?: string[] }> };

async function handle(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path || []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
