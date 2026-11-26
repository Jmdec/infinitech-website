"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileImage,
  FileSpreadsheet,
  KeyRound,
  Loader,
  Lock,
  Save,
  Search,
  Unlock,
  X,
} from "lucide-react";

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
import PayrollHistory from "@/components/admin/payroll-history";
import {
  downloadAllPayslips,
  downloadPayslip,
  fetchContributionLinks,
  fetchAdminSession,
  fetchPayroll,
  fetchPayrollEmployees,
  generateOverrideCode,
  overridePayroll,
  payslipDataUrl,
  saveContributionLink,
  savePayroll,
  setEmployeeFixed,
  type PayrollEntryRecord,
  type PayslipData,
} from "@/lib/api";
import {
  PAGIBIG_AMOUNT,
  philhealthEmployeeShare,
  sssEmployeeShare,
} from "@/lib/contributions";
import {
  exportPayrollJpg,
  exportPayrollXlsx,
  type ExportColumn,
  type PayrollExportData,
} from "@/lib/payroll-export";
import { PH_ROWS, phRowIndex } from "@/lib/philhealth-table";
import { SSS_ROWS, sssRowIndex } from "@/lib/sss-table";

/* ────────────────────────────────────────────────────────────────────────────
 * PAYROLL RULES
 *   Daily rate        = (monthly rate + de minimis) / working days of the month
 *                       (de minimis is only FETCHED from the masterfile; it is
 *                        not a separate earning, it is part of the daily rate)
 *   Working days      = 22 (Mon–Fri) for every month, even 31-day ones. Only
 *                       February is reduced (its Mon–Fri count: 20 or 21).
 *   Days worked       = AUTO: Mon–Fri count of the chosen cut-off
 *                       (1-15 or 16-end of month). Can still be edited.
 *   Hourly rate       = daily rate / 8
 *   Basic pay         = (monthly rate + de minimis) / 2  (per cut-off, NOT × days;
 *                       absences are deducted through LWOP)
 *   Meal allowance    = (days − LWOP days − half days, whole days only) × meal allowance rate
 *   Load allowance    = fetched, 1st cut-off (1-15) only
 *   Overtime          = hourly × 125% × rendered OT
 *   Rendered OT       = hours + (minutes / 60)
 *                       AUTO from the submitted Timekeeping: any Time Out after
 *                       the official end (5:00 PM) on a full Mon–Fri day counts
 *                       as OT. Still EDITABLE here (OT is for approval).
 *   Rest day          = ≤ 8 hrs: hourly × 1.3 × hrs
 *                       > 8 hrs: (8 × hourly × 1.3) + ((hrs − 8) × hourly × 1.69)
 *   Perfect attendance= ₱500, paid only on 2nd cut-off (16-30), but judged for the
 *                       WHOLE MONTH (1st up to the last day).
 *                       AUTO-CHECKED from the submitted Timekeeping (every batch that
 *                       overlaps the month: 1-15 batch + 16-end batch): every Mon–Fri
 *                       of the month must be a full present day (no leave, no
 *                       half day, no absence, no late past the grace period).
 *                       It can still be changed by hand ("Use timekeeping" resets it).
 *   Tardiness         = hourly × (minutes / 60)
 *   LWOP              = daily rate × LWOP days
 *   SSS               = automatic, 2nd cut-off (16-30) only, bracket based on
 *                       (monthly rate + de minimis)
 *   PhilHealth        = automatic, 1st cut-off (1-15) only, from monthly rate
 *   Pag-IBIG          = automatic, 1st cut-off (1-15) only, always ₱200
 *                       Each one has an ON/OFF toggle per employee (per period).
 *                       The source link has its OWN Save button (separate from
 *                       "Save payroll") and a "Last updated" stamp.
 *   Net pay           = gross income − total deduction
 *
 *   HIDDEN EMPLOYEES  = (e.g. the company owner) are not shown, not saved and
 *                       get no payslip.
 *
 *   FINAL SAVE        = once a period is saved it is locked (view only).
 *                       Override unlocks it:
 *                         - superadmin  -> no password
 *                         - everyone else -> needs a ONE-TIME code that a
 *                           superadmin generates (single use, per period)
 * ──────────────────────────────────────────────────────────────────────────── */

const HOURS_PER_DAY = 8;
const OT_MULTIPLIER = 1.25;
const REST_DAY_MULTIPLIER = 1.3;
const REST_DAY_EXCESS_MULTIPLIER = 1.69;
const PERFECT_ATTENDANCE_AMOUNT = 500;
// Most days that can be entered for one cut-off.
const MAX_DAYS_PER_CUTOFF = 12;

// Submitted timekeeping (from the Timekeeping page). Same endpoints it uses:
//   GET /api/admin/timekeeping       -> list of submitted batches
//   GET /api/admin/timekeeping/<id>  -> one batch with all of its records
const TIMEKEEPING_URL = "/api/admin/timekeeping";

type Cutoff = "1-15" | "16-30";
type ContribKind = "sss" | "philhealth" | "pagibig";
const CONTRIB_OFF_KEY = "payrollContributionOff";
type Tab = "payroll" | "payslip" | "history" | "contributions";
type View = "form" | "table";

// True while the chosen period is final saved. Read by <Field> so every input
// shows the "locked" look without passing a prop through every call site.
const LockedContext = createContext(false);

// Source link of a contribution table + when it was last saved.
type ContribLink = { url: string; updatedAt: string | null };

const formatUpdated = (iso: string | null): string | null => {
  if (!iso) return null;

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const VIEWS: { key: View; label: string }[] = [
  { key: "form", label: "Form" },
  { key: "table", label: "Table" },
];

// Column counts for the table view, so the group headers / footer stay aligned.
// (+1 for NET PAY, +1 for the SELECT checkbox column at the right end)
const EARNINGS_COLS = 11;
const DEDUCTION_COLS = 9;
const TOTAL_COLS = 3 + EARNINGS_COLS + DEDUCTION_COLS + 1 + 1;

// Columns of the table view, in the same order, for the Excel / JPG export.
const EXPORT_COLUMNS: ExportColumn[] = [
  { label: "PERIOD", group: "details", kind: "text" },
  { label: "ID NUMBER", group: "details", kind: "text" },
  { label: "NAME", group: "details", kind: "name" },
  { label: "MO.RATE", group: "earnings", kind: "amount" },
  { label: "DE MINIMIS", group: "earnings", kind: "money" },
  { label: "DAYS", group: "earnings", kind: "plain" },
  { label: "DAILY RATE", group: "earnings", kind: "amount" },
  { label: "MEAL ALLOWANCE", group: "earnings", kind: "money" },
  { label: "LOAD ALLOWANCE", group: "earnings", kind: "money" },
  { label: "OVERTIME", group: "earnings", kind: "money" },
  { label: "REST DAY", group: "earnings", kind: "money" },
  { label: "PERFECT ATTENDANCE", group: "earnings", kind: "money" },
  { label: "ADJUSTMENT", group: "earnings", kind: "money" },
  { label: "GROSS INCOME", group: "earnings", kind: "amount" },
  { label: "TARDINESS", group: "deductions", kind: "money" },
  { label: "LWOP", group: "deductions", kind: "money" },
  { label: "SSS", group: "deductions", kind: "money" },
  { label: "PAG-IBIG", group: "deductions", kind: "money" },
  { label: "PHILHEALTH", group: "deductions", kind: "money" },
  { label: "SSS LOAN", group: "deductions", kind: "money" },
  { label: "PAG-IBIG LOAN", group: "deductions", kind: "money" },
  { label: "ADJUSTMENT", group: "deductions", kind: "money" },
  { label: "TOTAL DEDUCTION", group: "deductions", kind: "amount" },
  { label: "NET PAY", group: "net", kind: "amount" },
];
const EXPORT_GROSS_COL = EXPORT_COLUMNS.findIndex(
  (c) => c.label === "GROSS INCOME",
);
const EXPORT_DEDUCTION_COL = EXPORT_COLUMNS.findIndex(
  (c) => c.label === "TOTAL DEDUCTION",
);
const EXPORT_NET_COL = EXPORT_COLUMNS.findIndex((c) => c.label === "NET PAY");

const TABS: { key: Tab; label: string }[] = [
  { key: "payroll", label: "Payroll" },
  { key: "payslip", label: "Payslip" },
  { key: "history", label: "History" },
  { key: "contributions", label: "Government References" },
];

// SSS, PhilHealth and Pag-IBIG are automatic, so they are not typed inputs.
type RowInput = {
  days: string;
  otHours: string;
  restDayHours: string;
  // null = automatic (from the submitted timekeeping). true / false = set by
  // hand, or loaded from a saved payroll.
  perfectAttendance: boolean | null;
  earningsAdjustment: string;
  tardinessMinutes: string;
  lwopDays: string;
  halfDays: string;
  sssLoan: string;
  pagibigLoan: string;
  deductionAdjustment: string;
  // Contribution toggles (ON by default).
  sssOn: boolean;
  philhealthOn: boolean;
  pagibigOn: boolean;
};

// What the rest of the page works with: perfect attendance is already decided.
type ResolvedInput = Omit<RowInput, "perfectAttendance"> & {
  perfectAttendance: boolean;
};

// ── Submitted timekeeping (read-only here) ──
type TkBatchLite = {
  id: number;
  start_date: string;
  end_date: string;
  official_end?: string | null;
};
type TkRecord = {
  employee_number: string;
  date: string;
  time_out?: string | null;
  overtime_minutes?: number | string; // approved OT from Timekeeping
  no_of_days: number | string;
  mins_late: number | string;
  grace_deduction: number | string;
  is_leave: boolean | number | string;
  auto_filled_out?: boolean | number | string;
  _officialEnd?: string | null; // copied from the batch
};
type TkBatchDetail = TkBatchLite & { records: TkRecord[] };

type Attendance = { perfect: boolean; issues: string[] };
type TimekeepingLink = {
  status: "idle" | "loading" | "ready" | "none" | "error";
  label: string; // covered dates, e.g. "Oct 16 – Oct 30"
  byEmp: Record<string, Attendance>; // keyed by employee number (id_number)
  otMinByEmp: Record<string, number>; // OT minutes of the chosen cut-off
  tardyMinByEmp: Record<string, number>; // late mins (after grace) of the chosen cut-off
  lwopDaysByEmp: Record<string, number>; // absent weekdays of the chosen cut-off
  leaveDaysByEmp: Record<string, number>; // approved leave weekdays of the chosen cut-off
  halfDaysByEmp: Record<string, number>; // half-day weekdays of the chosen cut-off

  // Mon–Fri of the month that NO submitted batch covers ...
  missingDays: string[];
};
const NO_TIMEKEEPING: TimekeepingLink = {
  status: "idle",
  label: "",
  byEmp: {},
  otMinByEmp: {},
  tardyMinByEmp: {},
  lwopDaysByEmp: {},
  leaveDaysByEmp: {},
  halfDaysByEmp: {},
  missingDays: [],
};

// Saved rows come back from Laravel as strings; blank out zeros so the
// input boxes stay empty instead of showing 0 everywhere.
const fromSaved = (e: PayrollEntryRecord): RowInput => {
  const f = (v: number | string) => (Number(v) ? String(Number(v)) : "");

  return {
    // Keep a saved 0 as "0" so it does not fall back to the auto days.
    days: String(Number(e.days) || 0),
    // Keep a saved 0 as "0" so it does not fall back to the auto OT.
    otHours: String(Number(e.ot_hours) || 0),
    restDayHours: f(e.rest_day_hours),
    // A saved payroll keeps exactly what was saved (not re-computed).
    perfectAttendance: Boolean(e.perfect_attendance),
    earningsAdjustment: f(e.earnings_adjustment),
    tardinessMinutes: String(Number(e.tardiness_minutes) || 0),
    lwopDays: String(Number(e.lwop_days) || 0),
    halfDays: "",
    sssLoan: f(e.sss_loan),
    pagibigLoan: f(e.pagibig_loan),
    deductionAdjustment: f(e.deduction_adjustment),
    // ON/OFF switches are not read from the saved amounts (older saves have
    // 0 there); they are applied on top in getInput().
    sssOn: true,
    philhealthOn: true,
    pagibigOn: true,
  };
};

const emptyRowInput = (): RowInput => ({
  days: "",
  otHours: "",
  restDayHours: "",
  perfectAttendance: null,
  earningsAdjustment: "",
  tardinessMinutes: "",
  lwopDays: "",
  halfDays: "",
  sssLoan: "",
  pagibigLoan: "",
  deductionAdjustment: "",
  sssOn: true,
  philhealthOn: true,
  pagibigOn: true,
});

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

const isActive = (e: Employee) =>
  String(e.status).trim().toLowerCase() === "active";

// Working days of a month (month is 1-12). Mon–Fri, standard is 22 for every
// month (even 31-day ones). Only February is reduced: its Mon–Fri count
// (20, or 21 in a leap year when the 29th is a weekday).
const BASE_WORKING_DAYS = 22;
const workingDaysInMonth = (year: number, month: number): number => {
  if (month !== 2) return BASE_WORKING_DAYS;

  const last = new Date(year, 2, 0).getDate();
  let count = 0;

  for (let d = 1; d <= last; d++) {
    const dow = new Date(year, 1, d).getDay();

    if (dow !== 0 && dow !== 6) count++;
  }

  return count;
};

// Mon–Fri count of the chosen cut-off itself (1-15, or 16 up to the last day
// of the month). Used as the automatic "days worked".
const cutoffWorkingDays = (
  year: number,
  month: number,
  cutoff: Cutoff,
): number => {
  const last = new Date(year, month, 0).getDate();
  const from = cutoff === "1-15" ? 1 : 16;
  const to = cutoff === "1-15" ? 15 : last;
  let count = 0;

  for (let d = from; d <= to; d++) {
    const dow = new Date(year, month - 1, d).getDay();

    if (dow !== 0 && dow !== 6) count++;
  }

  return count;
};

// Label of a cut-off with the REAL last day of the month: 1-15, then
// 16-28 / 16-29 (Feb), 16-30 or 16-31. The internal value stays "16-30"

const lastDayOfMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

const cutoffLabel = (year: number, month: number, c: Cutoff): string =>
  c === "1-15" ? "1-15" : `16-${lastDayOfMonth(year, month)}`;

// ── timekeeping helpers ──
const pad2 = (n: number) => String(n).padStart(2, "0");
const dateOnly = (v: string) => String(v ?? "").slice(0, 10);

// First and last day of the WHOLE MONTH as "yyyy-MM-dd".
// Perfect attendance is judged per month (1st up to the last day), even
// though it is paid on the 16-30 cut-off.
const monthRange = (year: number, month: number) => {
  const last = new Date(year, month, 0).getDate();
  const ym = `${year}-${pad2(month)}`;

  return { start: `${ym}-01`, end: `${ym}-${pad2(last)}` };
};

// Every Mon–Fri of the whole month as "yyyy-MM-dd".
const monthWeekdays = (year: number, month: number): string[] => {
  const { start, end } = monthRange(year, month);
  const from = Number(start.slice(8, 10));
  const to = Number(end.slice(8, 10));
  const list: string[] = [];

  for (let d = from; d <= to; d++) {
    const dow = new Date(year, month - 1, d).getDay();

    if (dow !== 0 && dow !== 6) {
      list.push(`${year}-${pad2(month)}-${pad2(d)}`);
    }
  }

  return list;
};

// "2026-10-22" -> "10/22"
const shortMd = (iso: string) => {
  const [, m, d] = iso.split("-");

  return `${Number(m)}/${Number(d)}`;
};

// "2026-10-16" -> "Oct 16"
const fmtShortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

async function timekeepingFetch<T>(url: string): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("adminSessionActive")
      : null;
  const headers = new Headers();

  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { cache: "no-store", headers });
  const raw = await response.text();
  let data: any = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error("The server returned an unexpected response.");
  }

  if (!response.ok) {
    throw new Error(data?.message || `Request failed (${response.status}).`);
  }

  return data as T;
}

