import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/office-supplies/items",
    request,
    forwardSession: true,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }
  return proxyJson({
    method: "POST",
    path: "/api/admin/office-supplies/items",
    request,
    body,
    forwardSession: true,
  });
}
