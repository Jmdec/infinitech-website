// File: app/api/admin/evaluation-monitoring/[id]/attachments/route.ts
import { type NextRequest } from "next/server";
import { proxyFormData, proxyJson } from "@/lib/laravelProxy";

const isId = (value: string) => /^\d+$/.test(value);

// GET -> list of uploaded evaluation files for the employee
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isId(id)) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }
  return proxyJson({
    method: "GET",
    path: `/api/admin/evaluation-monitoring/${id}/attachments`,
    request,
  });
}

// POST (multipart: file, step) -> upload an evaluation file
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isId(id)) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return Response.json({ message: "Invalid upload." }, { status: 400 });
  }
  return proxyFormData({
    path: `/api/admin/evaluation-monitoring/${id}/attachments`,
    formData,
    request,
  });
}