"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { eachDayOfInterval, format, getDay, subMonths } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmployeeAvatar } from "@/components/admin/employee-media";
import type { Employee } from "@/components/admin/employee-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ───────────────────────── constants & types ───────────────────────── */

// POST = submit a timekeeping batch
// GET  = list of submitted batches (History tab)
// GET /<id> = one batch with all of its records (History detail)
// GET /<id>/records/<record>/proof = overtime proof file of one record
const SUBMIT_URL = "/api/admin/timekeeping";
// Overtime filed by employees in "My Overtime" (HR approves / rejects here)
// GET ?start_date=&end_date= -> requests of everyone in the period
// GET /<id>/proof            -> proof file of one request
// PATCH /<id> {status}       -> HR sets "Approved" / "Rejected"
const OT_URL = "/api/admin/overtime-requests";
const DEFAULT_OFFICIAL_START = "08:00";
const DEFAULT_OFFICIAL_END = "17:00";
const DEFAULT_GRACE_MINS = 5;
// Hours a flexible-schedule employee must render per day.
const DEFAULT_FLEX_HOURS = 8;
// Half-day leave. AM leave = works the afternoon (1:00 PM – 5:00 PM),
// PM leave = works the morning (8:00 AM – 12:00 NN). 12–1 PM is lunch.
const HALF_DAY_AM_END = "12:00";
const HALF_DAY_PM_START = "13:00";
const LUNCH_START = "12:00";
const LUNCH_END = "13:00";
// Two punches closer together than this are treated as ONE punch
// (double tap on the biometric), not as a Time In + Time Out pair.
const SINGLE_PUNCH_WINDOW_MIN = 60;
const MAX_RANGE_DAYS = 62;
// Employees marked "flexible" are remembered in this browser.
const FLEX_KEY = "timekeepingFlexibleEmployees";
// Overtime proof (screenshot / photo / PDF of the approval).
const MAX_PROOF_MB = 5;
const MAX_OT_MINS = 24 * 60;

type Tab = "timekeeping" | "history";
const TABS: { key: Tab; label: string }[] = [
  { key: "timekeeping", label: "Timekeeping" },
  { key: "history", label: "History" },
];

// Period toggle: first half (1-15) or second half (16 up to the last day).
type Cutoff = "1-15" | "16-end";
const CUTOFFS: Cutoff[] = ["1-15", "16-end"];
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

type XlsxModule = typeof import("xlsx");
type Punches = Map<string, Map<string, string[]>>; // employee no -> date -> ["HH:mm:ss"]

// One uploaded biometric file (several can be added; their punches are merged).
type ParsedFile = {
  name: string;
  punches: Punches;
  rowsRead: number;
  rowsUsed: number;
  minDate: string;
  maxDate: string;
};

type LeaveLite = {
  employee_number: string;
  start_date: string;
  end_date: string;
  status: string;
  half_day_period: "AM" | "PM" | null;
  early_leave_time: string | null;
};
type EmployeeInfo = { name: string; department: string; position: string };
type Filter = "all" | "missing" | "complete";

type DayRow = {
  key: string;
  employee: string;
  date: string;
  timeIn: string | null; // "HH:mm" after any auto-fill
  timeOut: string | null;
  autoIn: boolean;
  autoOut: boolean;
  isLeave: boolean;
  halfDay: "AM" | "PM" | null; // approved half-day leave on this date
  isFlexible: boolean; // flexible schedule: no fixed time in, hours-based
  hasGap: boolean; // a punch is missing in the raw data
  isFilled: boolean; // the gap was auto-filled
  days: number;
  minsLate: number;
  undertime: number;
  deduction: number;
};

// Overtime filed for one day (kept in memory until it is submitted).
type OvertimeEntry = {
  minutes: number;
  note: string;
  proof: File;
};

// Overtime request filed by an employee in "My Overtime".
type OtRequest = {
  id: number;
  employee_number: string;
  date: string;
  minutes: number | string;
  note: string | null;
  proof_name: string | null;
  created_at?: string | null;
  status: "Pending review" | "Approved" | "Rejected" | "Cancelled";
};

// ── History (what the backend returns) ──
type BatchSummary = {
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
};

type HistoryRecord = {
  id?: number; // needed to load the overtime proof
  employee_number: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  no_of_days: number | string;
  mins_late: number | string;
  undertime_minutes?: number | string;
  grace_deduction: number | string;
  is_leave: boolean | number | string;
  auto_filled_in: boolean | number | string;
  auto_filled_out: boolean | number | string;
  overtime_minutes?: number | string;
  overtime_note?: string | null;
  overtime_proof_name?: string | null;
  has_proof?: boolean | number | string;
};

type BatchDetail = BatchSummary & { records: HistoryRecord[] };

// A proof that was downloaded from the server and is shown full size.
type ProofView = { url: string; name: string; mime: string };

// ── In-app confirm dialog ──
type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

/* ───────────────────────── small helpers ───────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");
const parseDay = (v: string) => new Date(`${v}T00:00:00`);
const dayValue = (d: Date) => format(d, "yyyy-MM-dd");
const minutesOf = (t: string) =>
  Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt12 = (t: string | null) =>
  t
    ? format(
        new Date(2000, 0, 1, Number(t.slice(0, 2)), Number(t.slice(3, 5))),
        "h:mm a",
      )
    : "";

// 90 -> "1h 30m", 120 -> "2h", 45 -> "45m"
const fmtDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

// History helpers (values from Laravel can be strings / 0 / 1).
const toNum = (v: unknown) => Number(v) || 0;
const isYes = (v: unknown) => v === true || v === 1 || v === "1";
const dateOnly = (v: string) => String(v ?? "").slice(0, 10);
const fmtRange = (start: string, end: string) =>
  `${format(parseDay(dateOnly(start)), "MMM d")} – ${format(parseDay(dateOnly(end)), "MMM d, yyyy")}`;
const fmtStamp = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
};

// History sub-tabs: group submitted batches by cut-off.
// 1-15 = starts on the 1st–15th, 16-end = starts on the 16th or later (16-28 / 29 / 30 / 31).
type CutoffTab = "all" | "1-15" | "16-end";
const CUTOFF_TABS: { key: CutoffTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "1-15", label: "1–15" },
  { key: "16-end", label: "16–30/31" },
];
const cutoffOf = (b: { start_date: string }): Exclude<CutoffTab, "all"> =>
  Number(dateOnly(b.start_date).slice(8, 10)) <= 15 ? "1-15" : "16-end";

function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("adminSessionActive")
      : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

async function readJson<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // An HTML page came back (404 / 500) instead of JSON.
    throw new Error(
      response.ok
        ? "The server returned an unexpected response."
        : `Request failed (${response.status}). The API route may not exist yet.`,
    );
  }
  if (!response.ok) {
    const errors = data?.errors
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

// ── Period (month + year + cut-off) ──

// Last day of a month (month is 1-12): 28 / 29 / 30 / 31.
const lastDayOf = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

// First and last date of the chosen cut-off as "yyyy-MM-dd".
function cutoffRange(year: number, month: number, cutoff: Cutoff) {
  const ym = `${year}-${pad(month)}`;

  return cutoff === "1-15"
    ? { start: `${ym}-01`, end: `${ym}-15` }
    : { start: `${ym}-16`, end: `${ym}-${pad(lastDayOf(year, month))}` };
}

// Button text with the REAL last day of the month: 1-15, 16-28, 16-30, 16-31.
const cutoffLabel = (year: number, month: number, cutoff: Cutoff) =>
  cutoff === "1-15" ? "1-15" : `16-${lastDayOf(year, month)}`;
// Biometric file names must be: Month-StartDay-EndDay-Year, e.g. October-16-31-2026.dat
const FILE_NAME_EXAMPLE = "October-16-31-2026.dat";

// Returns an error message, or null when the name is valid.
function checkFileName(name: string): string | null {
  const m = name.match(
    /^([A-Za-z]+)-(\d{1,2})-(\d{1,2})-(\d{4})\.(xlsx|xls|csv|dat|txt)$/i,
  );
  if (!m) {
    return `"${name}" has the wrong file name. Use Month-StartDay-EndDay-Year, for example ${FILE_NAME_EXAMPLE}.`;
  }

  const monthIndex = MONTHS.findIndex(
    (month) => month.toLowerCase() === m[1].toLowerCase(),
  );
  if (monthIndex === -1) {
    return `"${name}": "${m[1]}" is not a month. Use the full month name, for example October.`;
  }

  const year = Number(m[4]);
  const startDay = Number(m[2]);
  const endDay = Number(m[3]);
  const lastDay = lastDayOf(year, monthIndex + 1);
  const validCutoff =
    (startDay === 1 && endDay === 15) ||
    (startDay === 16 && endDay === lastDay);

  if (!validCutoff) {
    return `"${name}": the days must be 1-15 or 16-${lastDay} for ${MONTHS[monthIndex]} ${year}.`;
  }

  return null;
}
/** Semi-monthly cut-off: 1st–15th, or 16th–end of month. Defaults to the last finished one. */
function defaultPeriod(today = new Date()): {
  year: number;
  month: number;
  cutoff: Cutoff;
} {
  if (today.getDate() <= 15) {
    const prev = subMonths(today, 1);
    return {
      year: prev.getFullYear(),
      month: prev.getMonth() + 1,
      cutoff: "16-end",
    };
  }
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    cutoff: "1-15",
  };
}

/** Biometric IDs are 6 digits (250057); employee numbers look like 25-0057. */
function toEmployeeNumber(raw: string) {
  const s = raw.trim();
  return /^\d{6}$/.test(s) ? `${s.slice(0, 2)}-${s.slice(2)}` : s;
}

/* ───────────────────────── Excel parsing ───────────────────────── */

