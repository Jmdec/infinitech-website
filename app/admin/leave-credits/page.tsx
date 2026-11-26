"use client";

// Leave Credits / Conversion (HR). Place at app/admin/leave-credits/page.tsx
//
// Policy (from the leave credits sheet):
//  - Credits are granted after 1 year from regularization, 5 per year.
//  - Used credits = leaves marked "Approved (Leave Credits)" in Leave Monitoring.
//  - Unused credits are converted to cash every December at the current daily rate.
//
// API:
//   GET  /api/admin/leave-credits?year=2026   -> { data: CreditRow[], year, credits_per_year }
//   POST /api/admin/leave-credits/convert     -> { employee_id, year, converted } -> { data: CreditRow }

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plane,
  Search,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ============================================================================
 * TYPES & HELPERS
 * ========================================================================== */

type LeaveEntry = {
  id: number;
  start_date: string;
  end_date: string;
  days: number;
  half_day_period: "AM" | "PM" | null;
  leave_type: string;
  approver_name: string | null;
};

type Conversion = {
  credits: number;
  daily_rate: number;
  amount: number;
  converted_at: string | null;
};

type CreditRow = {
  id: number;
  employee_number: string;
  employee_name: string;
  position: string;
  department: string;
  date_hired: string;
  regularization_date: string;
  eligible_on: string;
  eligible: boolean;
  daily_rate: number;
  credits: number;
  used: number;
  remaining: number;
  cash_value: number;
  leaves: LeaveEntry[];
  conversion: Conversion | null;
};

type Status = "Eligible" | "Fully used" | "Converted" | "Not yet eligible";

const STATUSES: Status[] = [
  "Eligible",
  "Fully used",
  "Converted",
  "Not yet eligible",
];

const STATUS_STYLES: Record<Status, string> = {
  Eligible: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  "Fully used": "bg-slate-50 text-slate-700 ring-slate-500/20",
  Converted: "bg-sky-50 text-sky-800 ring-sky-600/20",
  "Not yet eligible": "bg-amber-50 text-amber-800 ring-amber-600/20",
};
const STATUS_DOT: Record<Status, string> = {
  Eligible: "bg-emerald-500",
  "Fully used": "bg-slate-400",
  Converted: "bg-sky-500",
  "Not yet eligible": "bg-amber-500",
};

const POLICY: React.ReactNode[] = [
  <>
    Leave credits are granted upon completion of{" "}
    <strong>1 year from regularization</strong>.
  </>,
  <>
    Each employee is entitled to <strong>5 leave credits per year</strong>.
  </>,
  "Leave credits are earned annually and credited at the start of every calendar year.",
  <>
    Leave credits may be used for vacation leave, sick leave, or personal time
    off, <strong>subject to approval</strong>.
  </>,
  "Unused leave credits are convertible to cash every December.",
  <>
    The cash conversion rate is based on the{" "}
    <strong>employee&apos;s current daily rate</strong>.
  </>,
  "To avail, employees must file a leave request at least 3 days in advance (except in cases of emergency or sickness).",
];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});
const num = (n: number) => String(Math.round(n * 100) / 100);

async function readJson<T>(response: Response): Promise<T> {
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

function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("adminSessionActive")
      : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

const parseDay = (value: string) => new Date(`${value}T00:00:00`);
const shortDate = (value: string | null | undefined) =>
  value ? format(parseDay(value), "MMM d, yyyy") : "—";

function leaveRange(l: LeaveEntry) {
  return l.start_date === l.end_date
    ? shortDate(l.start_date)
    : `${shortDate(l.start_date)} – ${shortDate(l.end_date)}`;
}
const leaveDays = (l: LeaveEntry) =>
  l.half_day_period
    ? `Half day (${l.half_day_period})`
    : `${num(l.days)} ${l.days === 1 ? "day" : "days"}`;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function statusOf(r: CreditRow): Status {
  if (r.conversion) return "Converted";
  if (!r.eligible) return "Not yet eligible";
  if (r.remaining <= 0) return "Fully used";
  return "Eligible";
}

// What the employee is credited in cash: the saved amount once converted.
const amountOf = (r: CreditRow) =>
  r.conversion ? r.conversion.amount : r.cash_value;

function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>
  );
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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-base font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

/* ============================================================================
 * PAGE
 * ========================================================================== */

