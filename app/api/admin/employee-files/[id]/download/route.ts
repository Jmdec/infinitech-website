import { type NextRequest } from "next/server";
import { proxyFile } from "@/lib/laravelProxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyFile({
    path: `/api/admin/employee-files/${encodeURIComponent(id)}/download`,
    request,
    forwardSession: true,
  });
}