function readCell(
  XLSX: XlsxModule,
  value: unknown,
): { date?: string; time?: string } {
  const out: { date?: string; time?: string } = {};

  if (typeof value === "number") {
    if (value >= 20000) {
      // Excel date serial (with or without a time fraction)
      const p = XLSX.SSF.parse_date_code(value);
      if (p) {
        out.date = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
        if (value % 1)
          out.time = `${pad(p.H)}:${pad(p.M)}:${pad(Math.floor(p.S))}`;
      }
    } else if (value > 0 && value < 1) {
      // time-only cell
      const total = Math.round(value * 86400);
      out.time = `${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
    }
    return out;
  }

  if (typeof value === "string") {
    const s = value.trim();
    const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const us = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); // m/d/yyyy, same as the payroll sheet
    if (iso) out.date = `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
    else if (us) out.date = `${us[3]}-${pad(+us[1])}-${pad(+us[2])}`;

    const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (t) {
      let h = Number(t[1]);
      const ampm = t[4]?.toUpperCase();
      if (ampm) h = (h % 12) + (ampm === "PM" ? 12 : 0);
      out.time = `${pad(h)}:${t[2]}:${t[3] ?? "00"}`;
    }
  }
  return out;
}

async function parseBiometricFile(file: File) {
  const XLSX = await import("xlsx");

  let rows: unknown[][];

  if (/\.(dat|txt)$/i.test(file.name)) {
    // ZKTeco attlog: one punch per line, separated by tabs or spaces.
    const text = await file.text();
    rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/));
  } else {
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = book.Sheets[book.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
  }

  const punches: Punches = new Map();
  let rowsUsed = 0;
  let minDate = "";
  let maxDate = "";

  for (const original of rows) {
    let cells = original as unknown[];
    const filledCells = cells.filter((c) => c !== null && c !== "");
    // a whole punch pasted into ONE cell: "260101 2026-10-16 06:51:08 1 255 1 0"
    if (filledCells.length === 1 && typeof filledCells[0] === "string") {
      cells = (filledCells[0] as string).trim().split(/\s+/);
    }

    const first = cells[0];
    const idRaw =
      typeof first === "number"
        ? String(Math.trunc(first))
        : String(first ?? "").trim();
    if (!/^\d{4,8}$/.test(idRaw) && !/^\d{2}-\d{4}$/.test(idRaw)) continue; // header / junk

    let date: string | undefined;
    let time: string | undefined;
    for (const cell of cells.slice(1)) {
      const c = readCell(XLSX, cell);
      date = date ?? c.date;
      time = time ?? c.time;
    }
    if (!date || !time) continue;

    const emp = toEmployeeNumber(idRaw);
    if (!punches.has(emp)) punches.set(emp, new Map());
    const byDate = punches.get(emp)!;
    byDate.set(date, [...(byDate.get(date) ?? []), time].sort());

    rowsUsed += 1;
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
  }

  return { punches, rowsRead: rows.length, rowsUsed, minDate, maxDate };
}

/* ───────────────────────── Confirm dialog ───────────────────────── */

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmState & { onCancel: () => void }) {
  // Esc closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onCancel}
    >
      <div
        aria-labelledby="confirm-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        role="alertdialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertCircle className="h-5 w-5 text-amber-700" />
          </span>
          <div className="min-w-0">
            <h3
              className="text-base font-semibold text-slate-900"
              id="confirm-title"
            >
              {title}
            </h3>
            <p className="mt-1 text-sm text-slate-600">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            autoFocus
            className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Proof lightbox (full size) ───────────────────────── */

// Full-screen viewer for an overtime proof (image or PDF).
// Click the image to zoom in / out. Esc or a click outside closes it.
function Lightbox({
  src,
  name,
  mime,
  onClose,
}: {
  src: string;
  name: string;
  mime: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(false);
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name);

  // Esc closes ONLY the viewer (capture phase, so a dialog under it stays open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const action =
    "inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/20";

  return (
    <div
      aria-label="Proof viewer"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex flex-col bg-slate-950/90"
      role="dialog"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 truncate text-sm font-medium">{name}</p>
        <div className="flex shrink-0 items-center gap-2">
          <a className={action} href={src} rel="noreferrer" target="_blank">
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">Open in new tab</span>
          </a>
          <a className={action} download={name} href={src}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </a>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
            type="button"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-auto p-4">
        {isPdf ? (
          <iframe
            className="m-auto h-full w-full max-w-5xl rounded-lg bg-white"
            src={src}
            title={name}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={name}
            className={
              zoom
                ? "m-auto max-w-none cursor-zoom-out"
                : "m-auto max-h-full max-w-full cursor-zoom-in object-contain"
            }
            src={src}
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => !z);
            }}
          />
        )}
      </div>

      {!isPdf && (
        <p className="pb-3 text-center text-xs text-slate-300">
          Click the image to {zoom ? "fit it to the screen" : "zoom in"} · Esc
          to close
        </p>
      )}
    </div>
  );
}

// Same viewer for a File that was picked in this browser (not uploaded yet).
function FileLightbox({ file, onClose }: { file: File; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!url) return null;
  return (
    <Lightbox mime={file.type} name={file.name} src={url} onClose={onClose} />
  );
}

/* ───────────────────────── Overtime request dialog (HR review) ───────────────────────── */

