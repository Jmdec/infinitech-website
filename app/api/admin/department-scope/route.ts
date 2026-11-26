// app/api/admin/department-scope/route.ts
// Tells the client which departments the signed-in user may see.
import { NextRequest, NextResponse } from "next/server";
import { getDepartmentScope } from "@/lib/department-scope.server";

export const runtime = "nodejs";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("adminToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let session: any;
  try {
    const res = await fetch(`${laravelUrl}/api/admin/session`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    session = await res.json();
  } catch {
    return NextResponse.json(
      { message: "Authentication service unavailable." },
      { status: 503 },
    );
  }

  const scope = await getDepartmentScope(session);
  return NextResponse.json({ data: scope });
}
