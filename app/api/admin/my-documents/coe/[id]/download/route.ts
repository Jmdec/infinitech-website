import { type NextRequest, NextResponse } from "next/server";

import { generateCoeDocx } from "@/lib/coe/generate-coe-docx";
import { generateCoePdf } from "@/lib/coe/generate-coe-pdf";
import type { Coe, CompanyKey } from "@/components/admin/coe-types";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = request.cookies.get("adminToken")?.value;

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const companyParam = request.nextUrl.searchParams.get("company");
    const company: CompanyKey = companyParam === "abic" ? "abic" : "infinitech";
    const format: "docx" | "pdf" =
      request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "docx";

    // Laravel returns the record only if it belongs to the logged-in employee.
    const response = await fetch(
      `${laravelUrl}/api/admin/my-documents/coe/${id}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${session}`,
        },
        cache: "no-store",
      },
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.data) {
      return NextResponse.json(
        { success: false, message: data?.message ?? "Certificate not found." },
        { status: response.status === 401 ? 401 : 404 },
      );
    }

    const coe: Coe = data.data;
    const buffer =
      format === "pdf"
        ? await generateCoePdf(coe, company)
        : await generateCoeDocx(coe, company);

    const filename = `${coe.certificate_no}-COE.${format}`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("❌ my-documents/coe download error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate the certificate document",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
