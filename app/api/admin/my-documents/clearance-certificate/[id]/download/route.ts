import { type NextRequest, NextResponse } from "next/server";

import { generateClearanceDocx } from "@/lib/generate-clearance-docx";
import { generateClearancePdf } from "@/lib/generate-clearance-pdf";
import {
  buildClearanceCertificateFilename,
  type ClearanceCertificateData,
} from "@/lib/generate-clearance-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
} as const;

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

    const format: "docx" | "pdf" =
      request.nextUrl.searchParams.get("format") === "docx" ? "docx" : "pdf";

    // Laravel returns the record only if it belongs to the logged-in employee.
    const response = await fetch(
      `${laravelUrl}/api/admin/my-documents/clearance-certificate/${id}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${session}`,
        },
        cache: "no-store",
      },
    );
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.data) {
      return NextResponse.json(
        {
          success: false,
          message: result?.message ?? "Clearance certificate not found.",
        },
        { status: response.status === 401 ? 401 : 404 },
      );
    }

    const r = result.data;

    // Rebuilt from the SAVED record: nothing is created or re-numbered here.
    const data: ClearanceCertificateData = {
      certificate_no: String(r.certificate_no),
      employee_name: String(r.employee_name ?? ""),
      id_number: String(r.id_number ?? ""),
      position: String(r.position ?? ""),
      department: String(r.department ?? ""),
      last_working_day: String(r.last_working_day ?? ""),
      date_issued: r.date_issued ? String(r.date_issued) : undefined,
      signatory_name: r.signatory_name || undefined,
      signatory_title: r.signatory_title || undefined,
    };

    const company: string | undefined = r.company || undefined;

    const file =
      format === "docx"
        ? await generateClearanceDocx(data, company)
        : await generateClearancePdf(data, company);

    const filename = buildClearanceCertificateFilename(data, format);

    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": MIME[format],
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("my-documents clearance certificate download error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to build the clearance certificate",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
