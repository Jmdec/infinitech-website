import { type NextRequest } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

const PATH = "/api/admin/my-replacement-requests";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: PATH,
    request,
    query: request.nextUrl.searchParams,
    forwardSession: true,
  });
}

export async function POST(request: NextRequest) {
  return proxyJson({
    method: "POST",
    path: PATH,
    request,
    body: await request.json(),
    forwardSession: true,
  });
}
