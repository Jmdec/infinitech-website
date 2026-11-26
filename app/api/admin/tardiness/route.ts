// File: app/api/admin/tardiness/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";
const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;

async function forward(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return NextResponse.json(await response.json(), {
      status: response.status,
    });
  }
  return NextResponse.json(
    { success: false, message: "Unexpected response from Laravel." },
    { status: 502 },
  );
}

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  try {
    const url = new URL(`${laravelUrl}/api/admin/tardiness`);
    request.nextUrl.searchParams.forEach((value, key) =>
      url.searchParams.set(key, value),
    );
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
      cache: "no-store",
    });
    return forward(response);
  } catch (error) {
    console.error("Tardiness GET failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to load tardiness data." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  try {
    const response = await fetch(`${laravelUrl}/api/admin/tardiness`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
      body: JSON.stringify(await request.json()),
    });
    return forward(response);
  } catch (error) {
    console.error("Tardiness POST failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to log the time-in." },
      { status: 500 },
    );
  }
}
