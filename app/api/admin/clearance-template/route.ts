// app/api/admin/clearance-template/route.ts
// Proxy to Laravel. Non-HR users are locked to THEIR OWN department, so changing
// ?department=... in the URL (or in the body) cannot reach another department.
import { NextRequest, NextResponse } from "next/server";
import { getDepartmentScope } from "@/lib/department-scope.server";

export const runtime = "nodejs";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

async function getSession(token: string) {
  const res = await fetch(`${laravelUrl}/api/admin/session`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function handle(request: NextRequest) {
  const token = request.cookies.get("adminToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;
  if (!serviceToken) {
    return NextResponse.json(
      { message: "Admin API is not configured." },
      { status: 503 },
    );
  }

  let session: any;
  try {
    session = await getSession(token);
  } catch {
    return NextResponse.json(
      { message: "Authentication service unavailable." },
      { status: 503 },
    );
  }
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Session first, then the Employee Masterfile (same logic as the notify route).
  const { canSeeAll, department: myDepartment } =
    await getDepartmentScope(session);

  // The department that will actually be sent to Laravel.
  const requested =
    request.nextUrl.searchParams.get("department")?.trim() ?? "";
  // Laravel validates against lowercase keys (it, multimedia, studio, admin...),
  // the same way the Clearance dialog sends them.
  const department = (canSeeAll ? requested : myDepartment).toLowerCase();

  if (!canSeeAll && !myDepartment) {
    return NextResponse.json(
      { message: "Your account has no department." },
      { status: 403 },
    );
  }

  const url = new URL(`${laravelUrl}/api/admin/clearance-template`);
  if (department) url.searchParams.set("department", department);

  const init: RequestInit = {
    method: request.method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${serviceToken}`,
    },
    cache: "no-store",
  };

  if (request.method !== "GET") {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { message: "Invalid request." },
        { status: 422 },
      );
    }
    // Force the department for non-HR users, ignoring whatever the client sent.
    if (!canSeeAll) body.department = myDepartment.toLowerCase();

    (init.headers as Record<string, string>)["Content-Type"] =
      "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

export const GET = handle;
export const PUT = handle;
export const PATCH = handle;
