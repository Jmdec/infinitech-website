// File: app/api/admin/job-descriptions/route.ts
import { forwardToLaravel, HttpError } from "@/lib/careers/job-offer/server";

export const runtime = "nodejs";

// Superadmin-only is enforced in middleware.ts (protectedApi). This just relays to Laravel.
async function relay(req: Request, method: string, json?: unknown) {
  try {
    const search = new URL(req.url).search;
    const path = `/api/admin/job-descriptions${search}`;
    const res = await forwardToLaravel(req, path, { method, json });
    const text = await res.text();

    if (!res.ok) {
      console.error(
        `[job-descriptions] ${method} ${path} -> ${res.status}`,
        text.slice(0, 300),
      );
    }

    return new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ message: e.message }, { status: e.status });
    }
    console.error(e);
    return Response.json(
      { message: "Could not reach the server." },
      { status: 502 },
    );
  }
}

export async function GET(req: Request) {
  return relay(req, "GET");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "Expected a JSON body." }, { status: 415 });
  }
  return relay(req, "POST", body);
}