function OtRequestDialog({
  req,
  employeeName,
  onClose,
  onApprove,
  onReject,
}: {
  req: OtRequest;
  employeeName: string;
  onClose: () => void;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = req.status === "Pending review";
  const isPdf = mime === "application/pdf";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      // No proof attached: nothing to download.
      if (!req.proof_name) {
        setLoading(false);
        return;
      }
      try {
        const res = await adminFetch(`${OT_URL}/${req.id}/proof`, {
          cache: "no-store",
        });
        if (!res.ok)
          throw new Error(`Unable to load the proof (${res.status}).`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setMime(blob.type);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Unable to load the proof.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [req.id, req.proof_name]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top: which date was filed + when it was filed */}
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            Filed overtime · {fmtDuration(toNum(req.minutes))}
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">{employeeName}</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <span>
              OT date:{" "}
              <span className="font-semibold text-slate-800">
                {format(parseDay(dateOnly(req.date)), "EEE, MMM d, yyyy")}
              </span>
            </span>
            <span>
              Filed on:{" "}
              <span className="font-semibold text-slate-800">
                {fmtStamp(req.created_at ?? null)}
              </span>
            </span>
          </div>
          {req.note && (
            <p className="mt-2 text-xs text-slate-500">Reason: {req.note}</p>
          )}
        </div>

        {/* Middle: proof image */}
        <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : url && isPdf ? (
            <iframe
              className="h-[60vh] w-full rounded-lg bg-white"
              src={url}
              title="Overtime proof"
            />
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Overtime proof"
              className="max-h-[60vh] max-w-full rounded-lg object-contain"
              src={url}
            />
          ) : (
            <p className="text-sm text-slate-500">No proof attached.</p>
          )}
        </div>

        {/* Bottom: buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <Button disabled={busy} variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {pending && (
            <>
              <Button
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={busy}
                variant="outline"
                onClick={() => void run(onReject)}
              >
                Decline
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={busy}
                onClick={() => void run(onApprove)}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Approve
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Overtime dialog (HR manual entry) ───────────────────────── */

const OT_QUICK_PICKS = [
  { label: "30 mins", minutes: 30 },
  { label: "1 hr", minutes: 60 },
  { label: "2 hrs", minutes: 120 },
  { label: "3 hrs", minutes: 180 },
];

function OvertimeDialog({
  employeeName,
  date,
  initial,
  onSave,
  onRemove,
  onCancel,
}: {
  employeeName: string;
  date: string;
  initial: OvertimeEntry | null;
  onSave: (entry: OvertimeEntry) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [hours, setHours] = useState(
    initial ? String(Math.floor(initial.minutes / 60)) : "0",
  );
  const [mins, setMins] = useState(
    initial ? String(initial.minutes % 60) : "0",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [proof, setProof] = useState<File | null>(initial?.proof ?? null);
  const [preview, setPreview] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const [error, setError] = useState("");
  const proofInput = useRef<HTMLInputElement>(null);

  const total = (Number(hours) || 0) * 60 + (Number(mins) || 0);

  // Esc closes the dialog (the full-size viewer handles its own Esc first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Image preview of the proof (PDFs just show the file name).
  useEffect(() => {
    if (!proof || !proof.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(proof);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proof]);

  const setTotal = (minutes: number) => {
    setHours(String(Math.floor(minutes / 60)));
    setMins(String(minutes % 60));
    setError("");
  };

  const pickProof = (file: File | undefined) => {
    if (proofInput.current) proofInput.current.value = "";
    if (!file) return;
    const okType =
      file.type.startsWith("image/") || file.type === "application/pdf";
    if (!okType) {
      setError("Proof must be an image (JPG, PNG) or a PDF.");
      return;
    }
    if (file.size > MAX_PROOF_MB * 1024 * 1024) {
      setError(`Proof is too large. Maximum is ${MAX_PROOF_MB} MB.`);
      return;
    }
    setProof(file);
    setError("");
  };

  const save = () => {
    if (total <= 0) {
      setError("Enter how long the overtime was (hours and/or minutes).");
      return;
    }
    if (total > MAX_OT_MINS) {
      setError("Overtime cannot be more than 24 hours.");
      return;
    }
    if (!proof) {
      setError("Please attach proof of overtime.");
      return;
    }
    onSave({ minutes: total, note: note.trim(), proof });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        onClick={onCancel}
      >
        <div
          aria-labelledby="ot-title"
          aria-modal="true"
          className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          role="dialog"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100">
              <Clock className="h-5 w-5 text-cyan-800" />
            </span>
            <div className="min-w-0">
              <h3
                className="text-base font-semibold text-slate-900"
                id="ot-title"
              >
                {initial ? "Edit overtime" : "Add overtime"}
              </h3>
              <p className="mt-0.5 text-sm text-slate-600">
                {employeeName} · {format(parseDay(date), "EEE, MMM d, yyyy")}
              </p>
            </div>
          </div>

          {/* Duration */}
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium text-slate-600">
              How long was the overtime?
            </p>
            <div className="flex items-end gap-3">
              <label className="w-24 space-y-1 text-xs text-slate-500">
                Hours
                <Input
                  inputMode="numeric"
                  max={24}
                  min={0}
                  type="number"
                  value={hours}
                  onChange={(e) => {
                    setHours(e.target.value);
                    setError("");
                  }}
                />
              </label>
              <label className="w-24 space-y-1 text-xs text-slate-500">
                Minutes
                <Input
                  inputMode="numeric"
                  max={59}
                  min={0}
                  type="number"
                  value={mins}
                  onChange={(e) => {
                    setMins(e.target.value);
                    setError("");
                  }}
                />
              </label>
              <div className="pb-2 text-sm font-semibold text-cyan-800">
                = {total > 0 ? fmtDuration(total) : "0m"}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {OT_QUICK_PICKS.map((q) => (
                <button
                  key={q.minutes}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    total === q.minutes
                      ? "bg-cyan-700 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                  type="button"
                  onClick={() => setTotal(q.minutes)}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <label className="mt-5 block space-y-1 text-xs font-medium text-slate-600">
            Reason / task (optional)
            <textarea
              className="min-h-[72px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
              maxLength={500}
              placeholder="e.g. Month-end report, event coverage"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {/* Proof */}
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium text-slate-600">
              Proof of overtime <span className="text-red-600">*</span>
            </p>
            <input
              ref={proofInput}
              accept="image/*,application/pdf"
              className="hidden"
              type="file"
              onChange={(e) => pickProof(e.target.files?.[0])}
            />

            {proof ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <button
                  aria-label="View proof full size"
                  className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
                  title="Click to view full size"
                  type="button"
                  onClick={() => setViewing(true)}
                >
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt="Overtime proof preview"
                      className="h-16 w-16 cursor-zoom-in rounded-lg border border-slate-200 object-cover transition-opacity hover:opacity-80"
                      src={preview}
                    />
                  ) : (
                    <span className="flex h-16 w-16 cursor-zoom-in items-center justify-center rounded-lg bg-red-50 transition-opacity hover:opacity-80">
                      <FileText className="h-7 w-7 text-red-600" />
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1 basis-32">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {proof.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(proof.size / 1024 / 1024).toFixed(2)} MB · click the
                    thumbnail to enlarge
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => setViewing(true)}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => proofInput.current?.click()}
                  >
                    Change
                  </Button>
                </div>
              </div>
            ) : (
              <button
                className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-cyan-600 hover:bg-cyan-50"
                type="button"
                onClick={() => proofInput.current?.click()}
              >
                <Upload className="h-5 w-5 text-sky-700" />
                <span className="text-sm font-semibold text-slate-900">
                  Attach proof
                </span>
                <span className="text-xs text-slate-500">
                  Screenshot, photo or PDF of the approval · max {MAX_PROOF_MB}{" "}
                  MB
                </span>
              </button>
            )}
          </div>

          {error && (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <div>
              {initial && (
                <Button
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  type="button"
                  variant="ghost"
                  onClick={onRemove}
                >
                  Remove overtime
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                type="button"
                onClick={save}
              >
                Save overtime
              </Button>
            </div>
          </div>
        </div>
      </div>

      {viewing && proof && (
        <FileLightbox file={proof} onClose={() => setViewing(false)} />
      )}
    </>
  );
}

/* ───────────────────────── History tab ───────────────────────── */

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

function TimekeepingHistory({
  people,
  masterfile,
}: {
  people: Record<string, EmployeeInfo>;
  masterfile: Record<string, Employee>;
}) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [cutoffTab, setCutoffTab] = useState<CutoffTab>("all");

  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [empId, setEmpId] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  const requestRef = useRef(0);

  // Overtime proof opened full size (downloaded with the admin token, because
  // a plain <img src> cannot send the Authorization header).
  const [proofView, setProofView] = useState<ProofView | null>(null);
  const [proofLoading, setProofLoading] = useState<number | null>(null);
  const proofUrlRef = useRef<string | null>(null);

  const releaseProof = useCallback(() => {
    if (proofUrlRef.current) URL.revokeObjectURL(proofUrlRef.current);
    proofUrlRef.current = null;
    setProofView(null);
  }, []);

  // Free the blob URL when the History tab is left.
  useEffect(() => {
    return () => {
      if (proofUrlRef.current) URL.revokeObjectURL(proofUrlRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await readJson<{ data: BatchSummary[] }>(
        await adminFetch(SUBMIT_URL, { cache: "no-store" }),
      );
      setBatches(res.data ?? []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load timekeeping history.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openBatch = async (id: number) => {
    const requestId = ++requestRef.current;
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    setEmpId("");
    setEmpSearch("");
    try {
      const res = await readJson<{ data: BatchDetail }>(
        await adminFetch(`${SUBMIT_URL}/${id}`, { cache: "no-store" }),
      );
      if (requestId !== requestRef.current) return;
      setDetail(res.data);
      setEmpId(res.data.records?.[0]?.employee_number ?? "");
    } catch (e) {
      if (requestId !== requestRef.current) return;
      toast.error(
        e instanceof Error ? e.message : "Unable to load that timekeeping.",
      );
      setOpenId(null);
    } finally {
      if (requestId === requestRef.current) setDetailLoading(false);
    }
  };

  const closeBatch = () => {
    requestRef.current += 1;
    releaseProof();
    setOpenId(null);
    setDetail(null);
    setDetailLoading(false);
  };

  const openProof = async (r: HistoryRecord) => {
    if (!detail || r.id == null) return;
    const recordId = r.id;
    setProofLoading(recordId);
    try {
      const res = await adminFetch(
        `${SUBMIT_URL}/${detail.id}/records/${recordId}/proof`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        let message = `Unable to load the proof (${res.status}).`;
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {
          /* not JSON */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (proofUrlRef.current) URL.revokeObjectURL(proofUrlRef.current);
      proofUrlRef.current = url;
      setProofView({
        url,
        mime: blob.type,
        name:
          r.overtime_proof_name ||
          `overtime-proof-${r.employee_number}-${dateOnly(r.date)}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to load the proof.");
    } finally {
      setProofLoading(null);
    }
  };

  const cutoffCounts = useMemo(
    () => ({
      all: batches.length,
      "1-15": batches.filter((b) => cutoffOf(b) === "1-15").length,
      "16-end": batches.filter((b) => cutoffOf(b) === "16-end").length,
    }),
    [batches],
  );

  const filteredBatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return batches
      .filter((b) => cutoffTab === "all" || cutoffOf(b) === cutoffTab)
      .filter(
        (b) =>
          !q ||
          [
            b.source_file ?? "",
            b.submitted_by ?? "",
            fmtRange(b.start_date, b.end_date),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
      );
  }, [batches, search, cutoffTab]);

  /* detail: records grouped per employee */
  const byEmployee = useMemo(() => {
    const map = new Map<string, HistoryRecord[]>();
    (detail?.records ?? []).forEach((r) => {
      map.set(r.employee_number, [...(map.get(r.employee_number) ?? []), r]);
    });
    map.forEach((list) =>
      list.sort((a, b) => dateOnly(a.date).localeCompare(dateOnly(b.date))),
    );
    return map;
  }, [detail]);

  const employeeList = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return Array.from(byEmployee.keys())
      .map((id) => ({ id, name: people[id]?.name ?? "" }))
      .filter(
        (e) =>
          !q ||
          e.id.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [byEmployee, people, empSearch]);

  const rows = useMemo(() => byEmployee.get(empId) ?? [], [byEmployee, empId]);
  const totals = useMemo(
    () => ({
      days: rows.reduce((n, r) => n + toNum(r.no_of_days), 0),
      leave: rows.filter((r) => isYes(r.is_leave)).length,
      late: rows.reduce((n, r) => n + toNum(r.mins_late), 0),
      undertime: rows.reduce((n, r) => n + toNum(r.undertime_minutes), 0),
      deduction: rows.reduce((n, r) => n + toNum(r.grace_deduction), 0),
      overtime: rows.reduce((n, r) => n + toNum(r.overtime_minutes), 0),
      autoPunches: rows.reduce(
        (n, r) =>
          n +
          (isYes(r.auto_filled_in) ? 1 : 0) +
          (isYes(r.auto_filled_out) ? 1 : 0),
        0,
      ),
    }),
    [rows],
  );
  const person = people[empId];

  const exportBatch = async () => {
    if (!detail) return;
    try {
      const XLSX = await import("xlsx");
      const header = [
        "ID Number",
        "Name",
        "Date",
        "Time In",
        "Time Out",
        "No. of Days",
        "Mins. Late",
        `w/ ${toNum(detail.grace_minutes)} mins. grace`,
        "Undertime (mins)",
        "Leave",
        "Auto-filled",
        "Overtime (mins)",
        "OT reason",
      ];
      const data = [...detail.records]
        .sort(
          (a, b) =>
            a.employee_number.localeCompare(b.employee_number) ||
            dateOnly(a.date).localeCompare(dateOnly(b.date)),
        )
        .map((r) => [
          r.employee_number,
          people[r.employee_number]?.name ?? "",
          format(parseDay(dateOnly(r.date)), "MM/dd/yyyy"),
          isYes(r.is_leave) ? "" : fmt12(r.time_in),
          isYes(r.is_leave) ? "LEAVE" : fmt12(r.time_out),
          toNum(r.no_of_days),
          toNum(r.mins_late),
          toNum(r.grace_deduction),
          toNum(r.undertime_minutes),
          isYes(r.is_leave) ? "Yes" : "",
          isYes(r.auto_filled_in) || isYes(r.auto_filled_out) ? "Yes" : "",
          toNum(r.overtime_minutes) || "",
          r.overtime_note ?? "",
        ]);
      const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Timekeeping");
      XLSX.writeFile(
        book,
        `Timekeeping_${dateOnly(detail.start_date)}_to_${dateOnly(detail.end_date)}.xlsx`,
      );
    } catch {
      toast.error("Unable to export the timekeeping.");
    }
  };

  /* ── detail view ── */
  if (openId !== null) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={closeBatch}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to history
          </Button>
          <Button
            disabled={!detail}
            variant="outline"
            onClick={() => void exportBatch()}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
        </div>

        {detailLoading || !detail ? (
          <Card className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading timekeeping...
          </Card>
        ) : (
          <>
            <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">
                {fmtRange(detail.start_date, detail.end_date)}
              </h2>
              <p className="mb-4 text-xs text-slate-500">
                {detail.source_file ?? "No file name"} · submitted{" "}
                {fmtStamp(detail.created_at)}
                {detail.submitted_by ? ` by ${detail.submitted_by}` : ""}
                {empId ? ` · Showing ${person?.name || empId}` : ""}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatBox label="Records" value={rows.length} />
                <StatBox
                  label="Official hours"
                  value={`${fmt12(detail.official_start) || "—"} – ${fmt12(detail.official_end) || "—"}`}
                />
                <StatBox
                  label="Grace (mins)"
                  value={toNum(detail.grace_minutes)}
                />
                <StatBox label="Days present" value={totals.days} />
                <StatBox label="Mins. late" value={totals.late} />
                <StatBox
                  label="Late deduction (mins)"
                  value={totals.deduction}
                />
              </div>
            </Card>

            <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              {/* Employee list */}
              <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-slate-900">
                  Employees
                </h3>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    aria-label="Search employees"
                    className="pl-9"
                    placeholder="Search ID or name"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                  />
                </div>
                <ul className="max-h-[640px] space-y-1 overflow-y-auto">
                  {employeeList.length === 0 && (
                    <li className="p-3 text-sm text-slate-500">
                      No employees match.
                    </li>
                  )}
                  {employeeList.map((e) => (
                    <li key={e.id}>
                      <button
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${e.id === empId ? "border-cyan-600 bg-cyan-50" : "border-transparent"}`}
                        type="button"
                        onClick={() => setEmpId(e.id)}
                      >
                        {masterfile[e.id] ? (
                          <EmployeeAvatar
                            className="flex h-9 w-9 shrink-0 items-center justify-center bg-cyan-100 text-xs font-semibold text-cyan-900"
                            employee={masterfile[e.id]}
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-900">
                            {(e.name || e.id)
                              .replace(/[^A-Za-z0-9 ]/g, "")
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((p) => p[0]?.toUpperCase())
                              .join("")}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {e.name || e.id}
                          </span>
                          {e.name && (
                            <span className="block text-xs text-slate-500">
                              {e.id}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Records */}
              <Card className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="truncate text-base font-semibold text-slate-900">
                    {person?.name || empId || "Select an employee"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    ID {empId}
                    {person
                      ? ` · ${person.position}, ${person.department}`
                      : ""}
                    {" · Purple times were auto-filled"}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Time In</th>
                        <th className="px-4 py-3 font-semibold">Time Out</th>
                        <th className="px-4 py-3 text-center font-semibold">
                          No. of Days
                        </th>
                        <th className="px-4 py-3 text-center font-semibold">
                          Mins. Late
                        </th>
                        <th className="px-4 py-3 text-center font-semibold">
                          w/ {toNum(detail.grace_minutes)} mins. grace
                        </th>
                        <th className="px-4 py-3 text-center font-semibold">
                          Undertime (mins)
                        </th>
                        <th className="px-4 py-3 text-center font-semibold">
                          Overtime (OT)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => {
                        const leave = isYes(r.is_leave);
                        const autoIn = isYes(r.auto_filled_in);
                        const autoOut = isYes(r.auto_filled_out);
                        const auto = "font-semibold text-violet-700";
                        const otMins = toNum(r.overtime_minutes);
                        const hasProof =
                          isYes(r.has_proof) || !!r.overtime_proof_name;

                        return (
                          <tr
                            key={`${r.employee_number}|${r.date}`}
                            className={`whitespace-nowrap text-slate-800 ${autoIn || autoOut ? "bg-violet-50/50" : ""}`}
                          >
                            <td className="px-4 py-2.5">
                              {format(parseDay(dateOnly(r.date)), "MM/dd/yyyy")}{" "}
                              <span className="text-xs text-slate-400">
                                {format(parseDay(dateOnly(r.date)), "EEE")}
                              </span>
                            </td>
                            {leave ? (
                              <>
                                <td className="px-4 py-2.5" />
                                <td className="px-4 py-2.5 font-medium text-red-600">
                                  LEAVE
                                </td>
                              </>
                            ) : (
                              <>
                                <td
                                  className={`px-4 py-2.5 ${autoIn ? auto : !r.time_in ? "text-amber-700" : ""}`}
                                >
                                  {r.time_in ? fmt12(r.time_in) : "No punch"}
                                </td>
                                <td
                                  className={`px-4 py-2.5 ${autoOut ? auto : !r.time_out ? "text-amber-700" : ""}`}
                                >
                                  {r.time_out ? fmt12(r.time_out) : "No punch"}
                                </td>
                              </>
                            )}
                            <td className="px-4 py-2.5 text-center font-semibold">
                              {toNum(r.no_of_days)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {leave ? "—" : toNum(r.mins_late)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {leave ? "—" : toNum(r.grace_deduction)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {leave ? "—" : toNum(r.undertime_minutes)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {otMins > 0 ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800 ring-1 ring-inset ring-cyan-200"
                                    title={r.overtime_note || undefined}
                                  >
                                    {fmtDuration(otMins)}
                                  </span>
                                  {hasProof && r.id != null ? (
                                    <Button
                                      className="h-7 border-cyan-300 px-2 text-cyan-800 hover:bg-cyan-50"
                                      disabled={proofLoading === r.id}
                                      size="sm"
                                      title={
                                        r.overtime_proof_name ||
                                        "View overtime proof"
                                      }
                                      type="button"
                                      variant="outline"
                                      onClick={() => void openProof(r)}
                                    >
                                      {proofLoading === r.id ? (
                                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Eye className="mr-1 h-3.5 w-3.5" />
                                      )}
                                      Proof
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-slate-400">
                                      No proof
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {rows.length === 0 && (
                        <tr>
                          <td
                            className="px-4 py-10 text-center text-sm text-slate-500"
                            colSpan={8}
                          >
                            No records for this employee.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
                  {[
                    ["Days present", totals.days, ""],
                    ["Leave days", totals.leave, ""],
                    ["Mins. late", totals.late, ""],
                    ["Late deduction (mins)", totals.deduction, ""],
                    ["Undertime (mins)", totals.undertime, ""],
                    [
                      "Overtime",
                      totals.overtime > 0 ? fmtDuration(totals.overtime) : "0",
                      "text-cyan-800",
                    ],
                    [
                      "Auto-filled punches",
                      totals.autoPunches,
                      "text-violet-700",
                    ],
                  ].map(([label, value, tone]) => (
                    <div key={label as string}>
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className={`text-lg font-bold ${tone}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}

        {proofView && (
          <Lightbox
            mime={proofView.mime}
            name={proofView.name}
            src={proofView.url}
            onClose={releaseProof}
          />
        )}
      </div>
    );
  }

  /* ── list view ── */
  return (
    <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex gap-1 border-b border-slate-200 px-4">
        {CUTOFF_TABS.map((t) => (
          <button
            key={t.key}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              cutoffTab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            type="button"
            onClick={() => setCutoffTab(t.key)}
          >
            {t.label}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                cutoffTab === t.key
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {cutoffCounts[t.key]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 sm:p-5">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            aria-label="Search history"
            className="pl-9"
            placeholder="Search by period, file name or submitted by"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          className="ml-auto h-10"
          disabled={loading}
          variant="outline"
          onClick={() => void load()}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Period</th>
              <th className="px-4 py-3 font-semibold">Source file</th>
              <th className="px-4 py-3 text-center font-semibold">Employees</th>
              <th className="px-4 py-3 text-center font-semibold">Records</th>
              <th className="px-4 py-3 text-center font-semibold">
                Days present (all employees)
              </th>
              <th className="px-4 py-3 text-center font-semibold">
                Late deduction (mins)
              </th>
              <th className="px-4 py-3 font-semibold">Submitted by</th>
              <th className="px-4 py-3 font-semibold">Submitted at</th>
              <th className="px-4 py-3">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td
                  className="h-40 text-center text-sm text-slate-500"
                  colSpan={9}
                >
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading history...
                  </span>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td className="h-40 text-center" colSpan={9}>
                  <p className="text-sm text-red-600">{error}</p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    onClick={() => void load()}
                  >
                    Try again
                  </Button>
                </td>
              </tr>
            ) : filteredBatches.length === 0 ? (
              <tr>
                <td
                  className="h-40 text-center text-sm text-slate-500"
                  colSpan={9}
                >
                  {batches.length === 0
                    ? "No timekeeping submitted yet."
                    : "No results match your search."}
                </td>
              </tr>
            ) : (
              filteredBatches.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer whitespace-nowrap text-slate-800 hover:bg-blue-50/40"
                  onClick={() => void openBatch(b.id)}
                >
                  <td className="px-4 py-3 font-semibold">
                    {fmtRange(b.start_date, b.end_date)}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-600">
                    {b.source_file || "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {toNum(b.employees_count)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {toNum(b.records_count)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {toNum(b.total_days)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {toNum(b.total_deduction)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {b.submitted_by || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {fmtStamp(b.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      className="h-8"
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openBatch(b.id);
                      }}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      View
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function TimekeepingPage() {
  const initial = useMemo(() => defaultPeriod(), []);
  const [tab, setTab] = useState<Tab>("timekeeping");

  // Period = month + year + cut-off toggle (1-15 / 16-28..31).
  // `start` and `end` are derived from it, so the rest of the page is unchanged.
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [cutoff, setCutoff] = useState<Cutoff>(initial.cutoff);
  const { start, end } = useMemo(
    () => cutoffRange(year, month, cutoff),
    [year, month, cutoff],
  );
  const yearOptions = [year - 1, year, year + 1];

  const [officialStart, setOfficialStart] = useState(DEFAULT_OFFICIAL_START);
  const [officialEnd, setOfficialEnd] = useState(DEFAULT_OFFICIAL_END);
  // Fixed values (not editable on the page): grace period is read-only and the
  // flexible-schedule required hours field is hidden (always 8 hrs/day).
  const grace = DEFAULT_GRACE_MINS;
  const flexHours = DEFAULT_FLEX_HOURS;

  /* uploaded files: punches of all files are merged (duplicates removed) */
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const punches = useMemo<Punches | null>(() => {
    if (!parsedFiles.length) return null;
    const merged: Punches = new Map();
    parsedFiles.forEach((f) =>
      f.punches.forEach((byDate, emp) => {
        if (!merged.has(emp)) merged.set(emp, new Map());
        const target = merged.get(emp)!;
        byDate.forEach((times, date) => {
          target.set(
            date,
            Array.from(new Set([...(target.get(date) ?? []), ...times])).sort(),
          );
        });
      }),
    );
    return merged;
  }, [parsedFiles]);
  const fileName = parsedFiles.map((f) => f.name).join(", ");
  const fileInfo = useMemo(
    () =>
      parsedFiles.length
        ? {
            rowsUsed: parsedFiles.reduce((n, f) => n + f.rowsUsed, 0),
            minDate: parsedFiles.reduce(
              (m, f) => (!m || f.minDate < m ? f.minDate : m),
              "",
            ),
            maxDate: parsedFiles.reduce(
              (m, f) => (!m || f.maxDate > m ? f.maxDate : m),
              "",
            ),
          }
        : null,
    [parsedFiles],
  );
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [filled, setFilled] = useState<Record<string, true>>({});
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Overtime filed per day, keyed "employee|date". Kept in memory until submit.
  const [overtime, setOvertime] = useState<Record<string, OvertimeEntry>>({});
  const [otTarget, setOtTarget] = useState<DayRow | null>(null);
  // Proof file opened full size straight from the table.
  const [viewFile, setViewFile] = useState<File | null>(null);

  /* OT requests filed by employees (My Overtime) */
  const [otRequests, setOtRequests] = useState<OtRequest[]>([]);
  const [reqView, setReqView] = useState<OtRequest | null>(null);

  const loadOt = useCallback(async () => {
    try {
      const res = await readJson<{ data: OtRequest[] }>(
        await adminFetch(`${OT_URL}?start_date=${start}&end_date=${end}`, {
          cache: "no-store",
        }),
      );
      setOtRequests(res.data ?? []);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to load overtime requests.",
      );
    }
  }, [start, end]);

  useEffect(() => {
    void loadOt();
  }, [loadOt]);

  // Re-fetch when HR comes back to this tab, so newly approved OT shows up.
  useEffect(() => {
    const onFocus = () => void loadOt();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadOt]);

  // One request per employee per day. Rejected / Cancelled are hidden.
  const otByKey = useMemo(() => {
    const map = new Map<string, OtRequest>();
    otRequests
      .filter((r) => r.status === "Pending review" || r.status === "Approved")
      .forEach((r) => map.set(`${r.employee_number}|${dateOnly(r.date)}`, r));
    return map;
  }, [otRequests]);

  const pendingOtCount = otRequests.filter(
    (r) => r.status === "Pending review",
  ).length;

  // OT that counts for a day: HR's manual entry wins, else the APPROVED request.
  const otMinutesOf = useCallback(
    (key: string) => {
      if (overtime[key]) return overtime[key].minutes;
      const req = otByKey.get(key);
      return req?.status === "Approved" ? toNum(req.minutes) : 0;
    },
    [overtime, otByKey],
  );

  const reviewOt = async (id: number, status: "Approved" | "Rejected") => {
    try {
      await readJson(
        await adminFetch(`${OT_URL}/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ status }),
        }),
      );
      toast.success(
        status === "Approved" ? "Overtime approved." : "Overtime rejected.",
      );
      await loadOt();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to update the overtime.",
      );
    }
  };

  /* proof of an already approved request (opened full size) */
  const [reqProof, setReqProof] = useState<ProofView | null>(null);
  const reqProofUrl = useRef<string | null>(null);

  const releaseReqProof = useCallback(() => {
    if (reqProofUrl.current) URL.revokeObjectURL(reqProofUrl.current);
    reqProofUrl.current = null;
    setReqProof(null);
  }, []);

  // Free the proof blob URL when leaving the page.
  useEffect(
    () => () => {
      if (reqProofUrl.current) URL.revokeObjectURL(reqProofUrl.current);
    },
    [],
  );

  const openReqProof = async (req: OtRequest) => {
    try {
      const res = await adminFetch(`${OT_URL}/${req.id}/proof`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Unable to load the proof (${res.status}).`);
      const blob = await res.blob();
      if (reqProofUrl.current) URL.revokeObjectURL(reqProofUrl.current);
      const url = URL.createObjectURL(blob);
      reqProofUrl.current = url;
      setReqProof({
        url,
        mime: blob.type,
        name: req.proof_name || `overtime-proof-${req.employee_number}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to load the proof.");
    }
  };

  const [leaves, setLeaves] = useState<LeaveLite[]>([]);
  const [people, setPeople] = useState<Record<string, EmployeeInfo>>({});
  const [hired, setHired] = useState<Record<string, string>>({}); // id_number -> date_hired (display only)
  const [masterfile, setMasterfile] = useState<Record<string, Employee>>({}); // id_number -> full record (for avatar)
  const [firstDays, setFirstDays] = useState<Record<string, string>>({});
  /* flexible-schedule employees (saved in this browser) */
  const [flexible, setFlexible] = useState<Record<string, true>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FLEX_KEY);
      if (raw) setFlexible(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  const toggleFlexible = (id: string) => {
    const next = { ...flexible };
    if (next[id]) delete next[id];
    else next[id] = true;
    setFlexible(next);
    try {
      localStorage.setItem(FLEX_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // Minutes a flexible employee must render per day (8 hrs by default).
  const requiredMins = Math.round(flexHours * 60);

  /* leave + masterfile (names are optional: IDs still work without them) */
  useEffect(() => {
    void (async () => {
      try {
        const data = await readJson<{ data: LeaveLite[] }>(
          await adminFetch("/api/admin/leave-requests", { cache: "no-store" }),
        );
        setLeaves(data.data);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load leave records.",
        );
      }
      try {
        const data = await readJson<{
          data: {
            employee_id: string;
            name: string;
            department: string;
            position: string;
          }[];
        }>(
          await adminFetch("/api/admin/leave-requests?resource=employees", {
            cache: "no-store",
          }),
        );
        const map: Record<string, EmployeeInfo> = {};
        data.data.forEach((e) => {
          map[e.employee_id] = {
            name: e.name,
            department: e.department,
            position: e.position,
          };
        });
        setPeople(map);
      } catch {
        /* names stay blank */
      }
      // Date Hired from the Employee Masterfile (display only)
      try {
        const data = await readJson<{ data: Employee[] }>(
          await adminFetch("/api/employee-masterfile", { cache: "no-store" }),
        );
        const map: Record<string, string> = {};
        const full: Record<string, Employee> = {};
        data.data.forEach((e) => {
          if (!e.id_number) return;
          full[e.id_number] = e;
          if (e.date_hired) map[e.id_number] = e.date_hired;
        });
        setHired(map);
        setMasterfile(full);
      } catch {
        /* Date Hired stays "—" */
      }
    })();
  }, []);

  /* days in the period */
  const days = useMemo(() => {
    if (!start || !end || start > end) return [];
    const list = eachDayOfInterval({
      start: parseDay(start),
      end: parseDay(end),
    });
    return list.length > MAX_RANGE_DAYS ? [] : list;
  }, [start, end]);
  const workingDays = useMemo(
    () => days.filter((d) => getDay(d) !== 0 && getDay(d) !== 6).length,
    [days],
  );

  /* approved FULL-DAY leave only (half days / early leave still have punches) */
  const leaveByEmployee = useMemo(() => {
    const map = new Map<string, LeaveLite[]>();
    leaves
      .filter(
        (l) =>
          l.status.startsWith("Approved") &&
          !l.half_day_period &&
          !l.early_leave_time,
      )
      .forEach((l) =>
        map.set(l.employee_number, [...(map.get(l.employee_number) ?? []), l]),
      );
    return map;
  }, [leaves]);

  /* approved HALF-DAY leave (the person still comes in for the other half) */
  const halfLeaveByEmployee = useMemo(() => {
    const map = new Map<string, LeaveLite[]>();
    leaves
      .filter((l) => l.status.startsWith("Approved") && !!l.half_day_period)
      .forEach((l) =>
        map.set(l.employee_number, [...(map.get(l.employee_number) ?? []), l]),
      );
    return map;
  }, [leaves]);

  /* the whole table: employee -> one row per day */
  const table = useMemo(() => {
    const result = new Map<string, DayRow[]>();
    if (!punches) return result;

    punches.forEach((byDate, emp) => {
      const rows: DayRow[] = [];
      const flex = !!flexible[emp];
      const hiredDate = hired[emp] ? dateOnly(hired[emp]) : "";
      const hiredInPeriod =
        !!hiredDate && hiredDate >= start && hiredDate <= end;
      const firstDay = hiredInPeriod ? (firstDays[emp] ?? hiredDate) : "";
      for (const d of days) {
        const date = dayValue(d);
        const weekend = getDay(d) === 0 || getDay(d) === 6;
        const times = byDate.get(date);
        if (weekend && !times) continue;
        if (firstDay && date < firstDay) continue; // not yet working
        const onLeave = (leaveByEmployee.get(emp) ?? []).some(
          (l) => l.start_date <= date && l.end_date >= date,
        );
        const key = `${emp}|${date}`;

        if (!times && onLeave) {
          rows.push({
            key,
            employee: emp,
            date,
            timeIn: null,
            timeOut: null,
            autoIn: false,
            autoOut: false,
            isLeave: true,
            halfDay: null,
            isFlexible: flex,
            hasGap: false,
            isFilled: false,
            days: 0,
            minsLate: 0,
            undertime: 0,
            deduction: 0,
          });
          continue;
        }

        // Approved half-day leave on this date? ("AM" = off in the morning)
        const half =
          (halfLeaveByEmployee.get(emp) ?? []).find(
            (l) => l.start_date <= date && l.end_date >= date,
          )?.half_day_period ?? null;

        // Expected schedule for THIS day
        const expectedIn = half === "AM" ? HALF_DAY_PM_START : officialStart;
        const expectedOut = half === "PM" ? HALF_DAY_AM_END : officialEnd;

        let rawIn: string | null = null;
        let rawOut: string | null = null;
        if (times?.length) {
          const first = times[0];
          const last = times[times.length - 1];
          const span = minutesOf(last) - minutesOf(first);
          if (times.length > 1 && span >= SINGLE_PUNCH_WINDOW_MIN) {
            rawIn = first.slice(0, 5);
            rawOut = last.slice(0, 5);
          } else {
            // one punch: is it closer to the start or the end of the expected shift?
            const mid = (minutesOf(expectedIn) + minutesOf(expectedOut)) / 2;
            if (minutesOf(first) <= mid) rawIn = first.slice(0, 5);
            else rawOut = last.slice(0, 5);
          }
        }

        const hasGap = !rawIn || !rawOut;
        // Flexible employees are never auto-filled (no fixed 8:00 / 5:00).
        const isFilled = hasGap && !flex && !!filled[key];
        const timeIn = rawIn ?? (isFilled ? expectedIn : null);
        const timeOut = rawOut ?? (isFilled ? expectedOut : null);
        const complete = !!timeIn && !!timeOut;

        // Half day: from approved leave, OR detected from the punches.
        let shiftHalf: "AM" | "PM" | null = half;
        if (complete && !flex && !half) {
          const inM = minutesOf(timeIn!);
          const outM = minutesOf(timeOut!);
          if (inM >= minutesOf(LUNCH_START)) shiftHalf = "AM";
          else if (outM <= minutesOf(LUNCH_END)) shiftHalf = "PM";
        }
        const shiftIn = shiftHalf === "AM" ? HALF_DAY_PM_START : officialStart;
        const shiftOut = shiftHalf === "PM" ? HALF_DAY_AM_END : officialEnd;

        let minsLate = 0;
        // Tardiness applies Monday to Friday only (Sat/Sun punches are never late)
        if (complete && !weekend) {
          if (flex) {
            // Hours-based: no late. Short of the required hours = undertime.
            const worked = minutesOf(timeOut!) - minutesOf(timeIn!);
            const need = shiftHalf ? requiredMins / 2 : requiredMins;
            minsLate = Math.max(0, need - worked);
          } else {
            minsLate = Math.max(0, minutesOf(timeIn!) - minutesOf(shiftIn));
          }
        }
        // Undertime: left before the expected end. Lunch (12–1 PM) is not counted.
        let undertime = 0;
        if (complete && !weekend && !flex) {
          const outM = minutesOf(timeOut!);
          const expM = minutesOf(shiftOut);
          if (outM < expM) {
            const lunchOverlap = Math.max(
              0,
              Math.min(expM, minutesOf(LUNCH_END)) -
                Math.max(outM, minutesOf(LUNCH_START)),
            );
            undertime = expM - outM - lunchOverlap;
          }
        }
        rows.push({
          key,
          employee: emp,
          date,
          timeIn,
          timeOut,
          autoIn: isFilled && !rawIn,
          autoOut: isFilled && !rawOut,
          isLeave: false,
          halfDay: shiftHalf,
          isFlexible: flex,
          hasGap,
          isFilled,
          days: complete ? (shiftHalf ? 0.5 : 1) : 0,
          minsLate,
          undertime,
          // grace is subtracted from the late minutes (never below 0)
          deduction: complete ? Math.max(0, minsLate - grace) : 0,
        });
      }
      if (rows.some((r) => r.timeIn || r.timeOut || r.hasGap || r.isLeave))
        result.set(emp, rows);
    });
    return result;
  }, [
    punches,
    days,
    filled,
    officialStart,
    officialEnd,
    grace,
    leaveByEmployee,
    firstDays,
    halfLeaveByEmployee,
    flexible,
    requiredMins,
    hired,
    start,
    end,
  ]);

  /* employee list */
  const employees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Array.from(table.entries())
      .map(([id, rows]) => ({
        id,
        name: people[id]?.name ?? "",
        missing: rows.reduce(
          (n, r) => n + (r.hasGap && !r.isFilled ? 1 : 0),
          0,
        ), // days with a gap that is not yet filled
      }))
      .filter(
        (e) =>
          !q ||
          e.id.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q),
      )
      .filter((e) =>
        filter === "missing"
          ? e.missing > 0
          : filter === "complete"
            ? e.missing === 0
            : true,
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [table, people, search, filter]);

  const totalMissingDays = useMemo(() => {
    let n = 0;
    table.forEach((rows) =>
      rows.forEach((r) => {
        if (r.hasGap && !r.isFilled) n += 1;
      }),
    );
    return n;
  }, [table]);

  // gaps that Auto-fill can actually fill (flexible employees are skipped)
  const fillableMissingDays = useMemo(() => {
    let n = 0;
    table.forEach((rows) =>
      rows.forEach((r) => {
        if (r.hasGap && !r.isFilled && !r.isFlexible) n += 1;
      }),
    );
    return n;
  }, [table]);

  /* pick a sensible employee after upload / when the selection disappears */
  useEffect(() => {
    if (!table.size) return;
    if (selectedId && table.has(selectedId)) return;
    const withGap = Array.from(table.entries()).find(([, rows]) =>
      rows.some((r) => r.hasGap),
    );
    setSelectedId((withGap ?? Array.from(table.entries())[0])[0]);
  }, [table, selectedId]);

  const rows = useMemo(() => table.get(selectedId) ?? [], [table, selectedId]);
  const selectedMissing = rows.filter((r) => r.hasGap && !r.isFilled);
  const selectedPunchGaps = selectedMissing.reduce(
    (n, r) => n + (!r.timeIn ? 1 : 0) + (!r.timeOut ? 1 : 0),
    0,
  );
  const totals = useMemo(
    () => ({
      days: rows.reduce((n, r) => n + r.days, 0),
      leave: rows.filter((r) => r.isLeave).length,
      late: rows.reduce((n, r) => n + r.minsLate, 0),
      undertime: rows.reduce((n, r) => n + r.undertime, 0),
      deduction: rows.reduce((n, r) => n + r.deduction, 0),
      autoPunches: rows.reduce(
        (n, r) => n + (r.autoIn ? 1 : 0) + (r.autoOut ? 1 : 0),
        0,
      ),
      overtime: rows.reduce(
        (n, r) =>
          n + (r.isLeave || (r.hasGap && !r.isFilled) ? 0 : otMinutesOf(r.key)),
        0,
      ),
    }),
    [rows, otMinutesOf],
  );

  /* actions */
  // Adds one or more files. Files already added stay; a file with the same
  // name replaces its older copy.
  const handleFiles = useCallback(
    async (list: FileList | File[] | null | undefined) => {
      const picked = Array.from(list ?? []);
      if (fileInput.current) fileInput.current.value = "";
      if (!picked.length) return;

      const valid: File[] = [];
      for (const f of picked) {
        if (!/\.(xlsx|xls|csv|dat|txt)$/i.test(f.name)) {
          toast.error(
            `"${f.name}" is not supported. Use .xlsx, .xls, .csv, .dat or .txt.`,
          );
          continue;
        }
        const problem = checkFileName(f.name);
        if (problem) {
          toast.error(problem);
          continue;
        }
        valid.push(f);
      }
      if (!valid.length) return;
      if (valid.length < picked.length) {
        toast.error("Only .xlsx, .xls, .csv, .dat or .txt files were added.");
      }
      if (!valid.length) return;

      setParsing(true);
      try {
        const added: ParsedFile[] = [];
        for (const file of valid) {
          try {
            const result = await parseBiometricFile(file);
            if (result.rowsUsed === 0) {
              toast.error(
                `No punches found in ${file.name}. Check that it has Employee ID, date and time columns.`,
              );
              continue;
            }
            added.push({ name: file.name, ...result });
          } catch {
            toast.error(`Unable to read ${file.name}.`);
          }
        }
        if (added.length) {
          setParsedFiles((cur) => {
            const names = new Set(added.map((a) => a.name));
            return [...cur.filter((f) => !names.has(f.name)), ...added];
          });
          toast.success(
            `Added ${added.length} file${added.length === 1 ? "" : "s"} (${added
              .reduce((n, a) => n + a.rowsUsed, 0)
              .toLocaleString()} punches).`,
          );
        }
      } finally {
        setParsing(false);
      }
    },
    [],
  );

  const removeFile = (name: string) =>
    setParsedFiles((cur) => cur.filter((f) => f.name !== name));

  const fillRows = (list: DayRow[]) =>
    setFilled((cur) => {
      const next = { ...cur };
      list.forEach((r) => {
        if (r.hasGap && !r.isFlexible) next[r.key] = true;
      });
      return next;
    });
  const undoRow = (key: string) =>
    setFilled((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });

  const fillSelected = () => fillRows(selectedMissing);

  const fillEveryone = () => {
    const all: DayRow[] = [];
    table.forEach((r) =>
      r.forEach((x) => {
        if (x.hasGap && !x.isFilled && !x.isFlexible) all.push(x);
      }),
    );
    if (all.length === 0) return;

    setConfirm({
      title: "Auto-fill everyone?",
      message: `Auto-fill ${all.length} day(s) across ${table.size} employees using ${fmt12(officialStart)} / ${fmt12(officialEnd)} (half days use their own shift)? Real punches are never changed.`,
      confirmLabel: "Auto-fill",
      onConfirm: () => {
        fillRows(all);
        setConfirm(null);
      },
    });
  };

  /* overtime actions */
  const saveOvertime = (entry: OvertimeEntry) => {
    if (!otTarget) return;
    setOvertime((cur) => ({ ...cur, [otTarget.key]: entry }));
    toast.success(`Overtime of ${fmtDuration(entry.minutes)} saved.`);
    setOtTarget(null);
  };

  const removeOvertime = () => {
    if (!otTarget) return;
    setOvertime((cur) => {
      const next = { ...cur };
      delete next[otTarget.key];
      return next;
    });
    setOtTarget(null);
  };

  const submit = async () => {
    if (!table.size) return;

    // Proof files are collected here; each record points to its file by index.
    const proofs: File[] = [];

    const records = Array.from(table.values())
      .flat()
      .map((r) => {
        const ot = overtime[r.key];
        // Approved in My Overtime (only when HR did not add a manual entry).
        const req = otByKey.get(r.key);
        const approvedReq = !ot && req?.status === "Approved" ? req : null;

        return {
          employee_number: r.employee,
          date: r.date,
          time_in: r.timeIn,
          time_out: r.timeOut,
          no_of_days: r.days,
          mins_late: r.minsLate,
          undertime_minutes: r.undertime,
          grace_deduction: r.deduction,
          is_leave: r.isLeave,
          auto_filled_in: r.autoIn,
          auto_filled_out: r.autoOut,
          overtime_minutes:
            ot?.minutes ?? (approvedReq ? toNum(approvedReq.minutes) : 0),
          overtime_note: ot?.note || approvedReq?.note || null,
          overtime_proof_index: ot ? proofs.push(ot.proof) - 1 : null,
          // The proof is already on the server: only send the request id.
          overtime_request_id: approvedReq?.id ?? null,
        };
      });
    const form = new FormData();
    form.append("start_date", start);
    form.append("end_date", end);
    form.append("official_start", officialStart);
    form.append("official_end", officialEnd);
    form.append("grace_minutes", String(grace));
    form.append("source_file", fileName.slice(0, 255));
    form.append("records", JSON.stringify(records));
    proofs.forEach((f) => form.append("proofs[]", f));

    setSaving(true);
    try {
      await readJson(
        await adminFetch(SUBMIT_URL, {
          method: "POST",
          headers: { Accept: "application/json" }, // do NOT set Content-Type
          body: form,
        }),
      );
      toast.success("Timekeeping submitted. See it in the History tab.");
      await loadOt();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to submit timekeeping.",
      );
    } finally {
      setSaving(false);
    }
  };

  const requestSubmit = () => {
    if (!table.size) return;

    if (totalMissingDays > 0) {
      setConfirm({
        title: "Submit with missing punches?",
        message: `${totalMissingDays} day(s) still have missing punches. Submit anyway?`,
        confirmLabel: "Submit anyway",
        onConfirm: () => {
          setConfirm(null);
          void submit();
        },
      });
      return;
    }
    void submit();
  };

  const selectedPerson = people[selectedId];
  const selectedHiredDate = hired[selectedId]
    ? dateOnly(hired[selectedId])
    : "";
  const selectedHiredInPeriod =
    !!selectedHiredDate &&
    selectedHiredDate >= start &&
    selectedHiredDate <= end;
  const selectedFirstDay = firstDays[selectedId] ?? selectedHiredDate;
  const selectedFlexible = !!flexible[selectedId];
  const requiredHours = Math.round((requiredMins / 60) * 100) / 100;
  const fileOutsidePeriod =
    fileInfo && (fileInfo.maxDate < start || fileInfo.minDate > end);

  /* ───────────────────────── render ───────────────────────── */

  return (
    <section className="mx-auto max-w-[1600px] space-y-5 p-1 sm:p-2">
      {/* Header */}
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
              <Clock className="h-6 w-6 text-white sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Timekeeping
              </h1>
              <p className="mt-1 text-sm text-blue-100">
                {tab === "history"
                  ? "Review the timekeeping that was already submitted."
                  : "Upload the biometric Excel file, review each employee's time in and time out, and fix missed punches."}
              </p>
            </div>
          </div>
          {tab === "timekeeping" && (
            <Button
              className="h-11 shrink-0 bg-white px-5 font-semibold text-blue-700 shadow-md hover:bg-blue-50"
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Excel
            </Button>
          )}
        </div>
      </header>

      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {/* Tabs */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
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

      {tab === "history" ? (
        <TimekeepingHistory people={people} masterfile={masterfile} />
      ) : (
        <>
          {/* Period + upload */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800">
                  1
                </span>
                Timekeeping period
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {/* Month / year / cut-off toggle (same as the Payroll page) */}
                <div className="col-span-2 flex flex-wrap items-center gap-3">
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
                    {CUTOFFS.map((c) => (
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
                </div>

                <label className="space-y-1 text-xs font-medium text-slate-600">
                  Official start
                  <Input
                    type="time"
                    value={officialStart}
                    onChange={(e) => setOfficialStart(e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-slate-600">
                  Official end
                  <Input
                    type="time"
                    value={officialEnd}
                    onChange={(e) => setOfficialEnd(e.target.value)}
                  />
                </label>
                <label className="col-span-2 space-y-1 text-xs font-medium text-slate-600">
                  Grace period (mins)
                  <Input
                    className="cursor-not-allowed bg-slate-50 text-slate-900 focus-visible:ring-0"
                    readOnly
                    type="number"
                    value={grace}
                  />
                </label>
              </div>
              <p className="mt-4 text-sm text-slate-600">
                {`${workingDays} working days (Mon–Fri) · ${format(parseDay(start), "MMM d")} – ${format(parseDay(end), "MMM d, yyyy")}`}
              </p>
            </Card>

            <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800">
                  2
                </span>
                Biometric file
              </h2>

              {!punches ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void handleFiles(e.dataTransfer.files);
                  }}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-5 py-10 text-center transition-colors ${dragOver ? "border-cyan-600 bg-cyan-50" : "border-slate-300 bg-slate-50"}`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100">
                    {parsing ? (
                      <Loader2 className="h-6 w-6 animate-spin text-sky-700" />
                    ) : (
                      <Upload className="h-6 w-6 text-sky-700" />
                    )}
                  </div>
                  <p className="text-[15px] font-semibold text-slate-900">
                    Drop your biometric Excel file(s) here
                  </p>
                  <p className="max-w-md text-sm text-slate-500">
                    .xlsx, .xls, .csv, .dat or .txt. The file name must be
                    Month-StartDay-EndDay-Year, for example {FILE_NAME_EXAMPLE}.
                    You can add more than one file; their punches are combined.
                    We read the Employee ID, date and time columns, then take
                    the earliest punch of the day as Time In and the latest as
                    Time Out.
                  </p>
                  <Button
                    className="mt-1 bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                    disabled={parsing}
                    onClick={() => fileInput.current?.click()}
                  >
                    Choose Excel file(s)
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                        <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {parsedFiles.length === 1
                            ? parsedFiles[0].name
                            : `${parsedFiles.length} files added`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {fileInfo?.rowsUsed.toLocaleString()} punches read ·{" "}
                          {table.size} employees ·{" "}
                          {fileInfo &&
                            `${format(parseDay(fileInfo.minDate), "MMM d")} – ${format(parseDay(fileInfo.maxDate), "MMM d, yyyy")}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      disabled={parsing}
                      onClick={() => fileInput.current?.click()}
                    >
                      {parsing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Add another file
                    </Button>
                  </div>

                  {parsedFiles.length > 0 && (
                    <ul className="space-y-1.5">
                      {parsedFiles.map((f) => (
                        <li
                          key={f.name}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-slate-900">
                              {f.name}
                            </span>
                            <span className="ml-2 text-xs text-slate-500">
                              {f.rowsUsed.toLocaleString()} punches ·{" "}
                              {format(parseDay(f.minDate), "MMM d")} –{" "}
                              {format(parseDay(f.maxDate), "MMM d, yyyy")}
                            </span>
                          </span>
                          <Button
                            className="h-7 shrink-0 text-slate-600"
                            disabled={parsing}
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFile(f.name)}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {fileOutsidePeriod && (
                    <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      This file does not overlap the selected period. Check the
                      month and cut-off.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {["Employee ID", "Date", "Time"].map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> {c}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Earliest punch of the day is <strong>Time In</strong>,
                    latest is <strong>Time Out</strong>. Two taps less than{" "}
                    {SINGLE_PUNCH_WINDOW_MIN} minutes apart count as one punch.
                    Approved full-day leave shows as LEAVE; approved half-day
                    leave counts as 0.5 day. Punches from all added files are
                    combined per employee and day.
                  </p>
                </div>
              )}
            </Card>
          </div>

          {punches && table.size > 0 && (
            <>
              {pendingOtCount > 0 && (
                <div className="flex items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-3 text-sm text-cyan-900">
                  <Clock className="h-4 w-4 shrink-0" />
                  {pendingOtCount} overtime{" "}
                  {pendingOtCount === 1 ? "request is" : "requests are"} waiting
                  for approval. Approve or reject them in the Overtime column.
                </div>
              )}

              {/* Banner */}
              {totalMissingDays > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
                  <div className="flex min-w-0 flex-1 basis-[340px] items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-sm font-semibold text-amber-950">
                        {selectedMissing.length > 0
                          ? `${selectedPunchGaps} missing ${selectedPunchGaps === 1 ? "punch" : "punches"} on ${selectedMissing.length} ${selectedMissing.length === 1 ? "day" : "days"} for ${selectedPerson?.name || selectedId}`
                          : `${selectedPerson?.name || selectedId} has no missing punches`}
                        {" · "}
                        {totalMissingDays}{" "}
                        {totalMissingDays === 1 ? "day" : "days"} across all
                        employees
                      </p>
                      <p className="mt-0.5 text-sm text-amber-900">
                        Auto-fill sets a missing Time In to{" "}
                        {fmt12(officialStart)} and a missing Time Out to{" "}
                        {fmt12(officialEnd)} (half days use{" "}
                        {fmt12(HALF_DAY_PM_START)} / {fmt12(HALF_DAY_AM_END)}).
                        Real punches are never changed.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="bg-violet-700 text-white hover:bg-violet-800"
                      disabled={
                        selectedMissing.length === 0 || selectedFlexible
                      }
                      onClick={fillSelected}
                    >
                      Auto-fill this employee ({selectedPunchGaps})
                    </Button>
                    <Button
                      variant="outline"
                      disabled={fillableMissingDays === 0}
                      onClick={fillEveryone}
                    >
                      Auto-fill everyone ({fillableMissingDays} days)
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <CheckCircle2 className="h-5 w-5" /> All punches are
                    complete.
                  </p>
                  {Object.keys(filled).length > 0 && (
                    <Button variant="outline" onClick={() => setFilled({})}>
                      <Undo2 className="mr-2 h-4 w-4" /> Undo all auto-fill
                    </Button>
                  )}
                </div>
              )}

              <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                {/* Employee list */}
                <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800">
                      3
                    </span>
                    Employees
                  </h2>
                  <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      className="pl-9"
                      placeholder="Search ID or name"
                      aria-label="Search employees"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {(
                      [
                        ["all", "All"],
                        ["missing", "Missing punches"],
                        ["complete", "Complete"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setFilter(key)}
                        aria-pressed={filter === key}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${filter === key ? "bg-cyan-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <ul className="max-h-[640px] space-y-1 overflow-y-auto">
                    {employees.length === 0 && (
                      <li className="p-3 text-sm text-slate-500">
                        No employees match.
                      </li>
                    )}
                    {employees.map((e) => (
                      <li key={e.id}>
                        <button
                          onClick={() => setSelectedId(e.id)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${e.id === selectedId ? "border-cyan-600 bg-cyan-50" : "border-transparent"}`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-900">
                            {(e.name || e.id)
                              .replace(/[^A-Za-z0-9 ]/g, "")
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((p) => p[0]?.toUpperCase())
                              .join("")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">
                              {e.name || e.id}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {e.name ? `${e.id} · ` : ""}
                              {flexible[e.id] ? "Flexible · " : ""}
                              {e.missing > 0
                                ? `${e.missing} ${e.missing === 1 ? "day" : "days"} to fix`
                                : "All punches complete"}
                            </span>
                          </span>
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${e.missing > 0 ? "bg-amber-500" : "bg-emerald-500"}`}
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>

                {/* Record */}
                <Card className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-slate-900">
                        {selectedPerson?.name || selectedId}
                      </h2>
                      <p className="text-xs text-slate-500">
                        ID {selectedId}
                        {selectedPerson
                          ? ` · ${selectedPerson.position}, ${selectedPerson.department}`
                          : ""}{" "}
                        · {format(parseDay(start), "MMM d")} –{" "}
                        {format(parseDay(end), "MMM d, yyyy")}
                      </p>
                      {selectedHiredInPeriod && (
                        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                          First day
                          <Input
                            className="h-8 w-[160px]"
                            max={end}
                            min={start}
                            type="date"
                            value={selectedFirstDay}
                            onChange={(e) =>
                              setFirstDays((cur) => ({
                                ...cur,
                                [selectedId]: e.target.value,
                              }))
                            }
                          />
                          <span className="font-normal text-slate-500">
                            Days before the first day are not counted.
                          </span>
                        </label>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 text-right">
                      <Button
                        aria-pressed={selectedFlexible}
                        className={
                          selectedFlexible
                            ? "h-8 bg-violet-700 text-white hover:bg-violet-800"
                            : "h-8"
                        }
                        size="sm"
                        variant={selectedFlexible ? "default" : "outline"}
                        onClick={() => toggleFlexible(selectedId)}
                      >
                        <Clock className="mr-1.5 h-3.5 w-3.5" />
                        {selectedFlexible
                          ? "Flexible schedule: ON"
                          : "Mark as flexible"}
                      </Button>
                      <span className="text-xs text-slate-500">
                        {selectedFlexible
                          ? `No fixed time in. Less than ${requiredHours} hrs/day counts as undertime. `
                          : ""}
                        Purple times were auto-filled
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">
                            Time In (earliest)
                          </th>
                          <th className="px-4 py-3 font-semibold">Time Out</th>
                          <th className="px-4 py-3 text-center font-semibold">
                            No. of Days
                          </th>
                          <th className="px-4 py-3 text-center font-semibold">
                            {selectedFlexible ? "Mins. Under" : "Mins. Late"}
                          </th>
                          <th className="px-4 py-3 text-center font-semibold">
                            w/ {grace} mins. grace
                          </th>
                          <th className="px-4 py-3 text-center font-semibold">
                            Undertime (mins)
                          </th>
                          <th className="px-4 py-3 text-center font-semibold">
                            Overtime (OT)
                          </th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3">
                            <span className="sr-only">Action</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((r) => {
                          const open = r.hasGap && !r.isFilled;
                          const rowTone = open
                            ? "bg-amber-50/70"
                            : r.isFilled
                              ? "bg-violet-50/50"
                              : "";
                          const missing = "font-medium text-amber-700";
                          const auto = "font-semibold text-violet-700";
                          const ot = overtime[r.key];
                          // Filed by the employee in My Overtime
                          const req = otByKey.get(r.key);
                          const approvedReq =
                            !ot && req?.status === "Approved" ? req : null;
                          const pendingReq =
                            !ot && req?.status === "Pending review"
                              ? req
                              : null;

                          return (
                            <tr
                              key={r.key}
                              className={`whitespace-nowrap text-slate-800 ${rowTone}`}
                            >
                              {/* Date */}
                              <td className="px-4 py-2.5">
                                {format(parseDay(r.date), "MM/dd/yyyy")}{" "}
                                <span className="text-xs text-slate-400">
                                  {format(parseDay(r.date), "EEE")}
                                </span>
                              </td>

                              {/* Time In / Time Out */}
                              {r.isLeave ? (
                                <>
                                  <td className="px-4 py-2.5" />
                                  <td className="px-4 py-2.5 font-medium text-red-600">
                                    LEAVE
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td
                                    className={`px-4 py-2.5 ${!r.timeIn ? missing : r.autoIn ? auto : ""}`}
                                  >
                                    {r.timeIn ? fmt12(r.timeIn) : "No punch"}
                                  </td>
                                  <td
                                    className={`px-4 py-2.5 ${!r.timeOut ? missing : r.autoOut ? auto : ""}`}
                                  >
                                    {r.timeOut ? fmt12(r.timeOut) : "No punch"}
                                  </td>
                                </>
                              )}

                              {/* No. of Days */}
                              <td className="px-4 py-2.5 text-center font-semibold">
                                {r.isLeave ? 0 : open ? "—" : r.days}
                              </td>

                              {/* Mins. Late */}
                              <td className="px-4 py-2.5 text-center">
                                {r.isLeave || open ? "—" : r.minsLate}
                              </td>

                              {/* w/ grace */}
                              <td className="px-4 py-2.5 text-center">
                                {r.isLeave || open ? "—" : r.deduction}
                              </td>

                              {/* Undertime */}
                              <td className="px-4 py-2.5 text-center">
                                {r.isLeave || open ? "—" : r.undertime}
                              </td>

                              {/* Overtime (OT) */}
                              <td className="px-4 py-2.5 text-center">
                                {r.isLeave || open ? (
                                  <span className="text-slate-400">—</span>
                                ) : ot ? (
                                  /* HR manual entry */
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800 ring-1 ring-inset ring-cyan-200"
                                      title={ot.note || undefined}
                                    >
                                      {fmtDuration(ot.minutes)}
                                    </span>
                                    <Button
                                      className="h-7 border-cyan-300 px-2 text-cyan-800 hover:bg-cyan-50"
                                      size="sm"
                                      type="button"
                                      variant="outline"
                                      title={ot.proof.name}
                                      onClick={() => setViewFile(ot.proof)}
                                    >
                                      <Eye className="mr-1 h-3.5 w-3.5" />
                                      Proof
                                    </Button>
                                    <Button
                                      className="h-7 px-2 text-slate-600"
                                      size="sm"
                                      type="button"
                                      variant="ghost"
                                      onClick={() => setOtTarget(r)}
                                    >
                                      Edit
                                    </Button>
                                  </span>
                                ) : approvedReq ? (
                                  /* Approved in My Overtime: counted automatically */
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200"
                                      title={
                                        approvedReq.note || "Approved overtime"
                                      }
                                    >
                                      {fmtDuration(toNum(approvedReq.minutes))}{" "}
                                      · Approved
                                    </span>
                                    {approvedReq.proof_name && (
                                      <Button
                                        className="h-7 border-emerald-300 px-2 text-emerald-800 hover:bg-emerald-50"
                                        size="sm"
                                        type="button"
                                        variant="outline"
                                        title={approvedReq.proof_name}
                                        onClick={() =>
                                          void openReqProof(approvedReq)
                                        }
                                      >
                                        <Eye className="mr-1 h-3.5 w-3.5" />
                                        Proof
                                      </Button>
                                    )}
                                  </span>
                                ) : pendingReq ? (
                                  /* Filed by the employee, waiting for HR */
                                  <Button
                                    className="h-7 border-amber-300 px-2 text-amber-800 hover:bg-amber-50"
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => setReqView(pendingReq)}
                                  >
                                    <Clock className="mr-1 h-3.5 w-3.5" />
                                    Review OT (
                                    {fmtDuration(toNum(pendingReq.minutes))})
                                  </Button>
                                ) : (
                                  <Button
                                    className="h-7 border-cyan-300 px-2 text-cyan-800 hover:bg-cyan-50"
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => setOtTarget(r)}
                                  >
                                    <Clock className="mr-1 h-3.5 w-3.5" />
                                    Add OT
                                  </Button>
                                )}
                              </td>

                              {/* Status */}
                              <td className="px-4 py-2.5">
                                {r.isLeave ? (
                                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                                    On leave
                                  </span>
                                ) : open ? (
                                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                                    {!r.timeIn && !r.timeOut
                                      ? "No punches"
                                      : !r.timeOut
                                        ? "Missing time out"
                                        : "Missing time in"}
                                  </span>
                                ) : r.isFilled ? (
                                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800">
                                    Auto-filled
                                  </span>
                                ) : r.halfDay ? (
                                  <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                                    {`Half day (${r.halfDay === "AM" ? "PM" : "AM"} shift)`}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                    Complete
                                  </span>
                                )}
                              </td>

                              {/* Action */}
                              <td className="px-4 py-2.5 text-right">
                                {open && !r.isFlexible && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-violet-300 text-violet-700 hover:bg-violet-50"
                                    onClick={() => fillRows([r])}
                                  >
                                    Auto-fill
                                  </Button>
                                )}
                                {r.isFilled && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-slate-600"
                                    onClick={() => undoRow(r.key)}
                                  >
                                    Undo
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={10}
                              className="px-4 py-10 text-center text-sm text-slate-500"
                            >
                              No days in this period for this employee.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex flex-wrap gap-x-8 gap-y-3">
                      {[
                        ["Days present", totals.days, ""],
                        ["Leave days", totals.leave, ""],
                        ["Mins. late", totals.late, ""],
                        ["Late deduction (mins)", totals.deduction, ""],
                        ["Undertime (mins)", totals.undertime, ""],
                        [
                          "Overtime",
                          totals.overtime > 0
                            ? fmtDuration(totals.overtime)
                            : "0",
                          "text-cyan-800",
                        ],
                        [
                          "Auto-filled punches",
                          totals.autoPunches,
                          "text-violet-700",
                        ],
                      ].map(([label, value, tone]) => (
                        <div key={label as string}>
                          <p className="text-xs text-slate-500">{label}</p>
                          <p className={`text-lg font-bold ${tone}`}>{value}</p>
                        </div>
                      ))}
                    </div>
                    <Button
                      className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                      disabled={saving}
                      onClick={requestSubmit}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Submit timekeeping
                    </Button>
                  </div>
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {confirm && (
        <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />
      )}

      {otTarget && (
        <OvertimeDialog
          key={otTarget.key}
          date={otTarget.date}
          employeeName={people[otTarget.employee]?.name || otTarget.employee}
          initial={overtime[otTarget.key] ?? null}
          onCancel={() => setOtTarget(null)}
          onRemove={removeOvertime}
          onSave={saveOvertime}
        />
      )}

      {viewFile && (
        <FileLightbox file={viewFile} onClose={() => setViewFile(null)} />
      )}

      {reqProof && (
        <Lightbox
          mime={reqProof.mime}
          name={reqProof.name}
          src={reqProof.url}
          onClose={releaseReqProof}
        />
      )}

      {reqView && (
        <OtRequestDialog
          key={reqView.id}
          employeeName={
            people[reqView.employee_number]?.name || reqView.employee_number
          }
          req={reqView}
          onClose={() => setReqView(null)}
          onApprove={async () => {
            await reviewOt(reqView.id, "Approved");
            setReqView(null);
          }}
          onReject={async () => {
            await reviewOt(reqView.id, "Rejected");
            setReqView(null);
          }}
        />
      )}
    </section>
  );
}
