"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Download, FileText, Loader, Pencil, Search, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Employee } from "@/components/admin/employee-types";
import {
  downloadAllPayslips,
  downloadPayslip,
  fetchPayroll,
  fetchPayrollRevisions,
  payslipDataUrl,
  type PayrollCutoff,
  type PayrollEntryRecord,
  type PayrollRevisionRecord as PayrollRevision,
  type PayslipData,
} from "@/lib/api";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// History tab font (falls back if Century Gothic isn't installed on the device).
const HISTORY_FONT = {
  fontFamily:
    '"Century Gothic", CenturyGothic, "URW Gothic", AppleGothic, sans-serif',
};

// Every time a payroll period is saved (the first save, or a save after
// Override) the backend keeps a snapshot of it. That snapshot is a REVISION.
//   GET /api/admin/payroll/revisions?year=&month=&cutoff=
//   -> { data: PayrollRevision[] }   (each one carries its own entries)
// const REVISIONS_URL = "/api/admin/payroll/revisions";

// type PayrollRevision = {
//   id: number;
//   revision: number; // 1 = original save, 2+ = edited saves
//   saved_by: string | null;
//   saved_at: string | null;
//   reason?: string | null;
//   entries: PayrollEntryRecord[];
// };

// ── helpers ──
const num = (value: unknown): number => {
  const n = parseFloat(String(value ?? "").replace(/,/g, ""));

  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const money = (n: number, blankZero = false) =>
  blankZero && n === 0
    ? "—"
    : n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtStamp = (iso: string | null | undefined) => {
  if (!iso) return "—";

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
};

// async function revisionsFetch<T>(url: string): Promise<T> {
//   const token =
//     typeof window !== "undefined"
//       ? localStorage.getItem("adminSessionActive")
//       : null;
//   const headers = new Headers({ Accept: "application/json" });

//   if (token) headers.set("Authorization", `Bearer ${token}`);

//   const response = await fetch(url, { cache: "no-store", headers });
//   const raw = await response.text();
//   let data: any = null;

//   try {
//     data = raw ? JSON.parse(raw) : null;
//   } catch {
//     throw new Error("The server returned an unexpected response.");
//   }

//   if (!response.ok) {
//     throw new Error(data?.message || `Request failed (${response.status}).`);
//   }

//   return data as T;
// }

const getPayrollName = (e: Employee) => {
  const x = e as any;
  const given = [x.first_name, x.middle_name, x.suffix]
    .filter(Boolean)
    .join(" ");

  return [x.last_name, given].filter(Boolean).join(", ") || "—";
};

// Employees hidden from payroll (the owner). Same list as the Payroll page.
// Old saved records of these employees are not shown here, totals, search and
// "Download all payslips" included. Nothing is deleted from the database.
const HIDDEN_EMPLOYEES = ["sarmiento, angelle samson"];

const isHidden = (e: Employee) =>
  HIDDEN_EMPLOYEES.includes(getPayrollName(e).trim().toLowerCase());

// Rebuilds the payslip data from a SAVED entry (nothing is recomputed, so the
// payslip always matches what was saved).
function entryToPayslip(
  entry: PayrollEntryRecord,
  employee: Employee | undefined,
  month: number,
  year: number,
  cutoff: PayrollCutoff,
): PayslipData {
  const days = num(entry.days);
  const mealDays = Math.floor(days);
  const mealAllowance = num(entry.meal_allowance);

  return {
    idNumber: String(employee?.id_number ?? entry.employee_id),
    name: employee
      ? getPayrollName(employee)
      : `Employee #${entry.employee_id}`,
    month,
    year,
    cutoff,
    days,
    mealDays,
    mealRate: mealDays > 0 ? round2(mealAllowance / mealDays) : 0,
    dailyRate: num(entry.daily_rate),
    otHours: num(entry.ot_hours),
    restDayHours: num(entry.rest_day_hours),
    tardinessMinutes: num(entry.tardiness_minutes),
    lwopDays: num(entry.lwop_days),
    basicPay: round2(
      num(entry.gross_income) -
        mealAllowance -
        num(entry.load_allowance) -
        num(entry.overtime) -
        num(entry.rest_day) -
        num(entry.perfect_attendance_amount) -
        num(entry.earnings_adjustment),
    ),
    deMinimis: 0,
  
    overtime: num(entry.overtime),
    restDay: num(entry.rest_day),
    mealAllowance,
    loadAllowance: num(entry.load_allowance),
    perfectAttendance: num(entry.perfect_attendance_amount),
    earningsAdjustment: num(entry.earnings_adjustment),
    grossIncome: num(entry.gross_income),
    tardiness: num(entry.tardiness),
    lwop: num(entry.lwop),
    sss: num(entry.sss),
    pagibig: num(entry.pagibig),
    philhealth: num(entry.philhealth),
    sssLoan: num(entry.sss_loan),
    pagibigLoan: num(entry.pagibig_loan),
    deductionAdjustment: num(entry.deduction_adjustment),
    totalDeduction: num(entry.total_deduction),
    netPay: num(entry.net_pay),
  };
}

// Extra columns shown when "Show full breakdown" is on.
const BREAKDOWN_COLUMNS: { label: string; key: keyof PayrollEntryRecord }[] = [
  { label: "Monthly rate", key: "monthly_rate" },
  { label: "Daily rate", key: "daily_rate" },
  { label: "De minimis", key: "other_de_minimis" },
  { label: "Meal", key: "meal_allowance" },
  { label: "Load", key: "load_allowance" },
  { label: "Overtime", key: "overtime" },
  { label: "Rest day", key: "rest_day" },
  { label: "Perfect att.", key: "perfect_attendance_amount" },
  { label: "Earnings adj.", key: "earnings_adjustment" },
  { label: "Tardiness", key: "tardiness" },
  { label: "LWOP", key: "lwop" },
  { label: "SSS", key: "sss" },
  { label: "PAG-IBIG", key: "pagibig" },
  { label: "PhilHealth", key: "philhealth" },
  { label: "SSS loan", key: "sss_loan" },
  { label: "PAG-IBIG loan", key: "pagibig_loan" },
  { label: "Deduction adj.", key: "deduction_adjustment" },
];

// Everything that is compared between two revisions of the same employee.
const COMPARE_KEYS: { label: string; key: keyof PayrollEntryRecord }[] = [
  { label: "Days", key: "days" },
  { label: "OT hrs", key: "ot_hours" },
  { label: "Rest day hrs", key: "rest_day_hours" },
  { label: "Tardiness mins", key: "tardiness_minutes" },
  { label: "LWOP days", key: "lwop_days" },
  ...BREAKDOWN_COLUMNS,
  { label: "Gross", key: "gross_income" },
  { label: "Deductions", key: "total_deduction" },
  { label: "Net pay", key: "net_pay" },
];

// Labels of the fields that are different between two saved entries.
const changedKeys = (
  now: PayrollEntryRecord,
  before: PayrollEntryRecord,
): (keyof PayrollEntryRecord)[] =>
  COMPARE_KEYS.filter(
    (c) => round2(num(now[c.key])) !== round2(num(before[c.key])),
  ).map((c) => c.key);

const labelOf = (key: keyof PayrollEntryRecord) =>
  COMPARE_KEYS.find((c) => c.key === key)?.label ?? String(key);

const W = "w-[110px] min-w-[110px]";

// History tab: read-only view of saved payroll, with payslip preview/download.
// Every edit (Override + save again) is kept as a new version, so the original
// and the edited payroll can both be opened here.
// Employees are passed in by the payroll page (already fetched there).
export default function PayrollHistory({
  employees,
  employeesLoading,
}: {
  employees: Employee[];
  employeesLoading: boolean;
}) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [cutoff, setCutoff] = useState<PayrollCutoff>(
    today.getDate() <= 15 ? "1-15" : "16-30",
  );

  // All saved versions of the chosen period (oldest first).
  const [revisions, setRevisions] = useState<PayrollRevision[]>([]);
  // Revision number being viewed. null = the latest one.
  const [viewRev, setViewRev] = useState<number | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [onlyEdited, setOnlyEdited] = useState(false);

  // payslip preview
  const [selected, setSelected] = useState<PayslipData | null>(null);

  const loading = employeesLoading || loadingEntries;

  // saved payroll (all versions) for the chosen period
  useEffect(() => {
    let cancelled = false;

    setLoadingEntries(true);
    setViewRev(null);
    (async () => {
      try {
        // bago
        let list: PayrollRevision[] = [];

        try {
          list = (await fetchPayrollRevisions(year, month, cutoff))
            .map((r) => ({ ...r, entries: r.entries ?? [] }))
            .sort((a, b) => a.revision - b.revision);
        } catch {
          list = [];
        }

        // Walang revisions (error o walang laman, hal. na-import via SQL):
        // gamitin ang kasalukuyang saved payroll bilang v1.
        if (list.length === 0) {
          const saved = await fetchPayroll(year, month, cutoff);

          list = saved.length
            ? [
                {
                  id: 0,
                  revision: 1,
                  saved_by: null,
                  saved_at: null,
                  entries: saved,
                },
              ]
            : [];
        }

        if (!cancelled) setRevisions(list);
      } catch (error) {
        if (cancelled) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load payroll history",
        );
        setRevisions([]);
      } finally {
        if (!cancelled) setLoadingEntries(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [year, month, cutoff]);

  const latestRev = revisions.length
    ? revisions[revisions.length - 1].revision
    : null;
  const activeRev = viewRev ?? latestRev;
  const current = revisions.find((r) => r.revision === activeRev) ?? null;
  // The version right before the one being viewed (to show what was edited).
  const previous = current
    ? ([...revisions].filter((r) => r.revision < current.revision).pop() ??
      null)
    : null;

  const entries = current?.entries ?? [];

  const previousById = useMemo(() => {
    const map = new Map<number, PayrollEntryRecord>();

    for (const e of previous?.entries ?? []) map.set(Number(e.employee_id), e);

    return map;
  }, [previous]);

  const employeeById = useMemo(() => {
    const map = new Map<number, Employee>();

    for (const e of employees) map.set(Number(e.id), e);

    return map;
  }, [employees]);

  // Only entries that actually have pay or deductions.
  // Hidden employees (the owner) are left out, even if they were saved before.
  const allRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return entries
      .filter((e) => num(e.gross_income) !== 0 || num(e.total_deduction) !== 0)
      .map((entry) => {
        const before = previousById.get(Number(entry.employee_id));
        const changed = before ? changedKeys(entry, before) : [];

        return {
          entry,
          employee: employeeById.get(Number(entry.employee_id)),
          before,
          changed,
          // Compared with the version before: new row, or something changed.
          edited: Boolean(previous) && (!before || changed.length > 0),
        };
      })
      .filter(({ employee }) => !(employee && isHidden(employee)))
      .filter(({ employee }) => {
        if (!q) return true;
        if (!employee) return false;

        return (
          getPayrollName(employee).toLowerCase().includes(q) ||
          String(employee.id_number ?? "")
            .toLowerCase()
            .includes(q)
        );
      })
      .sort((a, b) =>
        String(a.employee?.id_number ?? "").localeCompare(
          String(b.employee?.id_number ?? ""),
          undefined,
          { numeric: true, sensitivity: "base" },
        ),
      );
  }, [entries, employeeById, searchQuery, previousById, previous]);

  const editedCount = allRows.filter((r) => r.edited).length;
  const rows = onlyEdited ? allRows.filter((r) => r.edited) : allRows;

  const totals = useMemo(() => {
    let gross = 0;
    let deduction = 0;
    let net = 0;

    for (const { entry } of rows) {
      gross += num(entry.gross_income);
      deduction += num(entry.total_deduction);
      net += num(entry.net_pay);
    }

    return { gross, deduction, net };
  }, [rows]);

  const slips = useMemo(
    () =>
      rows.map(({ entry, employee }) =>
        entryToPayslip(entry, employee, month, year, cutoff),
      ),
    [rows, month, year, cutoff],
  );

  const yearOptions = Array.from(
    { length: 5 },
    (_, i) => today.getFullYear() - i,
  );
  const colCount = 7 + (showBreakdown ? BREAKDOWN_COLUMNS.length : 0);

  return (
    <div style={HISTORY_FONT}>
      <div className="w-full min-w-0 space-y-5 py-5 sm:py-8">
        {/* ── Summary ── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard
            label="Employees paid"
            value={loading ? "…" : String(rows.length)}
          />
          <SummaryCard
            label="Total gross"
            value={loading ? "…" : `₱${money(totals.gross)}`}
          />
          <SummaryCard
            label="Total deductions"
            value={loading ? "…" : `₱${money(totals.deduction)}`}
          />
          <SummaryCard
            label="Total net pay"
            value={loading ? "…" : `₱${money(totals.net)}`}
          />
        </div>

        <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* ── Filters ── */}
          <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  aria-label="Search employees"
                  className="pl-9"
                  placeholder="Search by name or ID number"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={String(month)}
                  onValueChange={(v) => setMonth(Number(v))}
                >
                  <SelectTrigger className="h-10 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className="z-[999] border border-slate-200 bg-white text-slate-900 shadow-xl"
                    position="popper"
                    style={HISTORY_FONT}
                  >
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={String(year)}
                  onValueChange={(v) => setYear(Number(v))}
                >
                  <SelectTrigger className="h-10 w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className="z-[999] border border-slate-200 bg-white text-slate-900 shadow-xl"
                    position="popper"
                    style={HISTORY_FONT}
                  >
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                  {(["1-15", "16-30"] as PayrollCutoff[]).map((c) => (
                    <Button
                      key={c}
                      className={`h-10 rounded-none px-4 shadow-none ${
                        cutoff === c
                          ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                          : "bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      type="button"
                      variant="ghost"
                      onClick={() => setCutoff(c)}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Versions (original + every edit) ── */}
            {revisions.length > 0 && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">
                    Version
                  </span>
                  {[...revisions].reverse().map((r) => {
                    const on = r.revision === activeRev;
                    const isLatest = r.revision === latestRev;

                    return (
                      <button
                        key={r.revision}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                          on
                            ? "bg-slate-800 text-white"
                            : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                        }`}
                        type="button"
                        onClick={() => setViewRev(isLatest ? null : r.revision)}
                      >
                        {r.revision === 1 && <>v1 · Original</>}
                        {r.revision > 1 && (
                          <>
                            <Pencil className="h-3 w-3" />v{r.revision} · Edited
                          </>
                        )}
                        {isLatest && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                              on
                                ? "bg-white/20"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            Latest
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {current && (
                  <p className="text-xs text-slate-500">
                    Saved {fmtStamp(current.saved_at)}
                    {current.saved_by ? ` by ${current.saved_by}` : ""}
                    {current.reason ? ` · Reason: ${current.reason}` : ""}
                    {previous
                      ? ` · Compared with v${previous.revision}: ${editedCount} ${editedCount === 1 ? "employee" : "employees"} changed`
                      : ""}
                  </p>
                )}

                {revisions.length > 1 && activeRev !== latestRev && (
                  <p className="text-xs font-medium text-amber-700">
                    You are viewing an older version. The latest is v{latestRev}
                    .
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    checked={showBreakdown}
                    className="h-4 w-4 accent-blue-600"
                    type="checkbox"
                    onChange={(e) => setShowBreakdown(e.target.checked)}
                  />
                  Show full breakdown
                </label>

                {previous && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input
                      checked={onlyEdited}
                      className="h-4 w-4 accent-amber-600"
                      type="checkbox"
                      onChange={(e) => setOnlyEdited(e.target.checked)}
                    />
                    Edited only ({editedCount})
                  </label>
                )}
              </div>

              <Button
                className="h-9"
                disabled={loading || slips.length === 0}
                type="button"
                variant="outline"
                onClick={() => downloadAllPayslips(slips)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download all payslips ({slips.length})
              </Button>
            </div>
          </div>

          {/* ── Table (read-only) ── */}
          <CardContent className="p-0">
            <div className="max-h-[65vh] w-full overflow-auto">
              <table className="w-max min-w-full border-collapse text-xs text-slate-800">
                <thead className="sticky top-0 z-20 bg-slate-100">
                  <tr>
                    <Th left>ID</Th>
                    <Th left sticky>
                      Name
                    </Th>
                    <Th>Days</Th>
                    {showBreakdown &&
                      BREAKDOWN_COLUMNS.map((c) => (
                        <Th key={c.key}>{c.label}</Th>
                      ))}
                    <Th>Gross</Th>
                    <Th>Deductions</Th>
                    <Th>Net pay</Th>
                    <Th>Payslip</Th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <EmptyRow colSpan={colCount}>
                      <span className="inline-flex items-center gap-2">
                        <Loader className="h-4 w-4 animate-spin" />
                        Loading payroll...
                      </span>
                    </EmptyRow>
                  ) : rows.length === 0 ? (
                    <EmptyRow colSpan={colCount}>
                      {entries.length === 0
                        ? `No payroll saved for ${MONTHS[month - 1]} ${year}, cut-off ${cutoff}.`
                        : onlyEdited
                          ? "No edited employees in this version."
                          : "No employees match your search."}
                    </EmptyRow>
                  ) : (
                    rows.map(
                      ({ entry, employee, before, changed, edited }, i) => {
                        const was = (key: keyof PayrollEntryRecord) =>
                          before && changed.includes(key)
                            ? money(num(before[key]), true)
                            : null;

                        return (
                          <tr
                            key={entry.employee_id}
                            className={`border-b border-slate-100 hover:bg-blue-50/40 ${
                              edited ? "bg-amber-50/60" : ""
                            }`}
                          >
                            <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                              {employee?.id_number ?? "—"}
                            </td>
                            <td
                              className={`sticky left-0 z-10 whitespace-nowrap px-3 py-2.5 font-medium ${
                                edited ? "bg-amber-50" : "bg-white"
                              }`}
                            >
                              {employee
                                ? getPayrollName(employee)
                                : `Employee #${entry.employee_id}`}
                              {edited && (
                                <span
                                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                                  title={
                                    before
                                      ? `Changed: ${changed.map(labelOf).join(", ")}`
                                      : "Not in the previous version"
                                  }
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                  {before ? "Edited" : "Added"}
                                </span>
                              )}
                            </td>
                            <Td was={was("days")}>{num(entry.days) || "—"}</Td>

                            {showBreakdown &&
                              BREAKDOWN_COLUMNS.map((c) => (
                                <Td
                                  key={c.key}
                                  muted
                                  was={was(c.key)}
                                  hot={changed.includes(c.key)}
                                >
                                  {money(num(entry[c.key]), true)}
                                </Td>
                              ))}

                            <Td
                              hot={changed.includes("gross_income")}
                              was={was("gross_income")}
                            >
                              {money(num(entry.gross_income))}
                            </Td>
                            <Td
                              hot={changed.includes("total_deduction")}
                              was={was("total_deduction")}
                            >
                              {money(num(entry.total_deduction), true)}
                            </Td>
                            <Td
                              hot={changed.includes("net_pay")}
                              strong
                              was={was("net_pay")}
                            >
                              {money(num(entry.net_pay))}
                            </Td>
                            <td className="px-3 py-2 text-center">
                              <Button
                                className="h-8 px-3"
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={() => setSelected(slips[i])}
                              >
                                <FileText className="mr-1.5 h-3.5 w-3.5" />
                                View
                              </Button>
                            </td>
                          </tr>
                        );
                      },
                    )
                  )}
                </tbody>

                {!loading && rows.length > 0 && (
                  <tfoot className="sticky bottom-0 z-20 bg-slate-100 font-bold">
                    <tr>
                      <td
                        className="px-3 py-2 text-right"
                        colSpan={
                          3 + (showBreakdown ? BREAKDOWN_COLUMNS.length : 0)
                        }
                      >
                        Total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(totals.gross)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(totals.deduction)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(totals.net)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Payslip preview ── */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-900">
                  {selected.name}
                </h2>
                <p className="text-sm text-slate-500">
                  {MONTHS[month - 1]} {year}, cut-off {cutoff}
                  {activeRev ? ` · v${activeRev}` : ""}
                </p>
              </div>
              <button
                aria-label="Close"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                type="button"
                onClick={() => setSelected(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`Payslip of ${selected.name}`}
                className="mx-auto w-full border border-slate-200 bg-white shadow-sm"
                src={payslipDataUrl(selected)}
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelected(null)}
              >
                Close
              </Button>
              <Button
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                type="button"
                onClick={() => downloadPayslip(selected)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download PNG
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── small UI pieces ── */
function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
        {value}
      </p>
    </div>
  );
}

function Th({
  children,
  left,
  sticky,
}: {
  children?: React.ReactNode;
  left?: boolean;
  sticky?: boolean;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-300 px-3 py-2.5 text-[11px] font-semibold text-slate-700 ${
        left ? "text-left" : `text-right ${W}`
      } ${sticky ? "sticky left-0 z-30 bg-slate-100" : ""}`}
    >
      {children}
    </th>
  );
}

// `hot` = this value was changed in this version, `was` = the old value.
function Td({
  children,
  muted,
  strong,
  hot,
  was,
}: {
  children: React.ReactNode;
  muted?: boolean;
  strong?: boolean;
  hot?: boolean;
  was?: string | null;
}) {
  return (
    <td
      className={`${W} whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${
        muted ? "text-slate-500" : ""
      } ${strong ? "font-bold text-slate-900" : ""} ${
        hot ? "bg-amber-100/70 font-semibold text-amber-900" : ""
      }`}
    >
      {children}
      {was != null && (
        <span className="block text-[10px] font-normal text-slate-400 line-through">
          {was}
        </span>
      )}
    </td>
  );
}

function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td className="h-48 text-center text-sm text-slate-500" colSpan={colSpan}>
        {children}
      </td>
    </tr>
  );
}
