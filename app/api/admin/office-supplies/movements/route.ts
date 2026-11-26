import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/office-supplies/movements",
    request,
    query: request.nextUrl.searchParams, // supports ?item_id=
    forwardSession: true,
  });
}
