// File: lib/laravelProxy.ts
import { type NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

// The logged-in user's own session token. middleware.ts validates this cookie
// and then replaces the Authorization header with the service token, so the
// cookie is the only place the user's token still exists.
function sessionHeader(request?: NextRequest): Record<string, string> {
  const session = request?.cookies.get("adminToken")?.value;
  return session ? { "X-Admin-Session": session } : {};
}

interface ProxyJsonOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string; // e.g. "/api/admin/portal-demos/12/roles"
  request?: NextRequest;
  query?: URLSearchParams;
  body?: unknown; // JSON-serializable; omit for GET/DELETE with no body
  serviceToken?: string;
  // Tell Laravel WHO is calling (X-Admin-Session). Needs `request`.
  forwardSession?: boolean;
}

export async function proxyJson({
  method,
  path,
  query,
  body,
  serviceToken = process.env.LARAVEL_SERVICE_TOKEN,
  request,
  forwardSession = false,
}: ProxyJsonOptions): Promise<NextResponse> {
  if (request && request.headers.get("x-admin-authorized") !== "true") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!serviceToken) {
    return NextResponse.json(
      { message: "Laravel service is not configured." },
      { status: 500 },
    );
  }

  const qs = query && query.toString() ? `?${query.toString()}` : "";
  const url = `${laravelUrl}${path}${qs}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
        ...(forwardSession ? sessionHeader(request) : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    return relayJsonResponse(response, `${method} ${path}`);
  } catch (error) {
    return connectionError(error, `${method} ${path}`);
  }
}

// Separate from proxyJson because file uploads can't be JSON.stringify'd.
export async function proxyFormData({
  path,
  formData,
  serviceToken = process.env.LARAVEL_SERVICE_TOKEN,
  request,
  forwardSession = false,
}: {
  path: string;
  formData: FormData;
  request?: NextRequest;
  serviceToken?: string;
  forwardSession?: boolean;
}): Promise<NextResponse> {
  if (request && request.headers.get("x-admin-authorized") !== "true") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!serviceToken) {
    return NextResponse.json(
      { message: "Laravel service is not configured." },
      { status: 500 },
    );
  }

  const url = `${laravelUrl}${path}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
        ...(forwardSession ? sessionHeader(request) : {}),
      },
      body: formData,
      cache: "no-store",
    });

    return relayJsonResponse(response, `POST ${path}`);
  } catch (error) {
    return connectionError(error, `POST ${path}`);
  }
}
// ADD to lib/laravelProxy.ts, after proxyFormData (before relayJsonResponse).
// Streams a binary file (PDF, image, etc.) from Laravel back to the browser.
export async function proxyFile({
  path,
  serviceToken = process.env.LARAVEL_SERVICE_TOKEN,
  request,
  forwardSession = false,
}: {
  path: string;
  request?: NextRequest;
  serviceToken?: string;
  forwardSession?: boolean;
}): Promise<NextResponse> {
  if (request && request.headers.get("x-admin-authorized") !== "true") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!serviceToken) {
    return NextResponse.json(
      { message: "Laravel service is not configured." },
      { status: 500 },
    );
  }

  const url = `${laravelUrl}${path}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "*/*",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
        ...(forwardSession ? sessionHeader(request) : {}),
      },
      cache: "no-store",
    });

    // Errors (404, 401...) come back as JSON from Laravel.
    if (!response.ok) {
      return relayJsonResponse(response, `GET ${path}`);
    }

    const headers = new Headers();
    for (const name of [
      "content-type",
      "content-disposition",
      "content-length",
    ]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new NextResponse(response.body, { status: 200, headers });
  } catch (error) {
    return connectionError(error, `GET ${path}`);
  }
}
async function relayJsonResponse(
  response: Response,
  label: string,
): Promise<NextResponse> {
  const text = await response.text();

  if (text.includes("<!DOCTYPE") || text.includes("<html")) {
    console.error(`❌ Laravel returned an HTML error page for ${label}`);
    return NextResponse.json(
      {
        success: false,
        message: "Laravel backend error",
        hint: "Check: 1) Is Laravel running? 2) Database connected? 3) Check storage/logs/laravel.log",
      },
      { status: 500 },
    );
  }

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid JSON response from Laravel",
        error: text.substring(0, 200),
      },
      { status: 500 },
    );
  }

  return NextResponse.json(data as object, { status: response.status });
}

function connectionError(error: unknown, label: string): NextResponse {
  console.error(`❌ Laravel proxy error [${label}]:`, error);
  return NextResponse.json(
    {
      success: false,
      message: "Failed to reach Laravel backend",
      error: error instanceof Error ? error.message : String(error),
      hint: "Is Laravel running? Check LARAVEL_API_URL in .env.local",
    },
    { status: 500 },
  );
}
