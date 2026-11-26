// File: lib/api.ts

// Public blog reads use Laravel directly; admin mutations go through the
// authenticated Next.js proxy.
import { apiFetch } from "./api-client";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface BlogPostRecord {
  id: number;
  title: string;
  slug: string;
  description: string;
  content: string | null;
  thumbnail: string | null;
  thumbnail_url: string | null;
  images: string[];
  image_urls: string[];
  video_path: string | null;
  video_url: string | null;
  category: string | null;
  author: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export async function fetchBlogPosts(
  params: {
    search?: string;
    page?: number;
    per_page?: number;
  } = {},
): Promise<PaginatedResponse<BlogPostRecord>> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const res = await fetch(`${API_URL}/api/blog-posts?${query.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch blog posts: ${res.status}`);
  return res.json();
}

export async function fetchBlogPost(id: number): Promise<BlogPostRecord> {
  const res = await fetch(`${API_URL}/api/blog-posts/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch blog post: ${res.status}`);
  return res.json();
}

export async function createBlogPost(
  payload: Partial<BlogPostRecord>,
): Promise<BlogPostRecord> {
  const res = await apiFetch("/api/admin/blog-posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create blog post: ${res.status}`);
  return res.json();
}

export async function updateBlogPost(
  id: number,
  payload: Partial<BlogPostRecord>,
): Promise<BlogPostRecord> {
  const res = await apiFetch(`/api/admin/blog-posts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update blog post: ${res.status}`);
  return res.json();
}

export async function deleteBlogPost(id: number): Promise<void> {
  const res = await apiFetch(`/api/admin/blog-posts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete blog post: ${res.status}`);
}

// ── Tardiness (admin) ────────────────────────────────────────────

export interface TardyRecord {
  id: number;
  employee_id: number;
  employee_number: string;
  employee_name: string;
  nickname: string | null;
  department: string;
  position: string;
  date: string; // yyyy-MM-dd
  time_in: string; // HH:mm or HH:mm:ss
}

export interface TardinessEmployeeOption {
  id: number;
  employee_id: string;
  name: string;
  nickname: string | null;
  department: string;
  position: string;
}

export interface TardinessPayload {
  employee_id: number;
  date: string;
  time_in: string;
}

// Surfaces Laravel validation errors / messages instead of just the status.
async function tardinessJson<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = data?.errors
      ? Object.values(data.errors as Record<string, string[]>)
          .flat()
          .join(" ")
      : "";
    throw new Error(errors || data?.message || `${fallback}: ${res.status}`);
  }
  return data as T;
}

export async function fetchTardiness(month: string): Promise<TardyRecord[]> {
  const res = await apiFetch(
    `/api/admin/tardiness?month=${encodeURIComponent(month)}`,
    { cache: "no-store" },
  );
  return (
    await tardinessJson<{ data: TardyRecord[] }>(
      res,
      "Failed to fetch tardiness records",
    )
  ).data;
}

// Pass `search` to filter by name / nickname / employee ID on the server.
export async function fetchTardinessEmployees(
  search = "",
): Promise<TardinessEmployeeOption[]> {
  const query = new URLSearchParams({ resource: "employees" });
  if (search.trim()) query.set("search", search.trim());
  const res = await apiFetch(`/api/admin/tardiness?${query.toString()}`, {
    cache: "no-store",
  });
  return (
    await tardinessJson<{ data: TardinessEmployeeOption[] }>(
      res,
      "Failed to fetch employees",
    )
  ).data;
}

