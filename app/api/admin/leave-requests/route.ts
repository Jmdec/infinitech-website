import { type NextRequest } from "next/server";
import { proxyFormData, proxyJson } from "@/lib/laravelProxy";

export async function GET(request: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/admin/leave-requests",
    query: request.nextUrl.searchParams,
    request,
    forwardSession: true,
  });
}

export async function POST(request: NextRequest) {
  const isMultipart = (request.headers.get("content-type") || "").includes(
    "multipart/form-data",
  );

  if (isMultipart) {
    return proxyFormData({
      path: "/api/admin/leave-requests",
      formData: await request.formData(),
      request,
      forwardSession: true,
    });
  }

  return proxyJson({
    method: "POST",
    path: "/api/admin/leave-requests",
    body: await request.json(),
    request,
    forwardSession: true,
  });
}
