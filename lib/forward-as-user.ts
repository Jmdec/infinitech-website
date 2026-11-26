// File: lib/forward-as-user.ts
//
// Unlike the tardiness proxy (which sends LARAVEL_SERVICE_TOKEN and therefore
// has no idea who is logged in), this forwards the signed-in user's own
// session token so Laravel can use $request->user() / ->employee_id.
import { type NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function forwardAsUser(request: NextRequest, laravelPath: string) {
  const token = request.cookies.get("adminToken")?.value;
  if (!token) {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const url = new URL(`${laravelUrl}${laravelPath}`);
  request.nextUrl.searchParams.forEach((value, key) =>
    url.searchParams.set(key, value),
  );

  const hasBody = !["GET", "HEAD"].includes(request.method);

  try {
    const response = await fetch(url, {
      method: request.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { message: "Unexpected response from Laravel." },
        { status: 502, headers: NO_STORE },
      );
    }

    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: NO_STORE,
    });
  } catch (error) {
    console.error("forwardAsUser failed:", error);
    return NextResponse.json(
      { message: "Unable to reach the server." },
      { status: 500, headers: NO_STORE },
    );
  }
}
