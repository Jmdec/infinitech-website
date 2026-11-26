import { type NextRequest, NextResponse } from "next/server";
import { proxyJson } from "@/lib/laravelProxy";

type Ctx = { params: Promise<{ id: string }> };

const isNumeric = (id: string) => /^\d+$/.test(id);
const notFound = () =>
  NextResponse.json({ message: "Not found" }, { status: 404 });
const laravelPath = (id: string) => `/api/admin/my-replacement-requests/${id}`;

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isNumeric(id)) return notFound();
  return proxyJson({
    method: "GET",
    path: laravelPath(id),
    request,
    query: request.nextUrl.searchParams,
    forwardSession: true,
  });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isNumeric(id)) return notFound();
  return proxyJson({
    method: "PATCH",
    path: laravelPath(id),
    request,
    body: await request.json(),
    forwardSession: true,
  });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isNumeric(id)) return notFound();
  return proxyJson({
    method: "DELETE",
    path: laravelPath(id),
    request,
    forwardSession: true,
  });
}