// Who has a perfect attendance in the cut-off? An employee is perfect only if
// EVERY Mon–Fri has a record that is a full present day:
//   - not on leave
//   - no_of_days = 1 (a half day, or missing punches = 0, breaks it)
//   - no late deduction (lateness inside the grace period is still fine)
// A weekday with no record at all also breaks it.
function evaluateAttendance(
  records: TkRecord[],
  weekdays: string[],
): Record<string, Attendance> {
  // employee -> date -> record (a later batch replaces an earlier one)
  const byEmp = new Map<string, Map<string, TkRecord>>();

  records.forEach((r) => {
    const emp = String(r.employee_number ?? "").trim();

    if (!emp) return;
    if (!byEmp.has(emp)) byEmp.set(emp, new Map());
    byEmp.get(emp)!.set(dateOnly(r.date), r);
  });

  const out: Record<string, Attendance> = {};

  byEmp.forEach((byDate, emp) => {
    const issues: string[] = [];

    for (const date of weekdays) {
      const r = byDate.get(date);
      const md = shortMd(date);

      if (!r) {
        issues.push(`${md} no record`);
      } else if (truthy(r.is_leave)) {
        issues.push(`${md} leave`);
      } else if (num(r.no_of_days) <= 0) {
        issues.push(`${md} absent / incomplete punches`);
      } else if (num(r.no_of_days) < 1) {
        issues.push(`${md} half day`);
      } else if (num(r.grace_deduction) > 0) {
        issues.push(`${md} late ${num(r.grace_deduction)} mins`);
      }
    }

    out[emp] = { perfect: issues.length === 0, issues };
  });

  return out;
}

const minutesOfTime = (t: string) =>
  Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// First / last day of the chosen cut-off as "yyyy-MM-dd".
const cutoffDates = (year: number, month: number, cutoff: Cutoff) => {
  const ym = `${year}-${pad2(month)}`;

  return cutoff === "1-15"
    ? { from: `${ym}-01`, to: `${ym}-15` }
    : { from: `${ym}-16`, to: `${ym}-${pad2(lastDayOfMonth(year, month))}` };
};

// OT minutes per employee inside [from, to]:
// Time Out after the official end (default 5:00 PM) on a full Mon–Fri day.
// Skipped: leave, half day / incomplete (no_of_days < 1), auto-filled time out.
// OT minutes per employee inside [from, to]: the APPROVED overtime that was
// submitted in Timekeeping (overtime_minutes, filed in "My Overtime").
// Mon–Fri only (weekend OT is typed in "Rest day"). Skipped: leave days.
function evaluateOvertime(
  records: TkRecord[],
  from: string,
  to: string,
): Record<string, number> {
  // a later batch replaces an earlier one for the same employee + date
  const latest = new Map<string, TkRecord>();

  records.forEach((r) => {
    const emp = String(r.employee_number ?? "").trim();

    if (emp) latest.set(`${emp}|${dateOnly(r.date)}`, r);
  });

  const out: Record<string, number> = {};

  latest.forEach((r, key) => {
    const [emp, date] = key.split("|");
    const dow = new Date(`${date}T00:00:00`).getDay();

    if (date < from || date > to || dow === 0 || dow === 6) return;
    if (truthy(r.is_leave)) return;

    const mins = num(r.overtime_minutes);

    if (mins > 0) out[emp] = (out[emp] ?? 0) + mins;
  });

  return out;
}
// Late minutes per employee inside [from, to], taken from the Timekeeping
// column "w/ 5 mins. grace" (grace_deduction = mins late minus the grace).
// Skipped: leave days. A later batch replaces an earlier one (same employee + date).
function evaluateTardiness(
  records: TkRecord[],
  from: string,
  to: string,
): Record<string, number> {
  const latest = new Map<string, TkRecord>();

  records.forEach((r) => {
    const emp = String(r.employee_number ?? "").trim();

    if (emp) latest.set(`${emp}|${dateOnly(r.date)}`, r);
  });

  const out: Record<string, number> = {};

  latest.forEach((r, key) => {
    const [emp, date] = key.split("|");

    if (date < from || date > to) return;
    if (truthy(r.is_leave)) return;

    const mins = num(r.grace_deduction);

    if (mins > 0) out[emp] = (out[emp] ?? 0) + mins;
  });

  return out;
}
// LWOP days per employee inside [from, to]: a Mon–Fri with a timekeeping record
// that is NOT on approved leave and has 0 days (no punches / incomplete punches).
// A later batch replaces an earlier one (same employee + date).
function evaluateLwop(
  records: TkRecord[],
  from: string,
  to: string,
): Record<string, number> {
  const latest = new Map<string, TkRecord>();

  records.forEach((r) => {
    const emp = String(r.employee_number ?? "").trim();

    if (emp) latest.set(`${emp}|${dateOnly(r.date)}`, r);
  });

  const out: Record<string, number> = {};

  latest.forEach((r, key) => {
    const [emp, date] = key.split("|");
    const dow = new Date(`${date}T00:00:00`).getDay();

    if (date < from || date > to || dow === 0 || dow === 6) return;
    if (truthy(r.is_leave)) return;

    if (num(r.no_of_days) <= 0) out[emp] = (out[emp] ?? 0) + 1;
  });

  return out;
}
// Approved leave days (is_leave) per employee inside [from, to], Mon–Fri only.
// A later batch replaces an earlier one (same employee + date).
function evaluateLeave(
  records: TkRecord[],
  from: string,
  to: string,
): Record<string, number> {
  const latest = new Map<string, TkRecord>();

  records.forEach((r) => {
    const emp = String(r.employee_number ?? "").trim();

    if (emp) latest.set(`${emp}|${dateOnly(r.date)}`, r);
  });

  const out: Record<string, number> = {};

  latest.forEach((r, key) => {
    const [emp, date] = key.split("|");
    const dow = new Date(`${date}T00:00:00`).getDay();

    if (date < from || date > to || dow === 0 || dow === 6) return;
    if (truthy(r.is_leave)) out[emp] = (out[emp] ?? 0) + 1;
  });

  return out;
}
// Half days per employee inside [from, to], Mon–Fri only: a record that is
// not on leave and has 0 < no_of_days < 1. They don't earn meal allowance.
function evaluateHalfDays(
  records: TkRecord[],
  from: string,
  to: string,
): Record<string, number> {
  const latest = new Map<string, TkRecord>();

  records.forEach((r) => {
    const emp = String(r.employee_number ?? "").trim();

    if (emp) latest.set(`${emp}|${dateOnly(r.date)}`, r);
  });

  const out: Record<string, number> = {};

  latest.forEach((r, key) => {
    const [emp, date] = key.split("|");
    const dow = new Date(`${date}T00:00:00`).getDay();

    if (date < from || date > to || dow === 0 || dow === 6) return;
    if (truthy(r.is_leave)) return;

    const d = num(r.no_of_days);

    if (d > 0 && d < 1) out[emp] = (out[emp] ?? 0) + 1;
  });

  return out;
}
// rendered OT = hours + (minutes / 60)
const renderedOtHours = (totalMins: number): number =>
  round2(Math.floor(totalMins / 60) + (totalMins % 60) / 60);

const fmtHm = (mins: number) => `${Math.floor(mins / 60)}h ${mins % 60}m`;

// "De Castro, Justin Mangubat" — same format as the payroll sheet.
const getPayrollName = (e: Employee) => {
  const x = e as any;
  const given = [x.first_name, x.middle_name, x.suffix]
    .filter(Boolean)
    .join(" ");

  return [x.last_name, given].filter(Boolean).join(", ") || "—";
};

// Employees hidden from payroll (the owner). They are not shown, not saved
// and get no payslip. Nothing is deleted from the masterfile.
const HIDDEN_EMPLOYEES = ["sarmiento, angelle samson"];

const isHidden = (e: Employee) =>
  HIDDEN_EMPLOYEES.includes(getPayrollName(e).trim().toLowerCase());
const LEGACY_FIXED_EMPLOYEES = ["hanna kaye", "de guia"];

const isFixed = (e: Employee): boolean => {
  if (truthy((e as any).is_fixed)) return true;

  const name = getPayrollName(e).toLowerCase();

  return LEGACY_FIXED_EMPLOYEES.every((part) => name.includes(part));
};
// Finds an allowance in the masterfile's allowances[] by label, e.g. "meal", "load".
const findAllowance = (e: Employee, keyword: string): number => {
  const list = (e.allowances ?? []) as { label: string; amount: unknown }[];
  const match = list.find((a) =>
    String(a.label ?? "")
      .toLowerCase()
      .includes(keyword),
  );

  return match ? num(match.amount) : 0;
};

const isSuperAdminRole = (value: unknown): boolean =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "") === "superadmin";

const truthy = (v: unknown) =>
  v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";

const looksSuperAdmin = (obj: any): boolean => {
  if (!obj || typeof obj !== "object") return false;

  if (
    truthy(obj.is_superadmin) ||
    truthy(obj.isSuperadmin) ||
    truthy(obj.isSuperAdmin) ||
    truthy(obj.superadmin)
  ) {
    return true;
  }

  if (isSuperAdminRole(obj.role)) return true;

  return (
    looksSuperAdmin(obj.user) ||
    looksSuperAdmin(obj.account) ||
    looksSuperAdmin(obj.data)
  );
};

const detectSuperAdmin = (): boolean => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (!key) continue;

      const raw = localStorage.getItem(key);

      if (!raw) continue;

      if (/role/i.test(key) && isSuperAdminRole(raw)) return true;

      try {
        if (looksSuperAdmin(JSON.parse(raw))) return true;
      } catch {}
    }
  } catch {}

  return false;
};

