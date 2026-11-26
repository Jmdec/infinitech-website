"use client";

// HR view of employee evaluation requests.
// Place next to the Evaluation Monitoring page:
//   app/admin/evaluation-monitoring/evaluation-requests-panel.tsx
//
// API:
//   GET   /api/admin/evaluation-requests              -> { data: EvalRequest[] }   (all requests, HR)
//   PATCH /api/admin/evaluation-requests/:id          -> { status, scheduled_date, hr_remarks }

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Pencil, Search } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminFetch } from "@/lib/admin-fetch";

type ReqStatus =
  | "Pending review"
  | "Scheduled"
  | "Completed"
  | "Rejected"
  | "Cancelled";

type EvalRequest = {
  id: number;
  employee_id: number;
  employee_number: string | null;
  employee_name: string;
  position: string | null;
  department: string | null;
  date_hired: string | null;
  evaluation_type: string;
  preferred_date: string | null;
  scheduled_date: string | null;
  notes: string | null;
  status: ReqStatus;
  hr_remarks: string | null;
  created_at: string;
};

// HR can set these. "Cancelled" is done by the employee only.
const HR_STATUSES: ReqStatus[] = [
  "Pending review",
  "Scheduled",
  "Completed",
  "Rejected",
];
const FILTERS: ("All" | ReqStatus)[] = [
  "Pending review",
  "Scheduled",
  "Completed",
  "Rejected",
  "Cancelled",
  "All",
];

const STATUS_STYLES: Record<ReqStatus, string> = {
  "Pending review": "bg-amber-50 text-amber-800 ring-amber-600/20",
  Scheduled: "bg-sky-50 text-sky-800 ring-sky-600/20",
  Completed: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  Rejected: "bg-rose-50 text-rose-800 ring-rose-600/20",
  Cancelled: "bg-slate-50 text-slate-700 ring-slate-500/20",
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";
const textareaClass =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-900"
    >
      {initials(name)}
    </span>
  );
}

