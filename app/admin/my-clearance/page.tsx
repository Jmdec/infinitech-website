// File: app/admin/my-clearance/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ClipboardCheck, Loader2, Printer } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { adminFetch } from "@/lib/admin-fetch";
import { splitItems } from "@/components/admin/clearance-types";

type ClearanceRow = {
  id: number;
  clearance_no?: string;
  employee_name?: string;
  id_number?: string;
  position?: string;
  department?: string;
  units?: { unit: string; items: string }[];
  properties?: { item: string }[];
  employee?: Record<string, any>;
  created_at?: string;
};

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

const fmtDay = (value?: string | null) =>
  value
    ? format(new Date(`${value.slice(0, 10)}T00:00:00`), "MMM d, yyyy")
    : "—";

async function readJson<T = any>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "The request could not be completed.");
  }
  return data as T;
}

// Builds the printable page. Printed from a hidden iframe so the app's own
// layout (sidebar, header) never ends up on the paper.
function buildPrintHtml(r: ClearanceRow) {
  const name = r.employee_name ?? r.employee?.employee_name ?? "";
  const idNumber = r.id_number ?? r.employee?.id_number ?? "";
  const position = r.position ?? r.employee?.position ?? "";
  const department = r.department ?? r.employee?.department ?? "";
  const units = r.units ?? [];
  const properties = r.properties ?? [];

  const unitRows = units
    .map(
      (u) => `<tr>
        <td class="unit">${esc(u.unit)}</td>
        <td>${splitItems(u.items)
          .map((item: string) => `<div>&#9744; ${esc(item)}</div>`)
          .join("")}</td>
        <td class="sig"></td>
        <td class="sig"></td>
      </tr>`,
    )
    .join("");

  const propertyRows = properties
    .map(
      (p) => `<tr>
        <td>${esc(p.item)}</td>
        <td class="sig"></td>
        <td class="sig"></td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Clearance Form ${esc(r.clearance_no ?? "")}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 2px; letter-spacing: .5px; }
  .no { text-align: center; color: #555; margin-bottom: 14px; }
  h2 { font-size: 12px; text-transform: uppercase; background: #eee; padding: 6px 8px; margin: 16px 0 0; border: 1px solid #999; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #999; padding: 6px 8px; vertical-align: top; text-align: left; }
  th { background: #f6f6f6; font-size: 11px; }
  .label { width: 22%; background: #fafafa; font-weight: bold; }
  .unit { width: 22%; font-weight: bold; }
  .sig { width: 18%; height: 34px; }
  .sign-row { display: flex; gap: 40px; margin-top: 40px; }
  .sign-row div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 11px; }
  tr { page-break-inside: avoid; }
</style></head><body>
  <h1>EMPLOYEE CLEARANCE FORM</h1>
  <div class="no">${esc(r.clearance_no ?? "")}${r.created_at ? ` &middot; ${esc(fmtDay(r.created_at))}` : ""}</div>

  <h2>A. Employee and Separation Information</h2>
  <table>
    <tr><td class="label">Employee Name</td><td>${esc(name)}</td>
        <td class="label">Employee ID</td><td>${esc(idNumber)}</td></tr>
    <tr><td class="label">Position</td><td>${esc(position)}</td>
        <td class="label">Department</td><td>${esc(department)}</td></tr>
  </table>

  <h2>B. Departmental Clearance</h2>
  <table>
    <tr><th>Unit</th><th>Items</th><th>Cleared by (name / signature)</th><th>Date</th></tr>
    ${unitRows || `<tr><td colspan="4">No departmental items.</td></tr>`}
  </table>

  <h2>C. Property and Access Turnover</h2>
  <table>
    <tr><th>Item</th><th>Received by (name / signature)</th><th>Date</th></tr>
    ${propertyRows || `<tr><td colspan="3">No property items.</td></tr>`}
  </table>

  <div class="sign-row">
    <div>Employee&rsquo;s signature over printed name</div>
    <div>HR / Authorized representative</div>
  </div>
</body></html>`;
}

function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    throw new Error("Unable to open the print preview.");
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Give the iframe a tick to lay out, then print and clean up afterwards.
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 1500);
  }, 250);
}

export default function MyClearancePage() {
  const [rows, setRows] = useState<ClearanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [printingId, setPrintingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readJson<{ data: ClearanceRow[] }>(
        await adminFetch("/api/admin/my-clearance", { cache: "no-store" }),
      );
      setRows(data.data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load your clearance forms.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const print = async (row: ClearanceRow) => {
    setPrintingId(row.id);
    try {
      // Fetch the full record (sections B and C) right before printing.
      const data = await readJson<{ data: ClearanceRow }>(
        await adminFetch(`/api/admin/my-clearance?id=${row.id}`, {
          cache: "no-store",
        }),
      );
      printHtml(buildPrintHtml({ ...row, ...data.data }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to print the form.",
      );
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <section className="mx-auto max-w-[1100px] space-y-5 p-1 sm:p-2">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="flex items-center gap-3 p-5 sm:p-7">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
            <ClipboardCheck className="h-6 w-6 text-white sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              My clearance
            </h1>
            <p className="mt-1 text-sm text-blue-100">
              View and print the clearance form HR prepared for you.
            </p>
          </div>
        </div>
      </header>

      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">
            Clearance forms{" "}
            <span className="font-normal text-slate-500">({rows.length})</span>
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            No clearance form has been generated for you yet. HR creates it from
            the Employee Masterfile.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {r.clearance_no || `Clearance #${r.id}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[r.position, r.department].filter(Boolean).join(" · ") ||
                      "—"}
                    {r.created_at ? ` · Prepared ${fmtDay(r.created_at)}` : ""}
                  </p>
                </div>

                <Button
                  size="sm"
                  className="h-9 bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                  disabled={printingId === r.id}
                  onClick={() => void print(r)}
                >
                  {printingId === r.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="mr-2 h-4 w-4" />
                  )}
                  Print
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