// ── the whole computation for one employee ──
function computeRow(
  employee: Employee,
  input: RowInput,
  cutoff: Cutoff,
  workingDays: number,
  absentDays = 0, // absent + 0.5 per half day, already removed from "days"
  halfRemoved = 0, // the 0.5-per-half-day part of absentDays
) {
  const monthlyRate = num(employee.salary);
  // Fetched only. Not a separate earning: it is part of the daily rate.
  const deMinimis = num((employee as any).de_minimis);
  // SSS bracket basis = monthly rate + de minimis
  const sssBase = monthlyRate + deMinimis;
  const divisor = workingDays > 0 ? workingDays : 22;

  const dailyRate = round2((monthlyRate + deMinimis) / divisor);
  const hourlyRate = dailyRate / HOURS_PER_DAY;

  const days = num(input.days);
  // Semi-monthly: half of (monthly rate + de minimis). Not multiplied by days
  // worked; absences are deducted through LWOP.
  const basicPay = round2((monthlyRate + deMinimis) / 2);

  const mealRate = findAllowance(employee, "meal");
  // Meal allowance is only for days actually present. Absent days and leave
  // days that are deducted as LWOP don't get it. Half days don't earn it:
  // 9.5 days -> 9 meal days.
  const unpaidLeave = Math.max(0, num(input.lwopDays) - absentDays);
  const mealDays = Math.max(
    0,
    Math.floor(days - unpaidLeave - num(input.halfDays) + halfRemoved),
  );
  const mealAllowance = round2(mealDays * mealRate);
  // Fetched from the masterfile, 1st cut-off (1-15) only.
  const loadAllowance = cutoff === "1-15" ? findAllowance(employee, "load") : 0;

  // hourly × 125% × rendered OT (hours + minutes / 60)
  const overtime = round2(hourlyRate * OT_MULTIPLIER * num(input.otHours));

  const rdHours = num(input.restDayHours);
  const restDay = round2(
    rdHours <= HOURS_PER_DAY
      ? rdHours * hourlyRate * REST_DAY_MULTIPLIER
      : HOURS_PER_DAY * hourlyRate * REST_DAY_MULTIPLIER +
          (rdHours - HOURS_PER_DAY) * hourlyRate * REST_DAY_EXCESS_MULTIPLIER,
  );

  const perfectAttendance =
    cutoff === "16-30" && input.perfectAttendance
      ? PERFECT_ATTENDANCE_AMOUNT
      : 0;
  const earningsAdjustment = num(input.earningsAdjustment);

  const grossIncome = round2(
    basicPay +
      mealAllowance +
      loadAllowance +
      overtime +
      restDay +
      perfectAttendance +
      earningsAdjustment,
  );

  const tardiness = round2(hourlyRate * (num(input.tardinessMinutes) / 60));
  const lwop = round2(dailyRate * num(input.lwopDays));

  // Automatic contributions.
  //   SSS                     -> 2nd cut-off (16-30), based on monthly rate + de minimis
  //   PhilHealth + Pag-IBIG   -> 1st cut-off (1-15), based on monthly rate
  // Each one can be switched off per employee with its toggle.
  const sss = cutoff === "16-30" && input.sssOn ? sssEmployeeShare(sssBase) : 0;
  const philhealth =
    cutoff === "1-15" && input.philhealthOn
      ? philhealthEmployeeShare(sssBase)
      : 0;
  const pagibig =
    cutoff === "1-15" && input.pagibigOn && monthlyRate > 0
      ? PAGIBIG_AMOUNT
      : 0;

  // Still typed in manually.
  const sssLoan = num(input.sssLoan);
  const pagibigLoan = num(input.pagibigLoan);
  const deductionAdjustment = num(input.deductionAdjustment);

  const totalDeduction = round2(
    tardiness +
      lwop +
      sss +
      pagibig +
      philhealth +
      sssLoan +
      pagibigLoan +
      deductionAdjustment,
  );

  return {
    monthlyRate,
    deMinimis,
    sssBase,
    divisor,
    dailyRate,
    hourlyRate,
    basicPay,
    mealRate,
    mealAllowance,
    loadAllowance,
    overtime,
    restDay,
    perfectAttendance,
    earningsAdjustment,
    grossIncome,
    tardiness,
    lwop,
    sss,
    pagibig,
    philhealth,
    sssLoan,
    pagibigLoan,
    deductionAdjustment,
    totalDeduction,
    netPay: round2(grossIncome - totalDeduction),
  };
}

type Computed = ReturnType<typeof computeRow>;

// ── builds the data the payslip image needs ──
function toPayslip(
  employee: Employee,
  input: RowInput,
  r: Computed,
  month: number,
  year: number,
  cutoff: Cutoff,
  absentDays = 0,
  halfRemoved = 0,
): PayslipData {
  const days = num(input.days);
  const unpaidLeave = Math.max(0, num(input.lwopDays) - absentDays);

  return {
    idNumber: String(employee.id_number ?? ""),
    name: getPayrollName(employee),
    month,
    year,
    cutoff,
    days,
    mealDays: Math.max(
      0,
      Math.floor(days - unpaidLeave - num(input.halfDays) + halfRemoved),
    ),
    mealRate: r.mealRate,
    dailyRate: r.dailyRate,
    otHours: num(input.otHours),
    restDayHours: num(input.restDayHours),
    tardinessMinutes: num(input.tardinessMinutes),
    lwopDays: num(input.lwopDays),
    basicPay: r.basicPay,
    // De minimis is already inside the daily rate / basic pay.
    deMinimis: 0,
    overtime: r.overtime,
    restDay: r.restDay,
    mealAllowance: r.mealAllowance,
    loadAllowance: r.loadAllowance,
    perfectAttendance: r.perfectAttendance,
    earningsAdjustment: r.earningsAdjustment,
    grossIncome: r.grossIncome,
    tardiness: r.tardiness,
    lwop: r.lwop,
    sss: r.sss,
    pagibig: r.pagibig,
    philhealth: r.philhealth,
    sssLoan: r.sssLoan,
    pagibigLoan: r.pagibigLoan,
    deductionAdjustment: r.deductionAdjustment,
    totalDeduction: r.totalDeduction,
    netPay: r.netPay,
  };
}

function Field({
  label,
  hint,
  value,
  onChange,
  signed,
  max,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  signed?: boolean;
  max?: number;
}) {
  const locked = useContext(LockedContext);

  return (
    <label className="block">
      <span className="mb-1 flex items-center text-xs font-medium text-slate-600">
        {label}
        {hint && (
          <span className="ml-1 font-normal text-slate-400">{hint}</span>
        )}
        {locked && <Lock className="ml-1.5 h-3 w-3 text-slate-400" />}
      </span>
      <Input
        className={`h-10 text-right tabular-nums ${
          locked
            ? "cursor-not-allowed border-dashed bg-slate-50 text-slate-900 focus-visible:ring-0"
            : ""
        }`}
        inputMode="decimal"
        max={max}
        min={signed ? undefined : 0}
        readOnly={locked}
        step="any"
        type="number"
        value={value}
        onChange={(e) => {
          if (locked) return;

          const v = e.target.value;

          // Typing above the max is capped at the max.
          onChange(max !== undefined && num(v) > max ? String(max) : v);
        }}
        onClick={
          locked
            ? () =>
                toast("Locked. Use Override to edit.", {
                  id: "payroll-locked",
                  icon: "🔒",
                })
            : undefined
        }
      />
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1 text-sm ${
        strong ? "border-t border-slate-300 pt-2 font-bold" : "text-slate-700"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
      {children}
    </h3>
  );
}

// Simple centered modal used by the override dialogs.
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            aria-label="Close"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            type="button"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
      </div>
    </div>
  );
}

