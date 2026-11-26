// File: app/api/admin/job-descriptions/[id]/route.ts
import { forwardToLaravel, HttpError } from "@/lib/careers/job-offer/server";

export const runtime = "nodejs";

// Superadmin-only is enforced in middleware.ts (protectedApi). This just relays to Laravel.
async function relay(req: Request, id: string, method: string, json?: unknown) {
  if (!/^\d+$/.test(id)) {
    return Response.json({ message: "Invalid id." }, { status: 404 });
  }
  try {
    const search = new URL(req.url).search;
    const path = `/api/admin/job-descriptions/${id}${search}`;
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

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return relay(req, (await params).id, "GET");
}

export async function PUT(req: Request, { params }: Ctx) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "Expected a JSON body." }, { status: 415 });
  }
  return relay(req, (await params).id, "PUT", body);
}

export async function DELETE(req: Request, { params }: Ctx) {
  return relay(req, (await params).id, "DELETE");
}
