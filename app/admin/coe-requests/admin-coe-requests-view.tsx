"use client";

// Admin / HR / Superadmin view of ALL COE requests.
// Place next to the page file: app/admin/coe-requests/admin-coe-requests-view.tsx
// HR can review each request: change its status and leave remarks.

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { FileText, Loader2, RefreshCw, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/admin-fetch";

const STATUSES = ["Pending review", "Processing", "Released", "Rejected"];
const ALL_STATUSES = [...STATUSES, "Cancelled"];

const STATUS_STYLES: Record<string, string> = {
  "Pending review": "bg-amber-50 text-amber-800 ring-amber-600/20",
  Processing: "bg-sky-50 text-sky-800 ring-sky-600/20",
  Released: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  Rejected: "bg-rose-50 text-rose-800 ring-rose-600/20",
  Cancelled: "bg-slate-50 text-slate-700 ring-slate-500/20",
};
const STATUS_DOT: Record<string, string> = {
  "Pending review": "bg-amber-500",
  Processing: "bg-sky-500",
  Released: "bg-emerald-500",
  Rejected: "bg-rose-500",
  Cancelled: "bg-slate-400",
};

const selectClass =
  "h-10 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";
const textareaClass =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

type CoeRequest = {
  id: number;
  employee_id: number;
  // These come from the API if the controller joins the employee record.
  employee_name?: string | null;
  employee_number?: string | null;
  department?: string | null;
  purpose: string;
  other_purpose: string | null;
  needed_by: string | null;
  include_compensation: boolean | number;
  notes: string | null;
  status: string;
  hr_remarks: string | null;
  created_at: string;
};

async function readJson<T = any>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errors = data.errors
      ? Object.values(data.errors as Record<string, string[]>)
          .flat()
          .join(" ")
      : "";
    throw new Error(
      errors || data.message || "The request could not be completed.",
    );
  }
  return data as T;
}

const fmtDay = (value?: string | null) =>
  value
    ? format(new Date(`${value.slice(0, 10)}T00:00:00`), "MMM d, yyyy")
    : "—";

const purposeLabel = (r: Pick<CoeRequest, "purpose" | "other_purpose">) =>
  r.other_purpose ? `${r.purpose} — ${r.other_purpose}` : r.purpose;

const employeeLabel = (r: CoeRequest) =>
  r.employee_name
    ? `${r.employee_name}${r.employee_number ? ` (${r.employee_number})` : ""}`
    : `Employee #${r.employee_id}`;

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? STATUS_STYLES.Cancelled}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-slate-400"}`}
      />
      {status}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function AdminCoeRequestsView() {
  const [requests, setRequests] = useState<CoeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selected, setSelected] = useState<CoeRequest | null>(null);
  const [status, setStatus] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readJson<{ data: CoeRequest[] }>(
        await adminFetch("/api/admin/coe-requests", { cache: "no-store" }),
      );
      setRequests(data.data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load COE requests.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of requests) map[r.status] = (map[r.status] ?? 0) + 1;
    return map;
  }, [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...requests]
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter(
        (r) =>
          !q ||
          [employeeLabel(r), r.department ?? "", purposeLabel(r), r.notes ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  }, [requests, search, statusFilter]);

  const openReview = (request: CoeRequest) => {
    setSelected(request);
    setStatus(request.status);
    setRemarks(request.hr_remarks ?? "");
  };

  const save = async () => {
    if (!selected) return;
    if (status === "Rejected" && !remarks.trim()) {
      toast.error("Add a remark explaining why the request is rejected.");
      return;
    }

    setSaving(true);
    try {
      await readJson(
        await adminFetch(`/api/admin/coe-requests/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            hr_remarks: remarks.trim() || null,
          }),
        }),
      );
      toast.success("Request updated.");
      setSelected(null);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update the request.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-[1400px] space-y-5 p-1 sm:p-2">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="flex items-center gap-3 p-5 sm:p-7">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
            <FileText className="h-6 w-6 text-white sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              COE requests
            </h1>
            <p className="mt-1 text-sm text-blue-100">
              Review Certificate of Employment requests from all employees.
            </p>
          </div>
        </div>
      </header>

      {/* Status summary (click to filter) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-slate-300 ${statusFilter === s ? "border-cyan-600 ring-2 ring-cyan-600/20" : "border-slate-200"}`}
          >
            <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
              {s}
            </span>
            <span className="mt-1 block text-2xl font-semibold tabular-nums text-slate-900">
              {counts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee, department or purpose"
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${selectClass} w-auto min-w-[160px]`}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          Showing {filtered.length} of {requests.length}
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            {loading ? "Loading…" : "No COE requests found."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-4"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {employeeLabel(r)}
                    {r.department && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                        {r.department}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-800">{purposeLabel(r)}</p>
                  <p className="text-xs text-slate-500">
                    Filed {fmtDay(r.created_at)}
                    {r.needed_by ? ` · Needed by ${fmtDay(r.needed_by)}` : ""}
                    {" · "}
                    {r.include_compensation
                      ? "With salary & allowances"
                      : "Without salary"}
                  </p>
                  {r.notes && (
                    <p
                      className="max-w-xl truncate text-xs text-slate-400"
                      title={r.notes}
                    >
                      Note: {r.notes}
                    </p>
                  )}
                  {r.hr_remarks && (
                    <p className="text-xs text-slate-600">HR: {r.hr_remarks}</p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={r.status} />
                  {r.status !== "Cancelled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => openReview(r)}
                    >
                      Review
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Review dialog */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setSelected(null);
          }}
        >
          <Card className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900">
                  Review COE request
                </h2>
                <p className="truncate text-sm text-slate-500">
                  {employeeLabel(selected)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => !saving && setSelected(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
              <dt className="text-slate-500">Purpose</dt>
              <dd className="text-slate-900">{purposeLabel(selected)}</dd>
              <dt className="text-slate-500">Filed</dt>
              <dd className="text-slate-900">{fmtDay(selected.created_at)}</dd>
              <dt className="text-slate-500">Needed by</dt>
              <dd className="text-slate-900">{fmtDay(selected.needed_by)}</dd>
              <dt className="text-slate-500">Compensation</dt>
              <dd className="text-slate-900">
                {selected.include_compensation
                  ? "Include salary & allowances"
                  : "Position and dates only"}
              </dd>
              {selected.notes && (
                <>
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="whitespace-pre-wrap text-slate-900">
                    {selected.notes}
                  </dd>
                </>
              )}
            </dl>

            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={selectClass}
              >
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>

            <Field label="HR remarks">
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                maxLength={1000}
                rows={3}
                className={textareaClass}
                placeholder="Visible to the employee, e.g. pick-up date or reason for rejection"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setSelected(null)}
                disabled={saving}
              >
                Close
              </Button>
              <Button
                onClick={() => void save()}
                disabled={saving}
                className="bg-gradient-to-r from-blue-600 to-purple-600 font-semibold text-white hover:from-blue-700 hover:to-purple-700"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