// ── contribution form pieces ──
// Only http(s) links are made clickable.
const normalizeLink = (raw: string): string => {
  const v = raw.trim();

  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return "";

  return `https://${v}`;
};

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-blue-600" : "bg-slate-300"
      }`}
      disabled={disabled}
      role="switch"
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const CONTRIB_NAV: { key: ContribKind; label: string }[] = [
  { key: "sss", label: "SSS" },
  { key: "philhealth", label: "PhilHealth" },
  { key: "pagibig", label: "PAG-IBIG" },
];

// The company SSS table. The employee's bracket is highlighted and scrolled to.
function SssTable({ activeIndex }: { activeIndex: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const row = rowRef.current;

    if (box && row) box.scrollTop = Math.max(0, row.offsetTop - 90);
  }, [activeIndex]);

  const head =
    "whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center text-[10px] font-bold text-slate-800";
  const cell = "whitespace-nowrap border border-slate-200 px-2 py-1 text-right";

  return (
    <div
      ref={boxRef}
      className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-200"
    >
      <table className="w-max min-w-full border-collapse text-[11px] tabular-nums text-slate-800">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className={`${head} bg-slate-200`} rowSpan={2}>
              RANGE OF COMPENSATION
            </th>
            <th className={`${head} bg-amber-100`} colSpan={3}>
              MONTHLY SALARY CREDIT
            </th>
            <th className={`${head} bg-slate-100`} colSpan={4}>
              EMPLOYER
            </th>
            <th className={`${head} bg-cyan-100`} colSpan={3}>
              EMPLOYEE
            </th>
            <th className={`${head} bg-slate-200`} rowSpan={2}>
              TOTAL
            </th>
          </tr>
          <tr>
            {[
              "REGULAR SS",
              "MPF",
              "TOTAL",
              "REGULAR SS",
              "MPF",
              "EC",
              "TOTAL",
              "REGULAR SS",
              "MPF",
              "TOTAL",
            ].map((h, i) => (
              <th
                key={i}
                className={`${head} ${
                  i < 3 ? "bg-amber-50" : i < 7 ? "bg-slate-50" : "bg-cyan-50"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SSS_ROWS.map((row, i) => {
            const active = i === activeIndex;

            return (
              <tr
                key={row.label}
                ref={active ? rowRef : undefined}
                className={active ? "bg-yellow-200 font-bold" : ""}
              >
                <td className="whitespace-nowrap border border-slate-200 px-2 py-1 text-left">
                  {row.label}
                </td>
                <td className={cell}>{money(row.msc.regular, true)}</td>
                <td className={cell}>{money(row.msc.mpf, true)}</td>
                <td className={cell}>{money(row.msc.total, true)}</td>
                <td className={cell}>{money(row.er.regular, true)}</td>
                <td className={cell}>{money(row.er.mpf, true)}</td>
                <td className={cell}>{money(row.er.ec, true)}</td>
                <td className={cell}>{money(row.er.total, true)}</td>
                <td className={cell}>{money(row.ee.regular, true)}</td>
                <td className={cell}>{money(row.ee.mpf, true)}</td>
                <td className={cell}>{money(row.ee.total, true)}</td>
                <td className={cell}>{money(row.grand, true)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// The company PhilHealth table. The employee's bracket is highlighted.
function PhilhealthTable({ activeIndex }: { activeIndex: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const row = rowRef.current;

    if (box && row) box.scrollTop = Math.max(0, row.offsetTop - 60);
  }, [activeIndex]);

  const head =
    "whitespace-nowrap border border-slate-300 bg-slate-200 px-2 py-1.5 text-center text-[10px] font-bold text-slate-800";
  const cell = "whitespace-nowrap border border-slate-200 px-2 py-1 text-right";

  return (
    <div
      ref={boxRef}
      className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-200"
    >
      <table className="w-max min-w-full border-collapse text-[11px] tabular-nums text-slate-800">
        <thead className="sticky top-0 z-10">
          <tr>
            {[
              "SALARY BRACKET",
              "SALARY RANGE",
              "SALARY BASE",
              "TOTAL MONTHLY PREMIUM",
              "EMPLOYEE SHARE",
              "EMPLOYER SHARE",
            ].map((h) => (
              <th key={h} className={head}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PH_ROWS.map((row, i) => {
            const active = i === activeIndex;

            return (
              <tr
                key={row.bracket}
                ref={active ? rowRef : undefined}
                className={active ? "bg-yellow-200 font-bold" : ""}
              >
                <td className="border border-slate-200 px-2 py-1 text-center">
                  {row.bracket}
                </td>
                <td className="whitespace-nowrap border border-slate-200 px-2 py-1 text-left">
                  {row.label}
                </td>
                <td className={cell}>{money(row.base)}</td>
                <td className={cell}>{money(row.premium)}</td>
                <td className={cell}>{money(row.employee)}</td>
                <td className={cell}>{money(row.employer)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Navigation (SSS / PhilHealth / PAG-IBIG) that shows the data behind each
// contribution for the selected employee, plus an ON/OFF switch.
function ContributionPanel({
  kind,
  onKind,
  cutoff,
  monthlyRate,
  sssBase,
  amounts,
  on,
  onToggle,
  locked,
}: {
  kind: ContribKind;
  onKind: (k: ContribKind) => void;
  cutoff: Cutoff;
  monthlyRate: number;
  sssBase: number;
  amounts: Record<ContribKind, number>;
  on: Record<ContribKind, boolean>;
  onToggle: (k: ContribKind, v: boolean) => void;
  locked: boolean;
}) {
  const appliesCutoff: Cutoff = kind === "sss" ? "16-30" : "1-15";
  const applies = cutoff === appliesCutoff;

  // SSS bracket uses monthly rate + de minimis.
  const sssIdx = sssRowIndex(sssBase);
  const sssRow = sssIdx >= 0 ? SSS_ROWS[sssIdx] : null;

  // PhilHealth stays on the monthly rate.
  const phIdx = phRowIndex(sssBase);
  const phRow = phIdx >= 0 ? PH_ROWS[phIdx] : null;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
          {CONTRIB_NAV.map((n) => (
            <Button
              key={n.key}
              className={`h-9 rounded-none px-4 shadow-none ${
                kind === n.key
                  ? "bg-slate-800 text-white hover:bg-slate-900"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
              type="button"
              variant="ghost"
              onClick={() => onKind(n.key)}
            >
              {n.label}
            </Button>
          ))}
        </div>

        <p className="text-xs text-slate-500">
          Deducted on {appliesCutoff} ·{" "}
          <span className="font-semibold text-slate-900">
            {applies
              ? on[kind]
                ? `₱${money(amounts[kind])}`
                : "Off"
              : "not in this cut-off"}
          </span>
        </p>
      </div>

      {kind === "sss" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ReadOnly
              label="Monthly rate + de minimis"
              value={money(sssBase)}
            />
            <ReadOnly label="Bracket" value={sssRow ? sssRow.label : "—"} />
            <ReadOnly
              label="Monthly salary credit"
              value={sssRow ? money(sssRow.msc.total) : "—"}
            />
            <ReadOnly
              label="Employee Regular SS"
              value={sssRow ? money(sssRow.ee.regular) : "—"}
            />
            <ReadOnly
              label="Employee MPF"
              value={sssRow ? money(sssRow.ee.mpf) : "—"}
            />
            <ReadOnly
              label="Employee total"
              value={sssRow ? money(sssRow.ee.total) : "—"}
            />
          </div>
        </>
      )}

      {kind === "philhealth" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ReadOnly
              label="Monthly rate + de minimis"
              value={money(sssBase)}
            />
            <ReadOnly
              label="Salary bracket"
              value={phRow ? `${phRow.bracket} · ${phRow.label}` : "—"}
            />
            <ReadOnly
              label="Salary base"
              value={phRow ? money(phRow.base) : "—"}
            />
            <ReadOnly
              label="Total monthly premium"
              value={phRow ? money(phRow.premium) : "—"}
            />
            <ReadOnly
              label="Employee share"
              value={phRow ? money(phRow.employee) : "—"}
            />
            <ReadOnly
              label="Employer share"
              value={phRow ? money(phRow.employer) : "—"}
            />
          </div>
        </>
      )}

      {kind === "pagibig" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ReadOnly label="Monthly rate" value={money(monthlyRate)} />
            <ReadOnly
              label="Employee contribution"
              value={money(monthlyRate > 0 ? PAGIBIG_AMOUNT : 0)}
            />
          </div>
          <p className="text-xs text-slate-500">
            Fixed ₱{money(PAGIBIG_AMOUNT)} for everyone.
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <Toggle
            checked={on[kind]}
            disabled={!applies || locked}
            label={`${kind} on/off`}
            onChange={(v) => onToggle(kind, v)}
          />
          Apply to this employee
          {locked ? (
            <span className="text-xs text-slate-400">
              (locked, use Override to edit)
            </span>
          ) : (
            !applies && (
              <span className="text-xs text-slate-400">
                (switch to {appliesCutoff} to change)
              </span>
            )
          )}
        </label>
      </div>
    </div>
  );
}

// ── table view pieces ──
const TH_BASE =
  "whitespace-nowrap border border-slate-300 px-2 py-2 text-center text-[10px] font-bold leading-tight text-slate-800";
const TH_NUM_W = "w-[120px] min-w-[120px]";
const TD_BASE =
  "w-[120px] min-w-[120px] border border-slate-200 px-2 py-1.5 text-right text-xs";

// Table view is read-only (fetching only): these cells just display the
// values entered in the Form. `plain` = show as a plain number, not money.
function NumberCell({
  value,
  plain,
}: {
  value: string;
  plain?: boolean;
  onChange?: (v: string) => void;
}) {
  return (
    <td className={`${TD_BASE} bg-white`}>
      {plain ? num(value) || "—" : money(num(value), true)}
    </td>
  );
}

// Adjustments may be negative (read-only here as well).
function SignedCell({
  value,
}: {
  value: string;
  onChange?: (v: string) => void;
}) {
  return <td className={`${TD_BASE} bg-white`}>{money(num(value), true)}</td>;
}

// ── Contributions tab: the company SSS / PhilHealth tables ──
// The selected employee's bracket (from the Payroll form) is highlighted.
// The source link has its own Save button, separate from "Save payroll".
function ContributionTables({
  employeeName,
  sssBase,
  monthlyRate,
  links,
  onSaveLink,
}: {
  employeeName: string | null;
  sssBase: number;
  monthlyRate: number;
  links: Record<string, ContribLink>;
  onSaveLink: (kind: ContribKind, url: string) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<ContribKind>("sss");

  const saved = links[kind];
  const savedUrl = saved?.url ?? "";

  // What's typed in the box (not saved until the Save button is pressed).
  const [draft, setDraft] = useState(savedUrl);

  // When switching tabs (or after a save), sync the box with what's saved.
  useEffect(() => {
    setDraft(savedUrl);
  }, [kind, savedUrl]);

  const dirty = draft.trim() !== savedUrl;
  // "Open" always opens the SAVED link.
  const href = normalizeLink(savedUrl);
  const updated = formatUpdated(saved?.updatedAt ?? null);

  const sssIdx = sssRowIndex(sssBase);
  const phIdx = phRowIndex(sssBase);

  return (
    <div className="w-full min-w-0 space-y-4 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              {CONTRIB_NAV.map((n) => (
                <Button
                  key={n.key}
                  className={`h-9 rounded-none px-4 shadow-none ${
                    kind === n.key
                      ? "bg-slate-800 text-white hover:bg-slate-900"
                      : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  type="button"
                  variant="ghost"
                  onClick={() => setKind(n.key)}
                >
                  {n.label}
                </Button>
              ))}
            </div>

            {employeeName && kind !== "pagibig" && (
              <p className="text-xs text-slate-500">
                Highlighted bracket:{" "}
                <span className="font-semibold text-slate-900">
                  {employeeName}
                </span>
              </p>
            )}
          </div>

          {/* Source link: for reference only. Has its own Save, it is NOT
              part of "Save payroll". */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Source link"
                className="h-9 max-w-xl flex-1 text-sm"
                placeholder="Source link (optional): where you saw this data"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && dirty) onSaveLink(kind, draft);
                }}
              />
              <Button
                className="h-9 bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                disabled={!dirty}
                type="button"
                onClick={() => onSaveLink(kind, draft)}
              >
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
              {href && (
                <a
                  className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
                  href={href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open
                </a>
              )}
            </div>

            <p className="text-xs text-slate-500">
              {dirty ? (
                <span className="text-amber-600">
                  Unsaved changes. Click Save.
                </span>
              ) : updated ? (
                <>
                  Last updated:{" "}
                  <span className="font-medium text-slate-700">{updated}</span>
                </>
              ) : savedUrl ? (
                "Saved (no date yet)."
              ) : (
                "No link saved yet."
              )}
            </p>
          </div>

          {kind === "sss" && <SssTable activeIndex={sssIdx} />}

          {kind === "philhealth" && <PhilhealthTable activeIndex={phIdx} />}

          {kind === "pagibig" && (
            <p className="text-sm text-slate-600">
              Pag-IBIG is a fixed ₱{money(PAGIBIG_AMOUNT)} for everyone.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function PayrollPage() {
  const router = useRouter();
  const requestIdRef = useRef(0);

  const today = new Date();
  const searchParams = useSearchParams();
  const tab: Tab =
    TABS.find((t) => t.key === searchParams.get("tab"))?.key ?? "payroll";
  const setTab = (t: Tab) =>
    router.replace(
      t === "payroll" ? "/admin/payroll" : `/admin/payroll?tab=${t}`,
    );
  const [view, setView] = useState<View>("form");
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [cutoff, setCutoff] = useState<Cutoff>(
    today.getDate() <= 15 ? "1-15" : "16-30",
  );

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Payslips generated after a successful save.
  const [payslips, setPayslips] = useState<PayslipData[]>([]);
  const [preview, setPreview] = useState<string | null>(null);

  // Inputs are kept per period, so switching cut-offs doesn't wipe your work.
  const [inputs, setInputs] = useState<Record<string, RowInput>>({});

  // Table view: employees ticked with the checkbox (for export + total).
  const [checkedIds, setCheckedIds] = useState<number[]>([]);

  // Attendance + OT read from the submitted timekeeping.
  const [tk, setTk] = useState<TimekeepingLink>(NO_TIMEKEEPING);

  // ── final save / override ──
  const [superAdmin, setSuperAdmin] = useState(false);
  // Period is locked once it has been saved.
  const [lockedMap, setLockedMap] = useState<Record<string, boolean>>({});
  // Periods that were overridden (stay unlocked until saved again).
  const overriddenRef = useRef<Record<string, boolean>>({});
  // False while the saved payroll of the chosen period is still loading.
  const [periodReady, setPeriodReady] = useState(false);
  const [savedEntries, setSavedEntries] = useState<PayrollEntryRecord[]>([]);
  const savedIds = useMemo(
    () => savedEntries.map((s) => Number(s.employee_id)),
    [savedEntries],
  );
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overridePassword, setOverridePassword] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overriding, setOverriding] = useState(false);

  const [codeOpen, setCodeOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (detectSuperAdmin()) setSuperAdmin(true);

    let cancelled = false;

    (async () => {
      try {
        const session = await fetchAdminSession();

        if (!cancelled && looksSuperAdmin(session)) setSuperAdmin(true);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const [links, setLinks] = useState<Record<string, ContribLink>>({});
  const [contribTab, setContribTab] = useState<ContribKind>("sss");

  // Show the contribution that applies to the chosen cut-off:
  // 1-15 -> PhilHealth (and Pag-IBIG), 16-30 / 31 -> SSS.
  useEffect(() => {
    setContribTab(cutoff === "16-30" ? "sss" : "philhealth");
  }, [cutoff]);

  const [offs, setOffs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONTRIB_OFF_KEY);

      if (raw) setOffs(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchContributionLinks();
        const next: Record<string, ContribLink> = {};

        for (const [k, v] of Object.entries(data)) {
          next[k] = { url: v.url ?? "", updatedAt: v.updated_at ?? null };
        }
        setLinks(next);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load source links",
        );
      }
    })();
  }, []);

  const saveLink = async (kind: ContribKind, url: string) => {
    try {
      const saved = await saveContributionLink(kind, url.trim());

      setLinks((prev) => ({
        ...prev,
        [kind]: { url: saved.url ?? "", updatedAt: saved.updated_at ?? null },
      }));
      toast.success("Source link saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save source link",
      );
    }
  };

  const cutoffText = cutoffLabel(year, month, cutoff);

  // Period label exactly as on the sheet: mm/dd-dd  →  "10/1-15", "10/16-31"
  const period = `${month}/${cutoffText}`;
  // Key stays based on the internal cut-off value ("16-30"), so saved inputs
  // and the ON/OFF contribution toggles are not lost.
  const periodKey = `${year}-${month}/${cutoff}`;

  // Working days of the whole month (daily rate divisor). Detected
  // automatically from the chosen month (and leap years for Feb).
  const workingDays = workingDaysInMonth(year, month);

  // Working days of the CHOSEN cut-off. Changes when the 1-15 / 16-30 button
  // is clicked or the month / year changes. Used as the automatic days worked.
  const cutoffDays = cutoffWorkingDays(year, month, cutoff);

  const locked = Boolean(lockedMap[periodKey]);
  // Inputs are not editable while locked, or while the saved data is loading.
  const readOnly = locked || !periodReady;

  // ── auth + fetch (same pattern as the masterfile page) ──
  useEffect(() => {
    if (!localStorage.getItem("adminSessionActive")) {
      router.push("/admin/login");
    }
  }, [router]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    (async () => {
      try {
        // Goes through the "payroll" permission, so Accounting doesn't need
        // Employee Masterfile access to open this page.
        const list = await fetchPayrollEmployees<Employee>();

        if (requestId !== requestIdRef.current) return;
        setEmployees(list);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load employee records",
        );
        setEmployees([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    })();
  }, []);

  // Load whatever was already saved for this period. A period that has saved
  // rows is locked (final save) unless it was overridden.
  useEffect(() => {
    let cancelled = false;
    const key = periodKey;

    setPeriodReady(false);
    setSavedEntries([]);

    (async () => {
      try {
        const saved = await fetchPayroll(year, month, cutoff);

        if (cancelled) return;
        setSavedEntries(saved);
        setInputs((prev) => {
          const next = { ...prev };

          for (const entry of saved) {
            next[`${key}:${entry.employee_id}`] = fromSaved(entry);
          }

          return next;
        });
        setLockedMap((prev) => ({
          ...prev,
          [key]: saved.length > 0 && !overriddenRef.current[key],
        }));
      } catch (error) {
        if (cancelled) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load saved payroll",
        );
      } finally {
        if (!cancelled) setPeriodReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [year, month, cutoff]);

  useEffect(() => {
    if (tab !== "payroll" && tab !== "payslip") return;

    let cancelled = false;

    setTk({
      status: "loading",
      label: "",
      byEmp: {},
      otMinByEmp: {},
      tardyMinByEmp: {},
      leaveDaysByEmp: {},
      lwopDaysByEmp: {},
      halfDaysByEmp: {},
      missingDays: [],
    });

    (async () => {
      try {
        const { start, end } = monthRange(year, month);
        const weekdays = monthWeekdays(year, month);
        const list = await timekeepingFetch<{ data: TkBatchLite[] }>(
          TIMEKEEPING_URL,
        );

        const matching = (list.data ?? [])
          .filter(
            (b) =>
              dateOnly(b.start_date) <= end && dateOnly(b.end_date) >= start,
          )
          .sort((a, b) => a.id - b.id);

        if (matching.length === 0) {
          if (!cancelled) {
            setTk({
              status: "none",
              label: "",
              byEmp: {},
              otMinByEmp: {},
              tardyMinByEmp: {},
              leaveDaysByEmp: {},
              lwopDaysByEmp: {},
              halfDaysByEmp: {},
              missingDays: [],
            });
          }

          return;
        }

        const details = await Promise.all(
          matching.map((b) =>
            timekeepingFetch<{ data: TkBatchDetail }>(
              `${TIMEKEEPING_URL}/${b.id}`,
            ),
          ),
        );

        if (cancelled) return;

        const records = details.flatMap((d) =>
          (d.data?.records ?? []).map((r) => ({
            ...r,
            _officialEnd: d.data.official_end,
          })),
        );
        const { from, to } = cutoffDates(year, month, cutoff);
        const first = matching
          .map((b) => dateOnly(b.start_date))
          .reduce((m, v) => (v < m ? v : m));
        const last = matching
          .map((b) => dateOnly(b.end_date))
          .reduce((m, v) => (v > m ? v : m));

        // Mon–Fri of the month that no submitted batch covers at all (for
        // example the 1-15 timekeeping was never submitted).
        const missingDays = weekdays.filter(
          (d) =>
            !matching.some(
              (b) => dateOnly(b.start_date) <= d && dateOnly(b.end_date) >= d,
            ),
        );

        setTk({
          status: "ready",
          label: `${fmtShortDate(first)} – ${fmtShortDate(last)}`,
          byEmp: evaluateAttendance(records, weekdays),
          otMinByEmp: evaluateOvertime(records, from, to),
          tardyMinByEmp: evaluateTardiness(records, from, to),
          lwopDaysByEmp: evaluateLwop(records, from, to),
          leaveDaysByEmp: evaluateLeave(records, from, to),
          halfDaysByEmp: evaluateHalfDays(records, from, to),
          missingDays,
        });
      } catch {
        if (!cancelled) {
          setTk({
            status: "error",
            label: "",
            byEmp: {},
            otMinByEmp: {},
            tardyMinByEmp: {},
            lwopDaysByEmp: {},
            leaveDaysByEmp: {},
            halfDaysByEmp: {},
            missingDays: [],
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [year, month, cutoff, tab]);

  const periodEnd = cutoffDates(year, month, cutoff).to;

  // Sino ang dapat lumabas sa period na ito
  const inPeriod = (e: Employee): boolean => {
    if (isHidden(e)) return false;
    if (savedIds.includes(e.id)) return true; // may saved entry na (kahit Resigned)
    if (locked || savedIds.length > 0) return false; // final saved: saved rows lang
    const hired = String((e as any).date_hired ?? "").slice(0, 10);

    return isActive(e) && (!hired || hired <= periodEnd);
  };

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return employees
      .filter(inPeriod)
      .filter(
        (e) =>
          !q ||
          getPayrollName(e).toLowerCase().includes(q) ||
          String(e.id_number ?? "")
            .toLowerCase()
            .includes(q),
      )
      .slice()
      .sort((a, b) =>
        String(a.id_number ?? "").localeCompare(
          String(b.id_number ?? ""),
          undefined,
          { numeric: true, sensitivity: "base" },
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, searchQuery, savedIds, locked, periodEnd]);

  // What the timekeeping says about one employee (matched by ID number).
  const attendanceOf = (employee: Employee): Attendance | undefined =>
    tk.byEmp[String(employee.id_number ?? "").trim()];

  // Perfect attendance decided automatically from the timekeeping.
  const autoPerfect = (employee: Employee): boolean =>
    !isFixed(employee) &&
    cutoff === "16-30" &&
    tk.status === "ready" &&
    Boolean(attendanceOf(employee)?.perfect);

  // OT minutes (Time Out after 5 PM) of the chosen cut-off, from timekeeping.
  const autoOtMins = (employee: Employee): number =>
    !isFixed(employee) && tk.status === "ready"
      ? (tk.otMinByEmp[String(employee.id_number ?? "").trim()] ?? 0)
      : 0;

  // Rendered OT = hours + (minutes / 60).
  const autoOtHours = (employee: Employee): number =>
    renderedOtHours(autoOtMins(employee));
  // Late minutes (w/ grace) of the chosen cut-off, from timekeeping.
  const autoTardyMins = (employee: Employee): number =>
    !isFixed(employee) && tk.status === "ready"
      ? (tk.tardyMinByEmp[String(employee.id_number ?? "").trim()] ?? 0)
      : 0;
  const autoLwopDays = (employee: Employee): number =>
    !isFixed(employee) && tk.status === "ready"
      ? (tk.lwopDaysByEmp[String(employee.id_number ?? "").trim()] ?? 0)
      : 0;
  const autoLeaveDays = (employee: Employee): number =>
    !isFixed(employee) && tk.status === "ready"
      ? (tk.leaveDaysByEmp[String(employee.id_number ?? "").trim()] ?? 0)
      : 0;
  const autoHalfDays = (employee: Employee): number =>
    !isFixed(employee) && tk.status === "ready"
      ? (tk.halfDaysByEmp[String(employee.id_number ?? "").trim()] ?? 0)
      : 0;
  // ON = may leave credits pa, so the leave is PAID (not deducted).
  // Default OFF = leave is deducted as LWOP. Stored in the same `offs` map.
  const leavePaidOf = (id: number) =>
    Boolean(offs[`${periodKey}:${id}:leavepaid`]);

  // Auto LWOP = absent days + (leave days only if NO credits).
  const autoLwopTotal = (employee: Employee): number =>
    autoLwopDays(employee) +
    (leavePaidOf(employee.id) ? 0 : autoLeaveDays(employee));

  const setLeavePaid = (id: number, paid: boolean) => {
    if (readOnly) return;

    const key = `${periodKey}:${id}:leavepaid`;

    setOffs((prev) => {
      const next = { ...prev };

      if (paid) next[key] = true;
      else delete next[key];

      try {
        localStorage.setItem(CONTRIB_OFF_KEY, JSON.stringify(next));
      } catch {}

      return next;
    });
  };
  const toggleFixed = async (id: number, value: boolean) => {
    if (readOnly) return;

    const prev = employees;

    // optimistic update
    setEmployees((list) =>
      list.map((e) =>
        e.id === id ? ({ ...e, is_fixed: value } as Employee) : e,
      ),
    );

    try {
      await setEmployeeFixed(id, value);
      toast.success(value ? "Marked as fixed." : "Fixed removed.");
    } catch (error) {
      setEmployees(prev);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update fixed status",
      );
    }
  };
  // True when the checkbox was set by hand (or loaded from a saved payroll).
  const perfectIsManual = (id: number): boolean =>
    inputs[`${periodKey}:${id}`]?.perfectAttendance != null;
  // Auto days = cut-off days − absent − 0.5 per half day (half day is unpaid).
  const autoDays = (employee: Employee): number =>
    Math.max(
      0,
      cutoffDays - autoLwopDays(employee) - 0.5 * autoHalfDays(employee),
    );
  const getInput = (employee: Employee): ResolvedInput => {
    const id = employee.id;
    const base = inputs[`${periodKey}:${id}`] ?? emptyRowInput();

    const resolved: ResolvedInput = {
      ...base,

      days: base.days === "" ? String(autoDays(employee)) : base.days,

      otHours:
        base.otHours === ""
          ? autoOtHours(employee) > 0
            ? String(autoOtHours(employee))
            : ""
          : base.otHours,

      tardinessMinutes:
        base.tardinessMinutes === ""
          ? autoTardyMins(employee) > 0
            ? String(autoTardyMins(employee))
            : ""
          : base.tardinessMinutes,
      lwopDays:
        base.lwopDays === ""
          ? autoLwopTotal(employee) + 0.5 * autoHalfDays(employee) > 0
            ? String(autoLwopTotal(employee) + 0.5 * autoHalfDays(employee))
            : ""
          : base.lwopDays,
      halfDays:
        base.halfDays === ""
          ? autoHalfDays(employee) > 0
            ? String(autoHalfDays(employee))
            : ""
          : base.halfDays,

      perfectAttendance: base.perfectAttendance ?? autoPerfect(employee),
      sssOn: !offs[`${periodKey}:${id}:sss`],
      philhealthOn: !offs[`${periodKey}:${id}:philhealth`],
      pagibigOn: !offs[`${periodKey}:${id}:pagibig`],
    };

    if (isFixed(employee)) {
      return {
        ...resolved,
        days: String(cutoffDays),
        tardinessMinutes: "",
        lwopDays: "",
        halfDays: "",
      };
    }

    return resolved;
  };
  // True if "days" is still the automatic value (blank, or saved = auto).
  const daysAreAuto = (employee: Employee): boolean => {
    const typed = inputs[`${periodKey}:${employee.id}`]?.days ?? "";

    return typed === "" || num(typed) === autoDays(employee);
  };

  // Absent + 0.5 per half day, already removed from "days".
  const absentForMeal = (employee: Employee): number =>
    daysAreAuto(employee)
      ? autoLwopDays(employee) + 0.5 * autoHalfDays(employee)
      : num(getInput(employee).lwopDays);

  // The half-day part of the above.
  const halfRemovedOf = (employee: Employee): number =>
    daysAreAuto(employee) ? 0.5 * autoHalfDays(employee) : 0;
  // Text under the perfect attendance checkbox.
  const perfectHint = (
    employee: Employee,
    manual: boolean,
  ): { text: string; tone: string } => {
    const muted = "text-slate-400";

    if (tk.status === "idle" || tk.status === "loading") {
      return { text: "Checking timekeeping...", tone: muted };
    }
    if (tk.status === "error") {
      return {
        text: "Timekeeping is not available. Set it by hand.",
        tone: muted,
      };
    }
    if (tk.status === "none") {
      return {
        text: "",
        tone: muted,
      };
    }

    // Perfect attendance covers the whole month. If part of the month was
    // never submitted, the auto-check can't be trusted, so say so.
    const gap = tk.missingDays.length
      ? `Timekeeping for ${shortMd(tk.missingDays[0])} – ${shortMd(
          tk.missingDays[tk.missingDays.length - 1],
        )} is not submitted yet (${tk.missingDays.length} weekday${
          tk.missingDays.length === 1 ? "" : "s"
        }). `
      : "";

    const att = attendanceOf(employee);

    if (!att) {
      return {
        text: "No timekeeping record for this employee. Set it by hand.",
        tone: muted,
      };
    }
    if (att.perfect) {
      return {
        text: manual
          ? "Timekeeping says perfect attendance for the month (changed by hand)."
          : "Auto-checked: perfect attendance for the whole month per timekeeping.",
        tone: "text-green-700",
      };
    }

    const real = att.issues.filter((i) => i.indexOf(" no record") === -1);
    const list = gap ? real : att.issues;
    const shown =
      list.slice(0, 4).join(", ") +
      (list.length > 4 ? ` +${list.length - 4} more` : "");

    return {
      text: `${manual ? "Changed by hand. " : ""}${gap}Not perfect per timekeeping${
        shown ? `: ${shown}` : ""
      }.`,
      tone: "text-amber-700",
    };
  };

  const setContribOn = (id: number, kind: ContribKind, on: boolean) => {
    if (readOnly) return;

    const key = `${periodKey}:${id}:${kind}`;

    setOffs((prev) => {
      const next = { ...prev };

      if (on) delete next[key];
      else next[key] = true;

      try {
        localStorage.setItem(CONTRIB_OFF_KEY, JSON.stringify(next));
      } catch {}

      return next;
    });
  };

  const setField = <K extends keyof RowInput>(
    id: number,
    field: K,
    value: RowInput[K],
  ) => {
    if (readOnly) return;

    const key = `${periodKey}:${id}`;

    setInputs((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? emptyRowInput()), [field]: value },
    }));
  };

  // bago
  const computed = rows.map((employee) => {
    const input = getInput(employee);
    let result = computeRow(
      employee,
      input,
      cutoff,
      workingDays,
      absentForMeal(employee),
      halfRemovedOf(employee),
    );

    // Locked: ipakita ang saved na amounts, hindi ang recompute
    const s = locked
      ? savedEntries.find((x) => Number(x.employee_id) === employee.id)
      : undefined;

    if (s) {
      const meal = num(s.meal_allowance);
      const load = num(s.load_allowance);
      const ot = num(s.overtime);
      const rest = num(s.rest_day);
      const perfect = num(s.perfect_attendance_amount);
      const adj = num(s.earnings_adjustment);
      const gross = num(s.gross_income);

      result = {
        ...result,
        monthlyRate: num(s.monthly_rate),
        deMinimis: num(s.other_de_minimis),
        dailyRate: num(s.daily_rate),
        basicPay: round2(gross - meal - load - ot - rest - perfect - adj),
        mealAllowance: meal,
        loadAllowance: load,
        overtime: ot,
        restDay: rest,
        perfectAttendance: perfect,
        earningsAdjustment: adj,
        grossIncome: gross,
        tardiness: num(s.tardiness),
        lwop: num(s.lwop),
        sss: num(s.sss),
        pagibig: num(s.pagibig),
        philhealth: num(s.philhealth),
        sssLoan: num(s.sss_loan),
        pagibigLoan: num(s.pagibig_loan),
        deductionAdjustment: num(s.deduction_adjustment),
        totalDeduction: num(s.total_deduction),
        netPay: num(s.net_pay),
      };
    }

    return { employee, input, result };
  });

  const totals = computed.reduce(
    (acc, { result }) => ({
      gross: acc.gross + result.grossIncome,
      deduction: acc.deduction + result.totalDeduction,
      net: acc.net + result.netPay,
    }),
    { gross: 0, deduction: 0, net: 0 },
  );

  const selectedRows = computed.filter(({ employee }) =>
    checkedIds.includes(employee.id),
  );
  const selectedTotals = selectedRows.reduce(
    (acc, { result }) => ({
      gross: acc.gross + result.grossIncome,
      deduction: acc.deduction + result.totalDeduction,
      net: acc.net + result.netPay,
    }),
    { gross: 0, deduction: 0, net: 0 },
  );
  const allChecked =
    computed.length > 0 && selectedRows.length === computed.length;

  const toggleChecked = (id: number) =>
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleAllChecked = () =>
    setCheckedIds((prev) => {
      const visible = computed.map(({ employee }) => employee.id);

      if (visible.every((id) => prev.includes(id))) {
        return prev.filter((id) => !visible.includes(id));
      }

      return Array.from(new Set([...prev, ...visible]));
    });

  const missingRates = rows.filter((e) => num(e.salary) === 0).length;

  // The employee currently shown in the form (defaults to the first one).
  const selectedIndex = Math.max(
    0,
    computed.findIndex(({ employee }) => employee.id === selectedId),
  );
  const current = computed[selectedIndex];

  const goTo = (index: number) => {
    const target = computed[index];

    if (target) setSelectedId(target.employee.id);
  };

  const handleSave = async () => {
    if (locked) return;

    const active = employees.filter(inPeriod);

    if (active.length === 0) return;
    setSaving(true);
    try {
      await savePayroll({
        year,
        month,
        cutoff,
        entries: active.map((employee) => {
          const input = getInput(employee);
          const r = computeRow(
            employee,
            input,
            cutoff,
            workingDays,
            absentForMeal(employee),
            halfRemovedOf(employee),
          );

          return {
            employee_id: employee.id,
            days: num(input.days),
            ot_hours: num(input.otHours),
            rest_day_hours: num(input.restDayHours),
            perfect_attendance: cutoff === "16-30" && input.perfectAttendance,
            earnings_adjustment: num(input.earningsAdjustment),
            tardiness_minutes: num(input.tardinessMinutes),
            lwop_days: num(input.lwopDays),
            sss_loan: num(input.sssLoan),
            pagibig_loan: num(input.pagibigLoan),
            deduction_adjustment: num(input.deductionAdjustment),
            monthly_rate: r.monthlyRate,
            // De minimis is now part of the daily rate, not a separate earning.
            other_de_minimis: 0,
            daily_rate: r.dailyRate,
            meal_allowance: r.mealAllowance,
            load_allowance: r.loadAllowance,
            overtime: r.overtime,
            rest_day: r.restDay,
            perfect_attendance_amount: r.perfectAttendance,
            gross_income: r.grossIncome,
            tardiness: r.tardiness,
            lwop: r.lwop,
            sss: r.sss,
            pagibig: r.pagibig,
            philhealth: r.philhealth,
            total_deduction: r.totalDeduction,
            net_pay: r.netPay,
          };
        }),
      });
      toast.success(`Payroll ${period} saved.`);
      setSavedEntries(await fetchPayroll(year, month, cutoff));

      // Final save: lock the period again.
      delete overriddenRef.current[periodKey];
      setLockedMap((prev) => ({ ...prev, [periodKey]: true }));

      // Generate payslips for everyone who has pay in this period.
      const slips = active
        .map((employee) => {
          const input = getInput(employee);

          return toPayslip(
            employee,
            input,
            computeRow(
              employee,
              input,
              cutoff,
              workingDays,
              absentForMeal(employee),
              halfRemovedOf(employee),
            ),
            month,
            year,
            cutoff,
            absentForMeal(employee),
            halfRemovedOf(employee),
          );
        })
        .filter((slip) => slip.grossIncome !== 0);

      setPreview(null);
      setPayslips(slips);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save payroll",
      );
    } finally {
      setSaving(false);
    }
  };
  const makeSlips = (list: Employee[]) =>
    list
      .map((employee) => {
        const input = getInput(employee);
        const absent = absentForMeal(employee);
        const half = halfRemovedOf(employee);
        const r = computeRow(
          employee,
          input,
          cutoff,
          workingDays,
          absent,
          half,
        );
        return toPayslip(employee, input, r, month, year, cutoff, absent, half);
      })
      .filter((slip) => slip.grossIncome !== 0);

  const savedSlip = (employee: Employee): PayslipData | null => {
    const entry = savedEntries.find(
      (s) => Number(s.employee_id) === employee.id,
    );

    if (!entry) return null;

    const days = num(entry.days);
    const mealAllowance = num(entry.meal_allowance);
    const mealDays = Math.floor(days);

    return {
      idNumber: String(employee.id_number ?? ""),
      name: getPayrollName(employee),
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
  };
  // ── override ──
  const unlockPeriod = () => {
    overriddenRef.current[periodKey] = true;
    setLockedMap((prev) => ({ ...prev, [periodKey]: false }));
  };

  const closeOverride = () => {
    setOverrideOpen(false);
    setOverridePassword("");
    setOverrideReason("");
  };

  const handleOverrideClick = () => setOverrideOpen(true);

  const submitOverride = async () => {
    const code = overridePassword.trim();
    const reason = overrideReason.trim();

    if (!superAdmin && !code) {
      toast.error("Enter the override password.");

      return;
    }
    if (reason.length < 3) {
      toast.error("Enter the reason for the edit.");

      return;
    }

    setOverriding(true);
    try {
      // The code works once; the server marks it as used.
      await overridePayroll({
        year,
        month,
        cutoff,
        reason,
        ...(superAdmin ? {} : { code }),
      });
      unlockPeriod();
      closeOverride();
      toast.success(`Payroll ${period} unlocked. You can edit now.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Invalid override password",
      );
    } finally {
      setOverriding(false);
    }
  };

  // Superadmin only: makes a one-time password for this period.
  const handleGenerateCode = async () => {
    setGenerating(true);
    try {
      const res = await generateOverrideCode({ year, month, cutoff });

      setGeneratedCode(res.code);
      setCodeOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate code",
      );
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      toast.success("Code copied.");
    } catch {
      toast.error("Could not copy. Select the code and copy it manually.");
    }
  };

  // What the table shows, ready for the Excel / JPG export.
  // Only the rows ticked in the table are exported, with their own total.
  const buildExportData = (): PayrollExportData => ({
    title: `Payroll ${period} · ${MONTHS[month - 1]} ${year} (${selectedRows.length} selected)`,
    fileName: `Payroll_${MONTHS[month - 1]}-${cutoffText}-${year}`,
    columns: EXPORT_COLUMNS,
    rows: selectedRows.map(({ employee, input, result }) => [
      period,
      String(employee.id_number ?? ""),
      getPayrollName(employee),
      result.monthlyRate,
      result.deMinimis,
      num(input.days),
      result.dailyRate,
      result.mealAllowance,
      result.loadAllowance,
      result.overtime,
      result.restDay,
      result.perfectAttendance,
      result.earningsAdjustment,
      result.grossIncome,
      result.tardiness,
      result.lwop,
      result.sss,
      result.pagibig,
      result.philhealth,
      result.sssLoan,
      result.pagibigLoan,
      result.deductionAdjustment,
      result.totalDeduction,
      result.netPay,
    ]),
    totals: {
      [EXPORT_GROSS_COL]: selectedTotals.gross,
      [EXPORT_DEDUCTION_COL]: selectedTotals.deduction,
      [EXPORT_NET_COL]: selectedTotals.net,
    },
  });

  const handleExport = (type: "xlsx" | "jpg") => {
    if (selectedRows.length === 0) {
      toast.error("Tick at least one employee (checkbox) to export.");

      return;
    }
    try {
      const data = buildExportData();

      if (type === "xlsx") exportPayrollXlsx(data);
      else exportPayrollJpg(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export the table",
      );
    }
  };

  const yearOptions = [year - 1, year, year + 1];

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg">
        <div className="mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
                  <Banknote className="h-6 w-6 text-white sm:h-7 sm:w-7" />
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
                    Payroll
                  </h1>
                  <p className="mt-1 text-sm text-blue-100">
                    Period {period} · {MONTHS[month - 1]} {year}
                  </p>
                </div>
              </div>

              {!loading && tab === "payroll" && (
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-blue-100">
                  <span>
                    <span className="font-semibold text-white">
                      {rows.length}
                    </span>{" "}
                    active employees
                  </span>
                  <span className="hidden h-4 w-px bg-white/30 sm:block" />
                  <span>
                    Gross{" "}
                    <span className="font-semibold text-white">
                      ₱{money(totals.gross)}
                    </span>
                  </span>
                  <span className="hidden h-4 w-px bg-white/30 sm:block" />
                  <span>
                    Net{" "}
                    <span className="font-semibold text-white">
                      ₱{money(totals.net)}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
              type="button"
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "payroll" || tab === "payslip" ? (
        <div className="w-full min-w-0 space-y-5 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          {/* ── Period controls ── */}
          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-end gap-3">
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
                  >
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                  {(["1-15", "16-30"] as Cutoff[]).map((c) => (
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
                      {cutoffLabel(year, month, c)}
                    </Button>
                  ))}
                </div>

                {tab === "payroll" && (
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                    {VIEWS.map((v) => (
                      <Button
                        key={v.key}
                        className={`h-10 rounded-none px-4 shadow-none ${
                          view === v.key
                            ? "bg-slate-800 text-white hover:bg-slate-900"
                            : "bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        type="button"
                        variant="ghost"
                        onClick={() => setView(v.key)}
                      >
                        {v.label}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Working days of the clicked cut-off (auto) */}
                <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {cutoffDays}
                  </span>
                  <span className="ml-1">working days</span>
                  <span className="ml-1 text-xs text-slate-400">
                    ({cutoffText})
                  </span>
                </div>

                {/* Timekeeping link (perfect attendance is read from it) */}
                {cutoff === "16-30" && (
                  <div
                    className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600"
                    title="Perfect attendance is judged for the whole month, read from the submitted timekeeping"
                  >
                    <Clock className="h-4 w-4 text-slate-400" />
                    {tk.status === "ready" ? (
                      <>
                        Timekeeping:{" "}
                        <span className="font-semibold text-slate-900">
                          {tk.label}
                        </span>
                        {tk.missingDays.length > 0 && (
                          <span className="ml-1.5 text-xs font-medium text-amber-700">
                            (incomplete month)
                          </span>
                        )}
                      </>
                    ) : tk.status === "none" ? (
                      "No timekeeping submitted"
                    ) : tk.status === "error" ? (
                      "Timekeeping unavailable"
                    ) : (
                      "Timekeeping: checking..."
                    )}
                  </div>
                )}

                {/* Final save / override */}
                {tab === "payroll" &&
                  (locked ? (
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-green-50 px-3 text-sm font-medium text-green-700 ring-1 ring-green-200">
                        <Lock className="h-4 w-4" />
                        Final saved
                      </span>

                      {superAdmin && (
                        <Button
                          className="h-10"
                          disabled={generating}
                          type="button"
                          variant="outline"
                          onClick={handleGenerateCode}
                        >
                          {generating ? (
                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <KeyRound className="mr-2 h-4 w-4" />
                          )}
                          Generate code
                        </Button>
                      )}

                      <Button
                        className="h-10"
                        disabled={overriding}
                        type="button"
                        variant="outline"
                        onClick={handleOverrideClick}
                      >
                        {overriding ? (
                          <Loader className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Unlock className="mr-2 h-4 w-4" />
                        )}
                        Override
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="ml-auto h-10 bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                      disabled={
                        saving || loading || !periodReady || rows.length === 0
                      }
                      type="button"
                      onClick={handleSave}
                    >
                      {saving ? (
                        <Loader className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {saving ? "Saving..." : "Save payroll"}
                    </Button>
                  ))}
              </div>

              {missingRates > 0 && (
                <p className="text-xs text-red-600">
                  {missingRates} active employee
                  {missingRates === 1 ? "" : "s"} have no monthly rate in the
                  masterfile — their pay will show as 0.00.
                </p>
              )}
            </div>
          </Card>

          {/* ── Locked banner ── */}
          {locked && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <Lock className="h-5 w-5 text-amber-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900">
                  Payroll {period} · {MONTHS[month - 1]} {year} is final saved
                </p>
                <p className="text-xs text-amber-800">
                  View only.{" "}
                  {superAdmin
                    ? "Click Override to edit."
                    : "Ask Management for a one-time code, then click Override."}
                </p>
              </div>
            </div>
          )}

          {tab === "payslip" ? (
            <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {!locked ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  Payslips are available once payroll {period} is final saved.
                </p>
              ) : (
                (() => {
                  const slips = rows
                    .map((e) => savedSlip(e))
                    .filter(
                      (s): s is PayslipData => !!s && s.grossIncome !== 0,
                    );

                  return (
                    <div className="grid min-h-[300px] grid-cols-1 md:grid-cols-[320px_1fr]">
                      <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto border-b border-slate-200 md:border-b-0 md:border-r">
                        {slips.map((slip) => (
                          <li
                            key={slip.idNumber}
                            className="flex items-center justify-between gap-2 px-4 py-2.5"
                          >
                            <button
                              className="min-w-0 text-left"
                              type="button"
                              onClick={() => setPreview(payslipDataUrl(slip))}
                            >
                              <p className="truncate text-sm font-medium text-slate-900">
                                {slip.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {slip.idNumber} · Net ₱{money(slip.netPay)}
                              </p>
                            </button>
                            <Button
                              className="h-8 shrink-0 px-2.5"
                              size="sm"
                              type="button"
                              variant="outline"
                              onClick={() => downloadPayslip(slip)}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </li>
                        ))}
                      </ul>

                      <div className="flex items-start justify-center overflow-auto bg-slate-50 p-4">
                        {preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt="Payslip preview"
                            className="w-full max-w-[460px] border border-slate-200 bg-white shadow-sm"
                            src={preview}
                          />
                        ) : (
                          <p className="self-center text-sm text-slate-500">
                            Click a name to preview the payslip.
                          </p>
                        )}
                      </div>

                      {slips.length > 0 && (
                        <div className="col-span-full flex justify-end border-t border-slate-200 p-3">
                          <Button
                            type="button"
                            onClick={() => downloadAllPayslips(slips)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download all ({slips.length})
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </Card>
          ) : view === "table" ? (
            <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 sm:p-5">
                <div className="relative min-w-[240px] max-w-md flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    aria-label="Search employees"
                    className="pl-9"
                    placeholder="Search by name or ID number"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">
                      {selectedRows.length}
                    </span>{" "}
                    Employees
                  </span>
                  <Button
                    className="h-10"
                    disabled={loading || selectedRows.length === 0}
                    title={
                      selectedRows.length === 0
                        ? "Tick at least one employee first"
                        : undefined
                    }
                    type="button"
                    variant="outline"
                    onClick={() => handleExport("xlsx")}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Excel
                  </Button>
                  <Button
                    className="h-10"
                    disabled={loading || selectedRows.length === 0}
                    title={
                      selectedRows.length === 0
                        ? "Tick at least one employee first"
                        : undefined
                    }
                    type="button"
                    variant="outline"
                    onClick={() => handleExport("jpg")}
                  >
                    <FileImage className="mr-2 h-4 w-4" />
                    JPG
                  </Button>
                </div>
              </div>

              <CardContent className="p-0">
                <div className="max-h-[70vh] w-full overflow-auto">
                  <table className="w-max border-collapse text-slate-800">
                    <thead className="sticky top-0 z-20">
                      {/* Group row */}
                      <tr>
                        <th className={`${TH_BASE} bg-amber-200`} colSpan={3}>
                          EMPLOYEE DETAILS
                        </th>
                        <th
                          className={`${TH_BASE} bg-green-200`}
                          colSpan={EARNINGS_COLS}
                        >
                          EARNINGS
                        </th>
                        <th
                          className={`${TH_BASE} bg-rose-200`}
                          colSpan={DEDUCTION_COLS}
                        >
                          DEDUCTIONS
                        </th>
                        <th className={`${TH_BASE} bg-cyan-100`}>NET PAY</th>
                        <th
                          className={`${TH_BASE} w-[70px] min-w-[70px] bg-slate-200`}
                          rowSpan={2}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <input
                              aria-label="Select all"
                              checked={allChecked}
                              className="h-4 w-4 cursor-pointer accent-blue-600"
                              disabled={computed.length === 0}
                              type="checkbox"
                              onChange={toggleAllChecked}
                            />
                            <span>SELECT</span>
                          </div>
                        </th>
                      </tr>

                      {/* Column row */}
                      <tr>
                        <th className={`${TH_BASE} bg-slate-200`}>PERIOD</th>
                        <th className={`${TH_BASE} bg-slate-200`}>ID NUMBER</th>
                        <th className={`${TH_BASE} bg-slate-200`}>NAME</th>

                        {[
                          "MO.RATE",
                          "DE MINIMIS",
                          "DAYS",
                          "DAILY RATE",
                          "MEAL ALLOWANCE",
                          "LOAD ALLOWANCE",
                          "OVERTIME",
                          "REST DAY",
                          "PERFECT ATTENDANCE",
                          "ADJUSTMENT",
                          "GROSS INCOME",
                        ].map((h) => (
                          <th
                            key={h}
                            className={`${TH_BASE} ${TH_NUM_W} bg-green-100`}
                          >
                            {h}
                          </th>
                        ))}

                        {[
                          "TARDINESS",
                          "LWOP",
                          "SSS",
                          "PAG-IBIG",
                          "PHILHEALTH",
                          "SSS LOAN",
                          "PAG-IBIG LOAN",
                          "ADJUSTMENT",
                          "TOTAL DEDUCTION",
                        ].map((h) => (
                          <th
                            key={h}
                            className={`${TH_BASE} ${TH_NUM_W} bg-rose-100`}
                          >
                            {h}
                          </th>
                        ))}

                        <th className={`${TH_BASE} ${TH_NUM_W} bg-cyan-50`}>
                          NET PAY
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {loading ? (
                        <tr>
                          <td
                            className="h-48 text-center text-xs text-slate-500"
                            colSpan={TOTAL_COLS}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Loader className="h-4 w-4 animate-spin" />
                              Loading employees...
                            </span>
                          </td>
                        </tr>
                      ) : computed.length === 0 ? (
                        <tr>
                          <td
                            className="h-48 text-center text-xs text-slate-500"
                            colSpan={TOTAL_COLS}
                          >
                            No active employees match your search.
                          </td>
                        </tr>
                      ) : (
                        computed.map(({ employee, input, result }) => {
                          const id = employee.id;
                          const checked = checkedIds.includes(id);

                          return (
                            <tr
                              key={id}
                              className={
                                checked
                                  ? "bg-blue-50/70"
                                  : "hover:bg-blue-50/40"
                              }
                            >
                              <td className="whitespace-nowrap border border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-xs">
                                {period}
                              </td>
                              <td className="whitespace-nowrap border border-slate-200 bg-slate-50 px-3 py-1.5 text-center font-mono text-xs">
                                {employee.id_number}
                              </td>
                              <td className="whitespace-nowrap border border-slate-200 bg-yellow-100 px-3 py-1.5 text-left text-xs font-medium">
                                {getPayrollName(employee)}
                              </td>

                              {/* Earnings */}
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.monthlyRate)}
                              </td>
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.deMinimis, true)}
                              </td>
                              <NumberCell
                                plain
                                value={input.days}
                                onChange={(v) => setField(id, "days", v)}
                              />
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.dailyRate)}
                              </td>
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.mealAllowance, true)}
                              </td>
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.loadAllowance, true)}
                              </td>
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.overtime, true)}
                              </td>
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.restDay, true)}
                              </td>

                              {/* Perfect attendance — only on 16-30 */}
                              <td className={`${TD_BASE} bg-white`}>
                                {money(result.perfectAttendance, true)}
                              </td>

                              <SignedCell
                                value={input.earningsAdjustment}
                                onChange={(v) =>
                                  setField(id, "earningsAdjustment", v)
                                }
                              />
                              <td
                                className={`${TD_BASE} bg-green-50 font-bold tabular-nums`}
                              >
                                {money(result.grossIncome)}
                              </td>

                              {/* Deductions */}
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.tardiness, true)}
                              </td>
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.lwop, true)}
                              </td>
                              {/* Automatic contributions */}
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.sss, true)}
                              </td>
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.pagibig, true)}
                              </td>
                              <td className={`${TD_BASE} bg-slate-50`}>
                                {money(result.philhealth, true)}
                              </td>
                              <NumberCell
                                value={input.sssLoan}
                                onChange={(v) => setField(id, "sssLoan", v)}
                              />
                              <NumberCell
                                value={input.pagibigLoan}
                                onChange={(v) => setField(id, "pagibigLoan", v)}
                              />
                              <SignedCell
                                value={input.deductionAdjustment}
                                onChange={(v) =>
                                  setField(id, "deductionAdjustment", v)
                                }
                              />
                              <td
                                className={`${TD_BASE} bg-rose-50 font-bold tabular-nums`}
                              >
                                {money(result.totalDeduction)}
                              </td>

                              {/* Net pay */}
                              <td
                                className={`${TD_BASE} bg-cyan-50 font-bold tabular-nums`}
                              >
                                {money(result.netPay)}
                              </td>

                              {/* Select (right end) */}
                              <td className="w-[70px] min-w-[70px] border border-slate-200 bg-white px-2 py-1.5 text-center">
                                <input
                                  aria-label={`Select ${getPayrollName(employee)}`}
                                  checked={checked}
                                  className="h-4 w-4 cursor-pointer accent-blue-600"
                                  type="checkbox"
                                  onChange={() => toggleChecked(id)}
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>

                    {!loading && computed.length > 0 && (
                      <tfoot className="sticky bottom-0 z-20">
                        {/* Total of the ticked rows */}
                        {selectedRows.length > 0 && (
                          <tr className="bg-blue-100 text-xs font-bold">
                            <td
                              className="border border-slate-300 px-3 py-2 text-right"
                              colSpan={3 + EARNINGS_COLS - 1}
                            >
                              SELECTED TOTAL ({selectedRows.length})
                            </td>
                            <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">
                              {money(selectedTotals.gross)}
                            </td>
                            <td
                              className="border border-slate-300 px-3 py-2"
                              colSpan={DEDUCTION_COLS - 1}
                            />
                            <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">
                              {money(selectedTotals.deduction)}
                            </td>
                            <td className="border border-slate-300 bg-cyan-100 px-2 py-2 text-right tabular-nums">
                              {money(selectedTotals.net)}
                            </td>
                            <td className="border border-slate-300 px-2 py-2" />
                          </tr>
                        )}

                        {/* Total of everyone shown */}
                        <tr className="bg-slate-100 text-xs font-bold">
                          <td
                            className="border border-slate-300 px-3 py-2 text-right"
                            colSpan={3 + EARNINGS_COLS - 1}
                          >
                            TOTAL
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">
                            {money(totals.gross)}
                          </td>
                          <td
                            className="border border-slate-300 px-3 py-2"
                            colSpan={DEDUCTION_COLS - 1}
                          />
                          <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">
                            {money(totals.deduction)}
                          </td>
                          <td className="border border-slate-300 bg-cyan-100 px-2 py-2 text-right tabular-nums">
                            {money(totals.net)}
                          </td>
                          <td className="border border-slate-300 px-2 py-2" />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <LockedContext.Provider value={locked}>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                {/* ── Employee list ── */}
                <Card className="flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        aria-label="Search employees"
                        className="pl-9"
                        placeholder="Search by name or ID number"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                    {loading ? (
                      <li className="flex h-40 items-center justify-center text-sm text-slate-500">
                        <Loader className="mr-2 h-4 w-4 animate-spin" />
                        Loading employees...
                      </li>
                    ) : computed.length === 0 ? (
                      <li className="flex h-40 items-center justify-center px-4 text-center text-sm text-slate-500">
                        No active employees match your search.
                      </li>
                    ) : (
                      computed.map(({ employee, result }, i) => {
                        // Edited / saved by hand vs. automatic days.
                        const filled = Boolean(
                          inputs[`${periodKey}:${employee.id}`]?.days,
                        );

                        return (
                          <li key={employee.id}>
                            <button
                              className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors ${
                                i === selectedIndex
                                  ? "bg-blue-50"
                                  : "hover:bg-slate-50"
                              }`}
                              type="button"
                              onClick={() => setSelectedId(employee.id)}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {getPayrollName(employee)}
                                </p>
                                <p className="font-mono text-xs text-slate-500">
                                  {employee.id_number}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xs font-semibold tabular-nums text-slate-900">
                                  {money(result.netPay)}
                                </p>
                                <p
                                  className={`text-[10px] ${
                                    filled ? "text-green-600" : "text-slate-400"
                                  }`}
                                >
                                  {filled ? "filled" : "auto days"}
                                </p>
                              </div>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </Card>

                {/* ── Employee form ── */}
                <Card className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {!current ? (
                    <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                      {loading ? "Loading..." : "Select an employee."}
                    </div>
                  ) : (
                    (() => {
                      const { employee, input, result: r } = current;
                      const id = employee.id;

                      // Perfect attendance: hint + reset to the timekeeping.
                      const manualPerfect = perfectIsManual(id);
                      const att = attendanceOf(employee);
                      const hint = perfectHint(employee, manualPerfect);
                      const canResetPerfect =
                        !locked &&
                        periodReady &&
                        manualPerfect &&
                        tk.status === "ready" &&
                        Boolean(att) &&
                        input.perfectAttendance !== Boolean(att?.perfect);

                      return (
                        <div>
                          {/* Employee header + prev/next */}
                          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                            <div className="min-w-0">
                              <h2 className="flex items-center gap-2 truncate text-base font-semibold text-slate-900">
                                {getPayrollName(employee)}
                                {locked && (
                                  <Lock className="h-4 w-4 shrink-0 text-amber-600" />
                                )}
                              </h2>
                              <p className="text-xs text-slate-500">
                                ID {employee.id_number} · Period {period} ·{" "}
                                {selectedIndex + 1} of {computed.length}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <label className="mr-2 inline-flex items-center gap-2 text-sm text-slate-700">
                                <Toggle
                                  checked={isFixed(employee)}
                                  disabled={readOnly}
                                  label="Mark as fixed"
                                  onChange={(v) => toggleFixed(employee.id, v)}
                                />
                                Fixed
                              </label>
                              <Button
                                className="h-9 px-3"
                                disabled={selectedIndex === 0}
                                type="button"
                                variant="outline"
                                onClick={() => goTo(selectedIndex - 1)}
                              >
                                <ChevronLeft className="h-4 w-4" />
                                Prev
                              </Button>
                              <Button
                                className="h-9 px-3"
                                disabled={selectedIndex >= computed.length - 1}
                                type="button"
                                variant="outline"
                                onClick={() => goTo(selectedIndex + 1)}
                              >
                                Next
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                            <div className="min-w-0 space-y-6">
                              {/* Rates (fetched) */}
                              <section>
                                <SectionTitle>
                                  Rates (from masterfile)
                                </SectionTitle>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                  <ReadOnly
                                    label="Monthly rate"
                                    value={money(r.monthlyRate)}
                                  />
                                  <ReadOnly
                                    label="De minimis"
                                    value={money(r.deMinimis)}
                                  />
                                  <ReadOnly
                                    label="Daily rate"
                                    value={money(r.dailyRate)}
                                  />
                                  <ReadOnly
                                    label="Hourly rate"
                                    value={money(r.hourlyRate)}
                                  />
                                  <ReadOnly
                                    label="Meal allowance / day"
                                    value={money(r.mealRate)}
                                  />
                                  {cutoff === "1-15" && (
                                    <ReadOnly
                                      label="Load allowance"
                                      value={money(r.loadAllowance)}
                                    />
                                  )}
                                </div>
                              </section>

                              {/* Earnings inputs. The fieldset is only
                                  disabled while loading; the locked state is
                                  handled by <Field> (read-only look). */}
                              <section>
                                <SectionTitle>Earnings</SectionTitle>
                                <fieldset
                                  className="m-0 min-w-0 border-0 p-0"
                                  disabled={!periodReady}
                                >
                                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <Field
                                      hint={`(auto ${autoDays(employee)})`}
                                      label="Days worked"
                                      max={MAX_DAYS_PER_CUTOFF}
                                      value={input.days}
                                      onChange={(v) => setField(id, "days", v)}
                                    />
                                    <div>
                                      <Field
                                        hint="(hour/s)"
                                        label="Overtime"
                                        value={input.otHours}
                                        onChange={(v) =>
                                          setField(id, "otHours", v)
                                        }
                                      />
                                      <p className="mt-1 text-[11px] text-slate-400">
                                        {autoOtMins(employee) > 0
                                          ? `${fmtHm(autoOtMins(employee))} approved OT = ${autoOtHours(employee)} hrs.`
                                          : ""}
                                      </p>
                                    </div>
                                    <Field
                                      hint="(hour/s)"
                                      label="Rest day"
                                      value={input.restDayHours}
                                      onChange={(v) =>
                                        setField(id, "restDayHours", v)
                                      }
                                    />
                                    <Field
                                      label="Earnings adjustment"
                                      signed
                                      value={input.earningsAdjustment}
                                      onChange={(v) =>
                                        setField(id, "earningsAdjustment", v)
                                      }
                                    />

                                    <div className="col-span-2 flex items-end sm:col-span-2">
                                      {cutoff === "16-30" ? (
                                        <div className="space-y-1">
                                          <label
                                            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm text-slate-700 ${
                                              locked
                                                ? "cursor-not-allowed border-dashed border-slate-300 bg-slate-50"
                                                : "cursor-pointer border-slate-200"
                                            }`}
                                          >
                                            <input
                                              checked={input.perfectAttendance}
                                              className="h-4 w-4 accent-blue-600 disabled:cursor-not-allowed"
                                              disabled={locked}
                                              type="checkbox"
                                              onChange={(e) =>
                                                setField(
                                                  id,
                                                  "perfectAttendance",
                                                  e.target.checked,
                                                )
                                              }
                                            />
                                            Perfect attendance (₱
                                            {money(PERFECT_ATTENDANCE_AMOUNT)})
                                            {locked && (
                                              <Lock className="h-3 w-3 text-slate-400" />
                                            )}
                                          </label>
                                          <p className={`text-xs ${hint.tone}`}>
                                            {hint.text}
                                            {canResetPerfect && (
                                              <button
                                                className="ml-2 font-medium text-blue-600 hover:underline"
                                                type="button"
                                                onClick={() =>
                                                  setField(
                                                    id,
                                                    "perfectAttendance",
                                                    null,
                                                  )
                                                }
                                              >
                                                Use timekeeping
                                              </button>
                                            )}
                                          </p>
                                        </div>
                                      ) : (
                                        <p className="pb-2 text-xs text-slate-400"></p>
                                      )}
                                    </div>
                                  </div>
                                </fieldset>
                              </section>

                              {/* Deductions inputs */}
                              <section>
                                <SectionTitle>Deductions</SectionTitle>
                                <div className="space-y-3">
                                  {/* Row 1 */}
                                  <fieldset
                                    className="m-0 min-w-0 border-0 p-0"
                                    disabled={!periodReady}
                                  >
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                      <div>
                                        <Field
                                          hint="(minute/s)"
                                          label="Tardiness"
                                          value={input.tardinessMinutes}
                                          onChange={(v) =>
                                            setField(id, "tardinessMinutes", v)
                                          }
                                        />
                                        <p className="mt-1 text-[11px] text-slate-400">
                                          {autoTardyMins(employee) > 0
                                            ? ``
                                            : ""}
                                        </p>
                                      </div>
                                      <div>
                                        <Field
                                          hint="(day/s)"
                                          label="LWOP"
                                          value={input.lwopDays}
                                          onChange={(v) =>
                                            setField(id, "lwopDays", v)
                                          }
                                        />
                                        {/* <p className="mt-1 text-[11px] text-slate-400">
                                          Timekeeping: {autoLwopDays(employee)}{" "}
                                          absent / incomplete,{" "}
                                          {autoLeaveDays(employee)} approved
                                          leave day(s).
                                          {autoLeaveDays(employee) > 0 &&
                                            (leavePaidOf(id) ? " " : " ")}{" "}
                                        </p> */}
                                        {autoLeaveDays(employee) > 0 && (
                                          <label className="mt-1.5 inline-flex items-center gap-2 text-xs text-slate-700">
                                            <input
                                              checked={leavePaidOf(id)}
                                              className="h-4 w-4 accent-blue-600 disabled:cursor-not-allowed"
                                              disabled={readOnly}
                                              type="checkbox"
                                              onChange={(e) =>
                                                setLeavePaid(
                                                  id,
                                                  e.target.checked,
                                                )
                                              }
                                            />
                                            May leave credits (bayad ang leave)
                                          </label>
                                        )}
                                      </div>
                                    </div>
                                  </fieldset>

                                  {/* Row 2 — automatic contributions */}
                                  <ContributionPanel
                                    amounts={{
                                      sss: r.sss,
                                      philhealth: r.philhealth,
                                      pagibig: r.pagibig,
                                    }}
                                    cutoff={cutoff}
                                    kind={contribTab}
                                    locked={readOnly}
                                    monthlyRate={r.monthlyRate}
                                    on={{
                                      sss: input.sssOn,
                                      philhealth: input.philhealthOn,
                                      pagibig: input.pagibigOn,
                                    }}
                                    sssBase={r.sssBase}
                                    onKind={setContribTab}
                                    onToggle={(k, v) => setContribOn(id, k, v)}
                                  />

                                  {/* Row 3 */}
                                  <fieldset
                                    className="m-0 min-w-0 border-0 p-0"
                                    disabled={!periodReady}
                                  >
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                      <Field
                                        label="SSS loan"
                                        value={input.sssLoan}
                                        onChange={(v) =>
                                          setField(id, "sssLoan", v)
                                        }
                                      />
                                      <Field
                                        label="PAG-IBIG loan"
                                        value={input.pagibigLoan}
                                        onChange={(v) =>
                                          setField(id, "pagibigLoan", v)
                                        }
                                      />
                                      <Field
                                        label="Deduction adjustment"
                                        signed
                                        value={input.deductionAdjustment}
                                        onChange={(v) =>
                                          setField(id, "deductionAdjustment", v)
                                        }
                                      />
                                    </div>
                                  </fieldset>
                                </div>
                              </section>
                            </div>

                            {/* Live computation */}
                            <aside className="h-fit rounded-xl border border-slate-200 bg-slate-50 p-4 xl:sticky xl:top-4">
                              <SectionTitle>Computation</SectionTitle>

                              <div className="space-y-0.5">
                                <Line
                                  label={
                                    num(input.days) > 0
                                      ? `Basic pay (${num(input.days)} ${num(input.days) === 1 ? "day" : "days"})`
                                      : "Basic pay"
                                  }
                                  value={money(r.basicPay)}
                                />
                                <Line
                                  label="Meal allowance"
                                  value={money(r.mealAllowance, true)}
                                />
                                <Line
                                  label="Load allowance"
                                  value={money(r.loadAllowance, true)}
                                />
                                <Line
                                  label="Overtime"
                                  value={money(r.overtime, true)}
                                />
                                <Line
                                  label="Rest day"
                                  value={money(r.restDay, true)}
                                />
                                <Line
                                  label="Perfect attendance"
                                  value={money(r.perfectAttendance, true)}
                                />
                                <Line
                                  label="Adjustment"
                                  value={money(r.earningsAdjustment, true)}
                                />
                                <Line
                                  strong
                                  label="Gross income"
                                  value={money(r.grossIncome)}
                                />
                              </div>

                              <div className="mt-4 space-y-0.5">
                                <Line
                                  label="Tardiness"
                                  value={money(r.tardiness, true)}
                                />
                                <Line
                                  label="LWOP"
                                  value={money(r.lwop, true)}
                                />
                                <Line label="SSS" value={money(r.sss, true)} />
                                <Line
                                  label="PAG-IBIG"
                                  value={money(r.pagibig, true)}
                                />
                                <Line
                                  label="PhilHealth"
                                  value={money(r.philhealth, true)}
                                />
                                <Line
                                  label="SSS loan"
                                  value={money(r.sssLoan, true)}
                                />
                                <Line
                                  label="PAG-IBIG loan"
                                  value={money(r.pagibigLoan, true)}
                                />
                                <Line
                                  label="Adjustment"
                                  value={money(r.deductionAdjustment, true)}
                                />
                                <Line
                                  strong
                                  label="Total deduction"
                                  value={money(r.totalDeduction)}
                                />
                              </div>

                              <div className="mt-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 text-white">
                                <p className="text-xs text-blue-100">Net pay</p>
                                <p className="text-2xl font-bold tabular-nums">
                                  ₱{money(r.netPay)}
                                </p>
                              </div>
                            </aside>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </Card>
              </div>
            </LockedContext.Provider>
          )}
        </div>
      ) : tab === "history" ? (
        <PayrollHistory employees={employees} employeesLoading={loading} />
      ) : (
        <ContributionTables
          employeeName={current ? getPayrollName(current.employee) : null}
          links={links}
          monthlyRate={current?.result.monthlyRate ?? 0}
          sssBase={current?.result.sssBase ?? 0}
          onSaveLink={saveLink}
        />
      )}

      {/* ── Override (reason for everyone, password for non-superadmin) ── */}
      {overrideOpen && (
        <Modal title="Override saved payroll" onClose={closeOverride}>
          <p className="text-sm text-slate-600">
            Payroll {period} · {MONTHS[month - 1]} {year} is locked.{" "}
            {superAdmin
              ? "Tell us why you are editing it. This is kept in History."
              : "Enter the one-time password from the Management and the reason for the edit."}
          </p>

          {!superAdmin && (
            <Input
              autoFocus
              aria-label="Override password"
              autoComplete="off"
              placeholder="One-time password"
              type="password"
              value={overridePassword}
              onChange={(e) => setOverridePassword(e.target.value)}
            />
          )}

          <textarea
            aria-label="Reason for edit"
            autoFocus={superAdmin}
            className="min-h-[80px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            maxLength={255}
            placeholder="Reason for edit (e.g. OT approved, wrong days entered)"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeOverride}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
              disabled={
                overriding ||
                overrideReason.trim().length < 3 ||
                (!superAdmin && !overridePassword.trim())
              }
              type="button"
              onClick={submitOverride}
            >
              {overriding ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="mr-2 h-4 w-4" />
              )}
              Unlock
            </Button>
          </div>
        </Modal>
      )}

      {/* ── One-time code (superadmin only) ── */}
      {codeOpen && generatedCode && (
        <Modal
          title="One-time override password"
          onClose={() => {
            setCodeOpen(false);
            setGeneratedCode(null);
          }}
        >
          <p className="text-sm text-slate-600">
            For payroll {period} · {MONTHS[month - 1]} {year}. It works once
            only.
          </p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="select-all font-mono text-xl font-bold tracking-widest text-slate-900">
              {generatedCode}
            </span>
            <Button
              className="h-9"
              type="button"
              variant="outline"
              onClick={copyCode}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCodeOpen(false);
                setGeneratedCode(null);
              }}
            >
              Close
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Payslips (shown after saving) ── */}
      {payslips.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Payroll saved. Payslips are ready
                </h2>
                <p className="text-sm text-slate-500">
                  {payslips.length} payslip{payslips.length === 1 ? "" : "s"}{" "}
                  for {period} · {MONTHS[month - 1]} {year}
                </p>
              </div>
              <button
                aria-label="Close"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                type="button"
                onClick={() => {
                  setPayslips([]);
                  setPreview(null);
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[320px_1fr]">
              <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto border-b border-slate-200 md:max-h-none md:border-b-0 md:border-r">
                {payslips.map((slip) => (
                  <li
                    key={slip.idNumber}
                    className="flex items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <button
                      className="min-w-0 text-left"
                      type="button"
                      onClick={() => setPreview(payslipDataUrl(slip))}
                    >
                      <p className="truncate text-sm font-medium text-slate-900">
                        {slip.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {slip.idNumber} · Net ₱{money(slip.netPay)}
                      </p>
                    </button>
                    <Button
                      className="h-8 shrink-0 px-2.5"
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => downloadPayslip(slip)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="flex min-h-[200px] items-start justify-center overflow-auto bg-slate-50 p-4">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="Payslip preview"
                    className="w-full max-w-[460px] border border-slate-200 bg-white shadow-sm"
                    src={preview}
                  />
                ) : (
                  <p className="self-center text-sm text-slate-500">
                    Click a name to preview the payslip.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPayslips([]);
                  setPreview(null);
                }}
              >
                Close
              </Button>
              <Button
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                type="button"
                onClick={() => downloadAllPayslips(payslips)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download all ({payslips.length})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
