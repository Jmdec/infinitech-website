// File: app/api/admin/tardiness/[id]/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";
const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;
type RouteContext = { params: Promise<{ id: string }> };

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

const authHeaders = {
  Accept: "application/json",
  ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  try {
    const { id } = await params;
    return forward(
      await fetch(`${laravelUrl}/api/admin/tardiness/${id}`, {
        headers: authHeaders,
        cache: "no-store",
      }),
    );
  } catch (error) {
    console.error("Tardiness details GET failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to load the time-in." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  try {
    const { id } = await params;
    return forward(
      await fetch(`${laravelUrl}/api/admin/tardiness/${id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(await request.json()),
      }),
    );
  } catch (error) {
    console.error("Tardiness update failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to update the time-in." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  try {
    const { id } = await params;
    return forward(
      await fetch(`${laravelUrl}/api/admin/tardiness/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      }),
    );
  } catch (error) {
    console.error("Tardiness delete failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to delete the time-in." },
      { status: 500 },
    );
  }
}
