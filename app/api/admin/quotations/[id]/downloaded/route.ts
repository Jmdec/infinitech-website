// app/api/admin/quotations/[id]/downloaded/route.ts
import { type NextRequest } from "next/server";
import { invoiceProxy } from "@/lib/invoiceProxy";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(r: NextRequest, { params }: Ctx) {
  return invoiceProxy(
    r,
    `/api/admin/quotations/${(await params).id}/downloaded`,
    true,
  );
}