function StatusBadge({ status }: { status: ReqStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? STATUS_STYLES.Cancelled}`}
    >
      {status}
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      {children}
      {hint && (
        <span className="block text-xs font-normal text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export default function EvaluationRequestsPanel({
  onChanged,
}: {
  /** Called after HR saves a request, so the page can refresh its badge count. */
  onChanged?: () => void;
}) {
  const [requests, setRequests] = useState<EvalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | ReqStatus>("Pending review");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EvalRequest | null>(null);
  const [form, setForm] = useState<{
    status: ReqStatus;
    scheduled_date: string;
    hr_remarks: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readJson<{ data: EvalRequest[] }>(
        await adminFetch("/api/admin/evaluation-requests", {
          cache: "no-store",
        }),
      );
      setRequests(data.data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load evaluation requests.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { All: requests.length };
    for (const r of requests) map[r.status] = (map[r.status] || 0) + 1;
    return map;
  }, [requests]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests.filter(
      (r) =>
        (filter === "All" || r.status === filter) &&
        (!query ||
          [
            r.employee_number,
            r.employee_name,
            r.position,
            r.department,
            r.evaluation_type,
          ].some((v) => (v || "").toLowerCase().includes(query))),
    );
  }, [requests, filter, search]);

  const openReview = (r: EvalRequest) => {
    setSelected(r);
    setForm({
      status: r.status === "Cancelled" ? "Pending review" : r.status,
      scheduled_date: r.scheduled_date || r.preferred_date || "",
      hr_remarks: r.hr_remarks || "",
    });
  };

  const close = () => {
    setSelected(null);
    setForm(null);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !form) return;

    if (form.status === "Scheduled" && !form.scheduled_date) {
      toast.error("Enter the date of the evaluation.");
      return;
    }
    if (form.status === "Rejected" && !form.hr_remarks.trim()) {
      toast.error("Add a remark explaining why the request was rejected.");
      return;
    }

    setSaving(true);
    try {
      const data = await readJson<{ data: EvalRequest }>(
        await adminFetch(`/api/admin/evaluation-requests/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: form.status,
            scheduled_date:
              form.status === "Pending review"
                ? null
                : form.scheduled_date || null,
            hr_remarks: form.hr_remarks.trim() || null,
          }),
        }),
      );
      setRequests((current) =>
        current.map((r) => (r.id === data.data.id ? data.data : r)),
      );
      toast.success("Request updated.");
      close();
      onChanged?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update request.",
      );
    } finally {
      setSaving(false);
    }
  };

  const locked = selected?.status === "Cancelled";

  return (
    <div className="min-w-0 overflow-hidden">
      {/* Filters */}
      <div className="space-y-3 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="font-semibold text-slate-900">
            Evaluation requests{" "}
            <span className="font-normal text-slate-500">
              ({filtered.length})
            </span>
          </h2>
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, ID or type"
              aria-label="Search evaluation requests"
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${filter === f ? "bg-cyan-700 text-white ring-cyan-700" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}
            >
              {f}
              <span
                className={`tabular-nums ${filter === f ? "text-cyan-100" : "text-slate-400"}`}
              >
                {counts[f] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading requests
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="font-medium text-slate-900">No requests</p>
          <p className="mt-1 text-sm text-slate-500">
            {filter === "Pending review"
              ? "Nothing is waiting for review."
              : "No requests match this filter."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Employee</th>
                  <th className="px-3 py-2.5 font-medium">Evaluation</th>
                  <th className="px-3 py-2.5 font-medium">Filed</th>
                  <th className="px-3 py-2.5 font-medium">Preferred date</th>
                  <th className="px-3 py-2.5 font-medium">Scheduled</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="w-[96px] px-4 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="align-middle text-slate-700 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.employee_name} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">
                            {r.employee_name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {r.employee_number}, {r.position}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="whitespace-nowrap">{r.evaluation_type}</p>
                      {r.notes && (
                        <p
                          className="max-w-[220px] truncate text-xs text-slate-500"
                          title={r.notes}
                        >
                          {r.notes}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {fmtDay(r.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {fmtDay(r.preferred_date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {fmtDay(r.scheduled_date)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openReview(r)}
                      >
                        {r.status === "Pending review" ? "Review" : "Details"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => openReview(r)}
                  className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50"
                >
                  <Avatar name={r.employee_name} />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate font-medium text-slate-900">
                      {r.employee_name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {r.evaluation_type}, filed {fmtDay(r.created_at)}
                    </span>
                    <span className="block pt-0.5">
                      <StatusBadge status={r.status} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Review dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-lg">
          {selected && form && (
            <form onSubmit={save} className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-3 pr-6">
                  <Avatar name={selected.employee_name} />
                  <div className="min-w-0 flex-1 text-left">
                    <DialogTitle className="truncate">
                      {selected.employee_name}
                    </DialogTitle>
                    <DialogDescription className="truncate">
                      {selected.employee_number}, {selected.position},{" "}
                      {selected.department}
                    </DialogDescription>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
              </DialogHeader>

              <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <p>
                  Requested:{" "}
                  <span className="font-medium text-slate-900">
                    {selected.evaluation_type}
                  </span>
                </p>
                <p>
                  Filed {fmtDay(selected.created_at)}
                  {selected.preferred_date
                    ? `, preferred ${fmtDay(selected.preferred_date)}`
                    : ""}
                  . Hired {fmtDay(selected.date_hired)}.
                </p>
                {selected.notes && (
                  <p className="whitespace-pre-wrap text-slate-700">
                    Notes: {selected.notes}
                  </p>
                )}
              </div>

              {locked ? (
                <p className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
                  The employee cancelled this request. It can no longer be
                  changed.
                </p>
              ) : (
                <div className="space-y-4">
                  <Field label="Status">
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          status: event.target.value as ReqStatus,
                        })
                      }
                      className={selectClass}
                    >
                      {HR_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>

                  {form.status !== "Pending review" &&
                    form.status !== "Rejected" && (
                      <Field
                        label="Evaluation date"
                        hint={
                          form.status === "Scheduled"
                            ? "The employee will see this date."
                            : undefined
                        }
                      >
                        <Input
                          type="date"
                          value={form.scheduled_date}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              scheduled_date: event.target.value,
                            })
                          }
                        />
                      </Field>
                    )}

                  <Field
                    label={
                      form.status === "Rejected"
                        ? "Remarks (required)"
                        : "Remarks (optional)"
                    }
                    hint="The employee can read this."
                  >
                    <textarea
                      value={form.hr_remarks}
                      onChange={(event) =>
                        setForm({ ...form, hr_remarks: event.target.value })
                      }
                      rows={3}
                      maxLength={1000}
                      className={textareaClass}
                    />
                  </Field>

                  {form.status === "Completed" && (
                    <p className="text-xs text-slate-500">
                      After the evaluation, record the result and remarks in the
                      List tab (Details) so it updates the employee&apos;s
                      progress and milestones.
                    </p>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  {locked ? "Close" : "Cancel"}
                </Button>
                {!locked && (
                  <Button
                    type="submit"
                    disabled={saving}
                    className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Pencil className="h-4 w-4" />
                    )}
                    Save
                  </Button>
                )}
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