export default function LeaveCreditsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<CreditRow[]>([]);
  const [creditsPerYear, setCreditsPerYear] = useState(5);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readJson<{
        data: CreditRow[];
        credits_per_year: number;
      }>(
        await adminFetch(`/api/admin/leave-credits?year=${year}`, {
          cache: "no-store",
        }),
      );
      setRows(data.data);
      setCreditsPerYear(data.credits_per_year);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load leave credits.",
      );
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!query ||
          [r.employee_number, r.employee_name, r.position, r.department].some(
            (v) => (v || "").toLowerCase().includes(query),
          )) &&
        (statusFilter === "All" || statusOf(r) === statusFilter),
    );
  }, [rows, search, statusFilter]);

  const totals = useMemo(
    () => ({
      credits: filtered.reduce((s, r) => s + r.credits, 0),
      used: filtered.reduce((s, r) => s + r.used, 0),
      remaining: filtered.reduce((s, r) => s + r.remaining, 0),
      amount: filtered.reduce((s, r) => s + amountOf(r), 0),
    }),
    [filtered],
  );

  const stats = useMemo(() => {
    const eligible = rows.filter((r) => r.eligible);
    const pending = eligible.filter((r) => !r.conversion);
    return {
      eligible: eligible.length,
      used: eligible.reduce((s, r) => s + r.used, 0),
      unused: pending.reduce((s, r) => s + r.remaining, 0),
      toConvert: pending.reduce((s, r) => s + r.cash_value, 0),
    };
  }, [rows]);

  const selected = rows.find((r) => r.id === selectedId) || null;

  const setConverted = async (row: CreditRow, converted: boolean) => {
    if (
      converted &&
      !window.confirm(
        `Mark ${num(row.remaining)} unused ${row.remaining === 1 ? "credit" : "credits"} of ${row.employee_name} as converted to cash (${peso.format(row.cash_value)})?`,
      )
    )
      return;

    setConverting(true);
    try {
      const data = await readJson<{ data: CreditRow }>(
        await adminFetch("/api/admin/leave-credits/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: row.id, year, converted }),
        }),
      );
      setRows((current) =>
        current.map((r) => (r.id === data.data.id ? data.data : r)),
      );
      toast.success(converted ? "Marked as converted." : "Conversion undone.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update conversion.",
      );
    } finally {
      setConverting(false);
    }
  };

  const slots = selected
    ? Array.from(
        { length: Math.max(creditsPerYear, selected.leaves.length) },
        (_, i) => selected.leaves[i] ?? null,
      )
    : [];

  return (
    <section className="mx-auto max-w-[1600px] space-y-5 p-1 sm:p-2">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
              <Plane className="h-6 w-6 text-white sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Leave credits
              </h1>
              <p className="mt-1 text-sm text-blue-100">
                Yearly leave credits and December cash conversion. Records come
                from the Employee Masterfile and approved leave.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2 text-blue-100">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              <span>
                <span className="font-semibold text-white">
                  {stats.eligible}
                </span>{" "}
                eligible in {year}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-blue-100">
              <span className="h-2 w-2 rounded-full bg-amber-300" />
              <span>
                <span className="font-semibold text-white">
                  {num(stats.used)}
                </span>{" "}
                credits used
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-blue-100">
              <span className="h-2 w-2 rounded-full bg-cyan-200" />
              <span>
                <span className="font-semibold text-white">
                  {num(stats.unused)}
                </span>{" "}
                unused credits
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-blue-100">
              <span className="h-2 w-2 rounded-full bg-rose-300" />
              <span>
                <span className="font-semibold text-white">
                  {peso.format(stats.toConvert)}
                </span>{" "}
                to convert
              </span>
            </span>
          </div>
        </div>
      </header>

      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:p-5 md:flex-row md:items-center">
          <div className="flex shrink-0 items-center gap-1.5 self-start">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous year"
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-16 text-center text-lg font-semibold tabular-nums text-slate-900">
              {year}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next year"
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, ID, position or department"
              aria-label="Search leave credits"
              className="pl-9"
            />
          </div>
          <div className="md:w-48">
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={selectClass}
            >
              <option value="All">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">
            Leave credits / conversion for {year}{" "}
            <span className="font-normal text-slate-500">
              ({filtered.length})
            </span>
          </h2>
          <p className="hidden text-xs text-slate-500 sm:block">
            Used credits come from leaves marked &ldquo;Approved (Leave
            Credits)&rdquo;.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading leave credits
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="font-medium text-slate-900">No employees match</p>
            <p className="mt-1 text-sm text-slate-500">
              Only active, regularized employees are listed.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Employee</th>
                    <th className="px-3 py-2.5 font-medium">Date hired</th>
                    <th className="px-3 py-2.5 font-medium">Regularization</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Daily rate
                    </th>
                    <th className="px-3 py-2.5 font-medium">Leave credits</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Unused
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Total credited
                    </th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="w-[84px] px-4 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => {
                    const status = statusOf(r);
                    return (
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
                        <td className="whitespace-nowrap px-3 py-3">
                          {shortDate(r.date_hired)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {shortDate(r.regularization_date)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.daily_rate ? peso.format(r.daily_rate) : "—"}
                        </td>
                        <td className="px-3 py-3">
                          {r.eligible ? (
                            <>
                              <p className="whitespace-nowrap tabular-nums">
                                {num(r.used)} of {num(r.credits)} used
                              </p>
                              <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-cyan-600"
                                  style={{
                                    width: `${Math.min(100, (r.used / r.credits) * 100)}%`,
                                  }}
                                />
                              </div>
                            </>
                          ) : (
                            <p className="whitespace-nowrap text-xs text-slate-400">
                              Eligible on {shortDate(r.eligible_on)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.eligible ? num(r.remaining) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-900">
                          {r.eligible ? peso.format(amountOf(r)) : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedId(r.id)}
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-100 text-emerald-950">
                    <td className="px-4 py-2.5 font-semibold" colSpan={4}>
                      Total
                    </td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums">
                      {num(totals.used)} of {num(totals.credits)} used
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {num(totals.remaining)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {peso.format(totals.amount)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50"
                  >
                    <Avatar name={r.employee_name} />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate font-medium text-slate-900">
                        {r.employee_name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {r.employee_number}, {r.position}
                      </span>
                      <span className="block pt-0.5">
                        <StatusBadge status={statusOf(r)} />
                      </span>
                      <span className="block text-xs text-slate-500">
                        {r.eligible
                          ? `${num(r.used)} of ${num(r.credits)} used, ${peso.format(amountOf(r))}`
                          : `Eligible on ${shortDate(r.eligible_on)}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              <li className="bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-950">
                Total: {peso.format(totals.amount)}
              </li>
            </ul>
          </>
        )}
      </Card>

      {/* Policy */}
      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-900">
          Leave credits policy
        </h2>
        <ul className="space-y-2 text-sm text-slate-700">
          {POLICY.map((item, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Details */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        <DialogContent className="max-w-2xl overflow-y-auto max-sm:max-h-[92vh] sm:overflow-visible">
          {selected && (
            <div className="space-y-4">
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
                  <StatusBadge status={statusOf(selected)} />
                </div>
              </DialogHeader>

              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Regularized{" "}
                <span className="font-medium text-slate-900">
                  {shortDate(selected.regularization_date)}
                </span>
                . Eligible for leave credits on{" "}
                <span className="font-medium text-slate-900">
                  {shortDate(selected.eligible_on)}
                </span>
                .
              </p>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile label={`Credits ${year}`} value={num(selected.credits)} />
                <Tile label="Used" value={num(selected.used)} />
                <Tile label="Unused" value={num(selected.remaining)} />
                <Tile
                  label={selected.conversion ? "Converted" : "Cash value"}
                  value={peso.format(amountOf(selected))}
                />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  Date of leave
                </h3>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {slots.map((leave, index) => (
                    <li
                      key={leave?.id ?? `empty-${index}`}
                      className="grid grid-cols-[32px_1fr] items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[32px_1.2fr_1fr_1fr]"
                    >
                      <span className="font-semibold text-slate-500">
                        L{index + 1}
                      </span>
                      {leave ? (
                        <>
                          <span className="text-slate-900">
                            {leaveRange(leave)}
                          </span>
                          <span className="col-start-2 text-slate-600 sm:col-start-auto">
                            {leaveDays(leave)}
                          </span>
                          <span className="col-start-2 truncate text-slate-500 sm:col-start-auto">
                            {leave.approver_name
                              ? `Approved by ${leave.approver_name}`
                              : "No approver"}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {selected.eligible && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  {selected.conversion ? (
                    <>
                      <p className="text-sm text-slate-700">
                        Converted{" "}
                        <span className="font-medium text-slate-900">
                          {num(selected.conversion.credits)}{" "}
                          {selected.conversion.credits === 1
                            ? "credit"
                            : "credits"}
                        </span>{" "}
                        at {peso.format(selected.conversion.daily_rate)} per day
                        {selected.conversion.converted_at
                          ? ` on ${shortDate(selected.conversion.converted_at.slice(0, 10))}`
                          : ""}
                        .
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={converting}
                        onClick={() => void setConverted(selected, false)}
                      >
                        {converting && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        Undo conversion
                      </Button>
                    </>
                  ) : selected.remaining > 0 ? (
                    <>
                      <p className="text-sm text-slate-700">
                        {num(selected.remaining)} unused{" "}
                        {selected.remaining === 1 ? "credit" : "credits"} ×{" "}
                        {peso.format(selected.daily_rate)} ={" "}
                        <span className="font-medium text-slate-900">
                          {peso.format(selected.cash_value)}
                        </span>
                      </p>
                      <Button
                        size="sm"
                        disabled={converting || !selected.daily_rate}
                        onClick={() => void setConverted(selected, true)}
                        className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                      >
                        {converting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Banknote className="h-4 w-4" />
                        )}
                        Mark as converted
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      All leave credits were used. Nothing to convert.
                    </p>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedId(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
