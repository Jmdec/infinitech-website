import { NextRequest, NextResponse } from "next/server";
import { proxyFormData } from "@/lib/laravelProxy";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    return proxyFormData({
      path: "/api/careers/applications",
      formData,
    });
  } catch {
    return NextResponse.json(
      { message: "Invalid application submission." },
      { status: 400 },
    );
  }
}
