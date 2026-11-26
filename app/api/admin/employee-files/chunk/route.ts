import { type NextRequest } from "next/server";
import { proxyFormData } from "@/lib/laravelProxy";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  return proxyFormData({
    path: "/api/admin/employee-files/chunk",
    formData,
    request,
    forwardSession: true,
  });
}
