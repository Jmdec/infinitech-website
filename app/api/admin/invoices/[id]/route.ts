import { type NextRequest } from "next/server";
import { invoiceProxy } from "@/lib/invoiceProxy";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(r: NextRequest, { params }: Ctx) {
  return invoiceProxy(r, `/api/admin/invoices/${(await params).id}`);
}
export async function PUT(r: NextRequest, { params }: Ctx) {
  return invoiceProxy(r, `/api/admin/invoices/${(await params).id}`, true);
}
export async function DELETE(r: NextRequest, { params }: Ctx) {
  return invoiceProxy(r, `/api/admin/invoices/${(await params).id}`);
}
