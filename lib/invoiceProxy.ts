import { type NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

// The middleware already swapped the Authorization header for the service token.
export async function invoiceProxy(
  request: NextRequest,
  path: string,
  withBody = false,
) {
  const url = new URL(`${laravelUrl}${path}`);
  request.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const res = await fetch(url, {
    method: request.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: request.headers.get("authorization") ?? "",
    },
    body: withBody ? await request.text() : undefined,
    cache: "no-store",
  });

  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
