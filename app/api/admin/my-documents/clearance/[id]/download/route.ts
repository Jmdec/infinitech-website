import { type NextRequest, NextResponse } from "next/server";

import { generateClearanceDocx } from "@/lib/clearance/generate-clearance-docx";
import { generateClearancePdf } from "@/lib/clearance/generate-clearance-pdf";
import { buildClearanceFilename } from "@/components/admin/clearance-types";

export const runtime = "nodejs"; // needs fs (logo files) + sharp

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

    const format: "docx" | "pdf" =
      request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "docx";
    const company = "infinitech" as const;

    // 1 · Laravel returns the record only if it belongs to the logged-in employee.
    const response = await fetch(
      `${laravelUrl}/api/admin/my-documents/clearance/${id}`,
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
          message: result?.message ?? "Clearance form not found.",
        },
        { status: response.status === 401 ? 401 : 404 },
      );
    }

    const record = result.data;
    const employeeId = Number(record.employee.employee_id);

    const docPayload: any = {
      employee: {
        employee_id: employeeId,
        employee_name: record.employee.employee_name ?? "",
        id_number: record.employee.id_number ?? "",
        position: record.employee.position ?? "",
        department: record.employee.department ?? "",
      },
      units: record.units,
      properties: record.properties,
    };

    // 2 · Employee signature (optional). The employee id comes from the
    // ownership-checked record, never from the client, so the service token is safe here.
    const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;

    if (serviceToken && employeeId > 0) {
      const signatureResponse = await fetch(
        `${laravelUrl}/api/employee-masterfile/${employeeId}/files/signature`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${serviceToken}`,
          },
          cache: "no-store",
        },
      );
      const mimeType = signatureResponse.headers.get("content-type");

      if (
        signatureResponse.ok &&
        (mimeType === "image/png" || mimeType === "image/jpeg")
      ) {
        docPayload.employee_signature = {
          data: new Uint8Array(await signatureResponse.arrayBuffer()),
          mimeType,
        };
      }
    }

    // 3 · Build the file with your existing generators.
    const file =
      format === "pdf"
        ? await generateClearancePdf(docPayload, company)
        : await generateClearanceDocx(docPayload, company);

    const filename = buildClearanceFilename(
      docPayload.employee.employee_name,
      docPayload.employee.id_number,
      format,
    );

    return new NextResponse(new Uint8Array(file), {
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
    console.error("my-documents clearance download error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate the clearance form",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