export async function createTardiness(
  payload: TardinessPayload,
): Promise<TardyRecord> {
  const res = await apiFetch("/api/admin/tardiness", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return tardinessJson<TardyRecord>(res, "Failed to log time-in");
}

export async function updateTardiness(
  id: number,
  payload: TardinessPayload,
): Promise<TardyRecord> {
  const res = await apiFetch(`/api/admin/tardiness/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return tardinessJson<TardyRecord>(res, "Failed to update time-in");
}

export async function deleteTardiness(id: number): Promise<void> {
  const res = await apiFetch(`/api/admin/tardiness/${id}`, {
    method: "DELETE",
  });
  await tardinessJson<unknown>(res, "Failed to delete time-in");
}
//deployment
// Append this to the bottom of lib/api.ts.

// ── Payslip image (admin) ────────────────────────────────────────

export const COMPANY_NAME = "INFINITECH ADVERTISING CORPORATION";
export const COMPANY_ADDRESS =
  "Unit 311, Campos Rueda Building, Urban Ave. Makati City";

// Payout dates. 1-15 is paid on the 20th of the same month,
// 16-30 on the 5th of the next month. Change these if your schedule differs.
const PAYOUT_DAY_FIRST_CUTOFF = 20;
const PAYOUT_DAY_SECOND_CUTOFF = 5;

export type PayslipData = {
  idNumber: string;
  name: string;
  month: number; // 1-12
  year: number;
  cutoff: "1-15" | "16-30";

  // units
  days: number;
  mealDays: number;
  mealRate: number;
  dailyRate: number;
  otHours: number;
  restDayHours: number;
  tardinessMinutes: number;
  lwopDays: number;

  // earnings
  basicPay: number;
  deMinimis: number;
  overtime: number;
  restDay: number;
  mealAllowance: number;
  loadAllowance: number;
  perfectAttendance: number;
  earningsAdjustment: number;
  grossIncome: number;

  // deductions
  tardiness: number;
  lwop: number;
  sss: number;
  pagibig: number;
  philhealth: number;
  sssLoan: number;
  pagibigLoan: number;
  deductionAdjustment: number;
  totalDeduction: number;

  netPay: number;
};

const PAYSLIP_MONTHS = [
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

const payslipMoney = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const payslipUnits = (n: number) =>
  n ? String(Math.round(n * 100) / 100) : "";

function periodText(d: PayslipData) {
  const lastDay = new Date(d.year, d.month, 0).getDate();
  const range = d.cutoff === "1-15" ? "1-15" : `16-${lastDay}`;

  return `${PAYSLIP_MONTHS[d.month - 1]} ${range}, ${d.year}`;
}

function payoutText(d: PayslipData) {
  if (d.cutoff === "1-15") {
    return `${PAYSLIP_MONTHS[d.month - 1]} ${PAYOUT_DAY_FIRST_CUTOFF}, ${d.year}`;
  }
  const nextMonth = d.month === 12 ? 1 : d.month + 1;
  const nextYear = d.month === 12 ? d.year + 1 : d.year;

  return `${PAYSLIP_MONTHS[nextMonth - 1]} ${PAYOUT_DAY_SECOND_CUTOFF}, ${nextYear}`;
}

type PayslipRow = {
  label: string;
  units?: string;
  rate?: string;
  amount: number;
};

export function renderPayslip(d: PayslipData): HTMLCanvasElement {
  const earnings: PayslipRow[] = [
    {
      label: "Basic Pay (day/s)",
      units: payslipUnits(d.days),
      rate: d.days ? payslipMoney(d.dailyRate) : "",
      amount: d.basicPay,
    },
    { label: "Deminimis", amount: d.deMinimis },
    {
      label: "Overtime (hour/s)",
      units: payslipUnits(d.otHours),
      amount: d.overtime,
    },
    {
      label: "Rest Day (hour/s)",
      units: payslipUnits(d.restDayHours),
      amount: d.restDay,
    },
    {
      label: "Meal Allowance (day/s)",
      units: payslipUnits(d.mealDays),
      rate: d.mealDays ? payslipMoney(d.mealRate) : "",
      amount: d.mealAllowance,
    },
    { label: "Communication Allowance", amount: d.loadAllowance },
    ...(d.perfectAttendance
      ? [{ label: "Perfect Attendance", amount: d.perfectAttendance }]
      : []),
    { label: "Adjustment", amount: d.earningsAdjustment },
  ];

  const deductions: PayslipRow[] = [
    {
      label: "Tardiness (hour/s)",
      units: payslipUnits(d.tardinessMinutes / 60),
      amount: d.tardiness,
    },
    {
      label: "Leave w/o pay (day/s)",
      units: payslipUnits(d.lwopDays),
      amount: d.lwop,
    },
    { label: "SSS Contribution", amount: d.sss },
    { label: "HDMF Contribution", amount: d.pagibig },
    { label: "PHIC Contribution", amount: d.philhealth },
    { label: "SSS Loan", amount: d.sssLoan },
    { label: "HDMF Loan", amount: d.pagibigLoan },
    { label: "Adjustment", amount: d.deductionAdjustment },
  ];

  // ── layout ──
  const S = 2; // pixel ratio (sharper PNG)
  const W = 620;
  const ROW = 24;
  const L = 4; // left edge
  const R = W - 4; // right edge
  const X_UNITS = 180;
  const X_RATE = 340;
  const X_AMOUNT = 504;

  // header rows(7) + earnings(1 + n + 1) + deductions(1 + n + 1)
  // + blank + net + blank = see below, + footer note
  const rowCount =
    7 + (1 + earnings.length + 1) + (1 + deductions.length + 1) + 3;
  const NOTE_H = 44;
  const H = rowCount * ROW + NOTE_H + 8;

  const canvas = document.createElement("canvas");

  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d")!;

  ctx.scale(S, S);

  const CYAN = "#c9eef5";
  const GRAY = "#bfbfbf";
  const LILAC = "#cdd6f4";
  const INK = "#111111";
  const GRID = "#d9dde0";
  const FRAME = "#0e4a5c";
  const FONT = "Calibri, 'Segoe UI', Arial, sans-serif";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  let y = 4;

  const band = (color: string, h = ROW) => {
    ctx.fillStyle = color;
    ctx.fillRect(L, y, R - L, h);
  };

  const hline = (yy: number, color = GRID) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, yy + 0.5);
    ctx.lineTo(R, yy + 0.5);
    ctx.stroke();
  };

  const vlines = (y0: number, y1: number) => {
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    for (const x of [X_UNITS, X_RATE, X_AMOUNT]) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y0);
      ctx.lineTo(x + 0.5, y1);
      ctx.stroke();
    }
  };

  const text = (
    value: string,
    x: number,
    opts: {
      align?: CanvasTextAlign;
      bold?: boolean;
      size?: number;
      color?: string;
      italic?: boolean;
    } = {},
    yy = y,
    h = ROW,
  ) => {
    ctx.font = `${opts.italic ? "italic " : ""}${opts.bold ? "bold " : ""}${
      opts.size ?? 13
    }px ${FONT}`;
    ctx.fillStyle = opts.color ?? INK;
    ctx.textAlign = opts.align ?? "left";
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, yy + h / 2 + 1);
  };

  // ── company header ──
  band(CYAN);
  text(COMPANY_NAME, W / 2, { align: "center", bold: true, size: 15 });
  y += ROW;

  band(CYAN);
  text(COMPANY_ADDRESS, W / 2, { align: "center", color: "#444" });
  y += ROW;

  text("SEMI - MONTHLY PAYSLIP", W / 2, { align: "center", color: "#444" });
  hline(y + ROW);
  y += ROW;

  // ── employee box ──
  ctx.fillStyle = LILAC;
  ctx.fillRect(L, y, X_AMOUNT - L, ROW);
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(L + 0.5, y + 0.5, X_AMOUNT - L - 1, ROW - 1);
  ctx.beginPath();
  ctx.moveTo(X_UNITS + 0.5, y);
  ctx.lineTo(X_UNITS + 0.5, y + ROW);
  ctx.stroke();
  text(`ID No. ${d.idNumber}`, (L + X_UNITS) / 2, {
    align: "center",
    bold: true,
  });
  text(d.name, X_UNITS + 6, { bold: true });
  y += ROW;

  text("Period Covered:", X_UNITS + 6, { color: "#333" });
  text(periodText(d), X_RATE + 6, { color: "#333" });
  hline(y + ROW);
  y += ROW;

  text("Payout:", X_UNITS + 6, { color: "#333" });
  text(payoutText(d), X_RATE + 6, { color: "#333" });
  y += ROW;

  hline(y + ROW);
  y += ROW; // spacer

  // ── a table section ──
  const section = (
    title: string,
    rows: PayslipRow[],
    totalLabel: string,
    total: number,
  ) => {
    const top = y;

    band(CYAN);
    text(title, L + 6, { bold: true });
    text("Units", (X_UNITS + X_RATE) / 2, { align: "center", bold: true });
    text("Rate", (X_RATE + X_AMOUNT) / 2, { align: "center", bold: true });
    text("Amount", (X_AMOUNT + R) / 2, { align: "center", bold: true });
    y += ROW;

    for (const r of rows) {
      text(r.label, L + 6);
      if (r.units) {
        text(r.units, (X_UNITS + X_RATE) / 2, { align: "center" });
      }
      if (r.rate) {
        text(r.rate, (X_RATE + X_AMOUNT) / 2, { align: "center" });
      }
      text(payslipMoney(r.amount), R - 8, { align: "right" });
      hline(y + ROW);
      y += ROW;
    }

    band(GRAY);
    text(totalLabel, L + 6, { bold: true });
    text(payslipMoney(total), R - 8, { align: "right", bold: true });
    y += ROW;

    vlines(top, y);
  };

  section("Earnings:", earnings, "Gross Pay:", d.grossIncome);
  section("Deductions:", deductions, "Total deductions:", d.totalDeduction);

  y += ROW; // spacer

  // ── net pay ──
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(L, y + 0.5);
  ctx.lineTo(R, y + 0.5);
  ctx.moveTo(L, y + ROW - 0.5);
  ctx.lineTo(R, y + ROW - 0.5);
  ctx.stroke();
  ctx.fillStyle = CYAN;
  ctx.fillRect(X_AMOUNT, y + 1, R - X_AMOUNT, ROW - 2);
  text("NET PAY:", L + 6, { bold: true, size: 14 });
  text(payslipMoney(d.netPay), R - 8, { align: "right", bold: true, size: 14 });
  y += ROW;

  y += ROW; // spacer

  // ── footer note ──
  text(
    "This document is electronically generated and does not require signature.",
    R - 4,
    { align: "right", italic: true, size: 10, color: "#333" },
    y,
    16,
  );
  text(
    "For payroll concerns, please contact the Admin/Accounting Department within twenty-four (24) hours from receipt.",
    R - 4,
    { align: "right", italic: true, size: 10, color: "#333" },
    y + 15,
    16,
  );

  // ── outer frame ──
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 2;
  ctx.strokeRect(L, 4, R - L, H - 8);

  return canvas;
}

export const payslipDataUrl = (d: PayslipData) =>
  renderPayslip(d).toDataURL("image/png");

const payslipSafe = (s: string) =>
  s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");

export function payslipFileName(d: PayslipData) {
  return `Payslip_${payslipSafe(d.idNumber)}_${payslipSafe(d.name)}_${PAYSLIP_MONTHS[
    d.month - 1
  ].slice(0, 3)}-${d.cutoff}-${d.year}.png`;
}

export function downloadPayslip(d: PayslipData) {
  renderPayslip(d).toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = payslipFileName(d);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

// Downloads one after another so the browser doesn't drop any.
export async function downloadAllPayslips(list: PayslipData[]) {
  for (const d of list) {
    downloadPayslip(d);
    await new Promise((r) => setTimeout(r, 350));
  }
}
// ── Payroll (admin) ──────────────────────────────────────────────
// Paste this into lib/api.ts (anywhere after the imports, e.g. right
// before the "Payslip image" section).

export type PayrollCutoff = "1-15" | "16-30";

// Laravel returns DECIMAL columns as strings, hence number | string.
type Dec = number | string;

export interface PayrollEntryRecord {
  employee_id: number;
  // inputs
  days: Dec;
  ot_hours: Dec;
  rest_day_hours: Dec;
  perfect_attendance: boolean;
  earnings_adjustment: Dec;
  tardiness_minutes: Dec;
  lwop_days: Dec;
  sss_loan: Dec;
  pagibig_loan: Dec;
  deduction_adjustment: Dec;
  // computed snapshot
  monthly_rate: Dec;
  other_de_minimis: Dec;
  daily_rate: Dec;
  meal_allowance: Dec;
  load_allowance: Dec;
  overtime: Dec;
  rest_day: Dec;
  perfect_attendance_amount: Dec;
  gross_income: Dec;
  tardiness: Dec;
  lwop: Dec;
  sss: Dec;
  pagibig: Dec;
  philhealth: Dec;
  total_deduction: Dec;
  net_pay: Dec;
  sss_link?: string | null;
  philhealth_link?: string | null;
  pagibig_link?: string | null;
}

export interface SavePayrollPayload {
  year: number;
  month: number;
  cutoff: PayrollCutoff;
  entries: PayrollEntryRecord[];
}

async function payrollJson<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = data?.errors
      ? Object.values(data.errors as Record<string, string[]>)
          .flat()
          .join(" ")
      : "";
    throw new Error(errors || data?.message || `${fallback}: ${res.status}`);
  }
  return data as T;
}

export async function fetchPayroll(
  year: number,
  month: number,
  cutoff: PayrollCutoff,
): Promise<PayrollEntryRecord[]> {
  const query = new URLSearchParams({
    year: String(year),
    month: String(month),
    cutoff,
  });
  const res = await apiFetch(`/api/admin/payroll?${query.toString()}`, {
    cache: "no-store",
  });
  return (
    await payrollJson<{ data: PayrollEntryRecord[] }>(
      res,
      "Failed to fetch payroll",
    )
  ).data;
}
// Every saved version of a period (v1 original, v2 edited, ...).
export interface PayrollRevisionRecord {
  id: number;
  revision: number;
  saved_by: string | null;
  saved_at: string | null;
  reason?: string | null;
  entries: PayrollEntryRecord[];
}

export async function fetchPayrollRevisions(
  year: number,
  month: number,
  cutoff: PayrollCutoff,
): Promise<PayrollRevisionRecord[]> {
  const query = new URLSearchParams({
    year: String(year),
    month: String(month),
    cutoff,
  });
  const res = await apiFetch(
    `/api/admin/payroll/revisions?${query.toString()}`,
    { cache: "no-store" },
  );
  return (
    await payrollJson<{ data: PayrollRevisionRecord[] }>(
      res,
      "Failed to fetch payroll revisions",
    )
  ).data;
}
export async function savePayroll(payload: SavePayrollPayload): Promise<void> {
  const res = await apiFetch("/api/admin/payroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await payrollJson<unknown>(res, "Failed to save payroll");
}

// Employees for the payroll sheet, served under the "payroll" permission
// (same shape as /api/employee-masterfile).
export async function fetchPayrollEmployees<T = unknown>(): Promise<T[]> {
  const res = await apiFetch("/api/admin/payroll/employees", {
    cache: "no-store",
  });
  return (await payrollJson<{ data: T[] }>(res, "Failed to fetch employees"))
    .data;
}
// ── Payroll contribution source links (SSS / PhilHealth / Pag-IBIG) ──
// Separate from "Save payroll". Stored in Laravel with its own updated_at.

export type ContribLinkKind = "sss" | "philhealth" | "pagibig";

export interface ContribLinkRecord {
  url: string;
  updated_at: string | null; // ISO string
}

export async function fetchContributionLinks(): Promise<
  Record<string, ContribLinkRecord>
> {
  const res = await apiFetch("/api/admin/payroll/contribution-links", {
    cache: "no-store",
  });

  return (
    await payrollJson<{ data: Record<string, ContribLinkRecord> }>(
      res,
      "Failed to fetch source links",
    )
  ).data;
}

export async function saveContributionLink(
  kind: ContribLinkKind,
  url: string,
): Promise<ContribLinkRecord> {
  const res = await apiFetch(`/api/admin/payroll/contribution-links/${kind}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  return (
    await payrollJson<{ data: ContribLinkRecord }>(
      res,
      "Failed to save source link",
    )
  ).data;
}
// ── Payroll override (final save lock) ───────────────────────────

export interface PayrollOverridePeriod {
  year: number;
  month: number;
  cutoff: PayrollCutoff;
}

// Superadmin: walang code. Iba: kailangan ang one-time code.
// Ang backend ang nagve-verify ng role at ng code.
export async function overridePayroll(
  payload: PayrollOverridePeriod & { code?: string; reason?: string },
): Promise<void> {
  // Walang code = superadmin route (ang server ang nagche-check ng role).
  const path = payload.code
    ? "/api/admin/payroll/override"
    : "/api/admin/payroll/override-superadmin";

  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await payrollJson<unknown>(res, "Failed to override payroll");
}

// Superadmin lang: gumagawa ng isang beses na password para sa period.
export async function generateOverrideCode(
  payload: PayrollOverridePeriod,
): Promise<{ code: string }> {
  const res = await apiFetch("/api/admin/payroll/override-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return (
    await payrollJson<{ data: { code: string } }>(
      res,
      "Failed to generate override code",
    )
  ).data;
}

export async function fetchAdminSession(): Promise<any> {
  const res = await apiFetch("/api/admin/session", { cache: "no-store" });
  return res.json().catch(() => ({}));
}
// ── Timekeeping (admin) ──────────────────────────────────────────
// Append this to the bottom of lib/api.ts.
// Laravel: TimekeepingController (index / show / store / destroy / proof).

export interface TimekeepingBatchSummary {
  id: number;
  start_date: string;
  end_date: string;
  source_file: string | null;
  official_start: string | null;
  official_end: string | null;
  grace_minutes: number | null;
  employees_count: number;
  records_count: number;
  total_days: number;
  total_mins_late: number;
  total_deduction: number;
  submitted_by: string | null;
  created_at: string;
}

export interface TimekeepingRecordRow {
  id?: number; // needed to build the proof URL
  employee_number: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  no_of_days: number | string;
  mins_late: number | string;
  grace_deduction: number | string;
  is_leave: boolean | number | string;
  auto_filled_in: boolean | number | string;
  auto_filled_out: boolean | number | string;
  overtime_minutes?: number | string;
  overtime_note?: string | null;
  overtime_proof_name?: string | null;
  has_proof?: boolean;
}

export type TimekeepingBatchDetail = TimekeepingBatchSummary & {
  records: TimekeepingRecordRow[];
};

export interface SubmitTimekeepingRecord {
  employee_number: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  no_of_days: number;
  mins_late: number;
  grace_deduction: number;
  is_leave: boolean;
  auto_filled_in: boolean;
  auto_filled_out: boolean;
  overtime_minutes: number;
  overtime_note: string | null;
  overtime_proof_index: number | null; // index into `proofs`
}

export interface SubmitTimekeepingPayload {
  start_date: string;
  end_date: string;
  official_start: string; // HH:mm
  official_end: string; // HH:mm
  grace_minutes: number;
  source_file: string;
  records: SubmitTimekeepingRecord[];
  proofs?: File[]; // index matches overtime_proof_index
}

async function timekeepingJson<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = data?.errors
      ? Object.values(data.errors as Record<string, string[]>)
          .flat()
          .join(" ")
      : "";
    throw new Error(errors || data?.message || `${fallback}: ${res.status}`);
  }
  return data as T;
}

