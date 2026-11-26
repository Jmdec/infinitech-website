// app/api/admin/quotations/route.ts
import { type NextRequest } from "next/server";
import { invoiceProxy } from "@/lib/invoiceProxy";

export const dynamic = "force-dynamic";

export const GET = (r: NextRequest) => invoiceProxy(r, "/api/admin/quotations");
export const POST = (r: NextRequest) =>
  invoiceProxy(r, "/api/admin/quotations", true);