export async function fetchTimekeepingBatches(): Promise<
  TimekeepingBatchSummary[]
> {
  const res = await apiFetch("/api/admin/timekeeping", { cache: "no-store" });
  return (
    await timekeepingJson<{ data: TimekeepingBatchSummary[] }>(
      res,
      "Failed to fetch timekeeping history",
    )
  ).data;
}

export async function fetchTimekeepingBatch(
  id: number,
): Promise<TimekeepingBatchDetail> {
  const res = await apiFetch(`/api/admin/timekeeping/${id}`, {
    cache: "no-store",
  });
  return (
    await timekeepingJson<{ data: TimekeepingBatchDetail }>(
      res,
      "Failed to fetch timekeeping",
    )
  ).data;
}

// Sent as multipart/form-data so overtime proof files can ride along.
// `records` goes as a JSON string; each proof is `proofs[]`, matched by
// `overtime_proof_index`. Do NOT set Content-Type: the browser adds the
// multipart boundary itself.
export async function submitTimekeeping(
  payload: SubmitTimekeepingPayload,
): Promise<TimekeepingBatchSummary> {
  const { records, proofs = [], ...rest } = payload;

  const form = new FormData();
  Object.entries(rest).forEach(([k, v]) => form.append(k, String(v)));
  form.append("records", JSON.stringify(records));
  proofs.forEach((f) => form.append("proofs[]", f));

  const res = await apiFetch("/api/admin/timekeeping", {
    method: "POST",
    headers: { Accept: "application/json" }, // no Content-Type
    body: form,
  });
  return (
    await timekeepingJson<{ data: TimekeepingBatchSummary }>(
      res,
      "Failed to submit timekeeping",
    )
  ).data;
}

export async function deleteTimekeepingBatch(id: number): Promise<void> {
  const res = await apiFetch(`/api/admin/timekeeping/${id}`, {
    method: "DELETE",
  });
  await timekeepingJson<unknown>(res, "Failed to delete timekeeping");
}

// Same-origin proxy URL of an overtime proof (needs the Next.js proxy route
// to forward /api/admin/timekeeping/{id}/records/{record}/proof).
export const timekeepingProofUrl = (batchId: number, recordId: number) =>
  `/api/admin/timekeeping/${batchId}/records/${recordId}/proof`;
// ── Employee milestones ──────────────────────────────────────────
// Admin side (View dialog) uses fetch directly in employee-milestones.tsx.
// This one is for the employee's own dashboard.

export interface EmployeeMilestoneRecord {
  id: number;
  date: string; // YYYY-MM-DD
  particulars: string;
  notes: string | null;
}

export async function fetchMyMilestones(): Promise<EmployeeMilestoneRecord[]> {
  const res = await apiFetch("/api/admin/my-milestones", {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.message || `Failed to fetch milestones: ${res.status}`,
    );
  }
  return (data.data ?? []) as EmployeeMilestoneRecord[];
}
export async function setEmployeeFixed(
  id: number,
  isFixed: boolean,
): Promise<void> {
  const res = await apiFetch(`/api/admin/payroll/employees/${id}/fixed`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_fixed: isFixed }),
  });
  await payrollJson<unknown>(res, "Failed to update fixed status");
}
