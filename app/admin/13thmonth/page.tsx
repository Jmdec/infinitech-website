"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  FileSpreadsheet,
  Gift,
  Loader,
  Save,
  Search,
  Undo2,
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
import { fetchPayrollEmployees } from "@/lib/api";
import {
  exportPayrollJpg,
  exportPayrollXlsx,
  type ExportColumn,
  type PayrollExportData,
} from "@/lib/payroll-export";

/* ────────────────────────────────────────────────────────────────────────────
 * 13TH MONTH RULES  (PD 851 / DOLE)
 *   Per cut-off amount = Basic Pay − LWOP − Tardiness
 *                        (computed by the backend from every SAVED payroll)
 *   Excluded           = OT, allowances, bonuses, incentives, gov't deductions
 *   Pro-rated 13th     = SUM of the 24 cut-offs / 12
 *
 *   MANUAL INPUT       = you can still type an amount on any cut-off. A typed
 *                        amount WINS over the payroll amount. Clear the box to
 *                        go back to the payroll amount.
 *   No final-save lock = always editable. Press "Save 13th month".
 *
 *   Resigned employees = shown if they have any payroll / manual amount
 *                        in the chosen year.
 * ──────────────────────────────────────────────────────────────────────────── */

const API = "/api/admin/thirteenth-month";

type Cutoff = "1-15" | "16-30";
type View = "table" | "form" | "statement";
type Source = "manual" | "payroll" | "none";

type PayrollSlot = {
  employee_id: number;
  month: number;
  cutoff: Cutoff;
  amount: number;
};
type ManualSlot = PayrollSlot;
type MetaRow = {
  employee_id: number;
  start_date: string | null;
  end_date: string | null;
  remarks: string | null;
};
type ServerData = {
  payroll: PayrollSlot[];
  manual: ManualSlot[];
  meta: MetaRow[];
};
type MetaEdit = Partial<Pick<MetaRow, "start_date" | "end_date" | "remarks">>;

const EMPTY_DATA: ServerData = { payroll: [], manual: [], meta: [] };

const VIEWS: { key: View; label: string }[] = [
  { key: "form", label: "Form" },
  { key: "table", label: "Table" },
  { key: "statement", label: "Statement" },
];

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
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

// The 24 columns of the sheet: 1/1-15, 1/16-31, 2/1-15, ...
const SLOTS: { month: number; cutoff: Cutoff }[] = Array.from(
  { length: 12 },
  (_, i) => [
    { month: i + 1, cutoff: "1-15" as Cutoff },
    { month: i + 1, cutoff: "16-30" as Cutoff },
  ],
).flat();

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

const getPayrollName = (e: Employee) => {
  const x = e as any;
  const given = [x.first_name, x.middle_name, x.suffix]
    .filter(Boolean)
    .join(" ");

  return [x.last_name, given].filter(Boolean).join(", ") || "—";
};

// Same hidden list as the payroll page (the owner).
const HIDDEN_EMPLOYEES = ["sarmiento, angelle samson"];
const isHidden = (e: Employee) =>
  HIDDEN_EMPLOYEES.includes(getPayrollName(e).trim().toLowerCase());

const lastDayOfMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

// Column label exactly as in the sheet: "1/1-15/2026", "1/16-31/2026"
const slotLabel = (
  year: number,
  s: { month: number; cutoff: Cutoff },
): string =>
  s.cutoff === "1-15"
    ? `${s.month}/1-15/${year}`
    : `${s.month}/16-${lastDayOfMonth(year, s.month)}/${year}`;

const slotKey = (id: number, month: number, cutoff: Cutoff) =>
  `${id}|${month}|${cutoff}`;

const dateOnly = (v: string | null | undefined) => String(v ?? "").slice(0, 10);

// "2025-11-10" -> "November 10, 2025"
const prettyDate = (iso: string): string => {
  if (!iso) return "";

  const d = new Date(`${iso}T00:00:00`);

  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
};

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("adminSessionActive")
      : null;
  const headers = new Headers(init?.headers);

  headers.set("Accept", "application/json");
  if (init?.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { cache: "no-store", ...init, headers });
  const raw = await response.text();
  let data: any = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error("The server returned an unexpected response.");
  }

  if (!response.ok) {
    const firstError = data?.errors
      ? (Object.values(data.errors)[0] as string[] | undefined)?.[0]
      : null;

    throw new Error(
      firstError || data?.message || `Request failed (${response.status}).`,
    );
  }

  return data as T;
}

// ── Statement card (one employee, same look as the sheet) ──
type StatementInput = {
  idNumber: string;
  name: string;
  salary: number;
  months: [number, number][]; // [1-15, 16-end] for Jan..Dec
  total: number;
  prorated: number;
};

// Draws the card on a canvas and returns it as a JPG data URL.
const statementDataUrl = (s: StatementInput): string => {
  const SCALE = 2;
  const W = 310;
  const COL = 155;
  const H_HEAD = 26;
  const H_SAL = 20;
  const H_ROW = 17;
  const H_TOTAL = 20;
  const H_PRO = 34;
  const yMonths = H_HEAD + H_SAL;
  const yTotal = yMonths + 24 * H_ROW;
  const yPro = yTotal + H_TOTAL;
  const H = yPro + H_PRO;
  const FONT = "Arial, Helvetica, sans-serif";

  const canvas = document.createElement("canvas");

  canvas.width = W * SCALE;
  canvas.height = H * SCALE;

  const ctx = canvas.getContext("2d");

  if (!ctx) return "";
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const band = (y: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, y, W, h);
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const text = (
    t: string,
    cx: number,
    cy: number,
    opts: { size?: number; bold?: boolean; color?: string } = {},
  ) => {
    ctx.font = `${opts.bold ? "bold " : ""}${opts.size ?? 11}px ${FONT}`;
    ctx.fillStyle = opts.color ?? "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t, cx, cy);
  };
  const amount = (n: number) => (n === 0 ? "--" : money(n));

  // colored rows
  band(0, H_HEAD, "#c9eaf7");
  band(H_HEAD, H_SAL, "#d9e2f3");
  band(yTotal, H_TOTAL, "#c9eaf7");

  // header: ID | name (shrinks if the name is long)
  text(`ID ${s.idNumber}`, COL / 2, H_HEAD / 2, { bold: true, size: 11 });

  let nameSize = 11;

  ctx.font = `bold ${nameSize}px ${FONT}`;
  while (ctx.measureText(s.name).width > COL - 12 && nameSize > 7) {
    nameSize -= 0.5;
    ctx.font = `bold ${nameSize}px ${FONT}`;
  }
  text(s.name, COL + COL / 2, H_HEAD / 2, { bold: true, size: nameSize });

  // salary
  text("SALARY + DM", COL / 2, H_HEAD + H_SAL / 2, { size: 9 });
  text(money(s.salary), COL + COL / 2, H_HEAD + H_SAL / 2, { size: 10 });

  // months: label centered over its two rows, amount on each row
  MONTHS.forEach((m, i) => {
    const top = yMonths + i * 2 * H_ROW;

    text(m, COL / 2, top + H_ROW, { size: 10 });
    text(amount(s.months[i]?.[0] ?? 0), COL + COL / 2, top + H_ROW / 2, {
      size: 10,
    });
    text(amount(s.months[i]?.[1] ?? 0), COL + COL / 2, top + H_ROW * 1.5, {
      size: 10,
    });
  });

  // total + prorated
  text("Total", COL / 2, yTotal + H_TOTAL / 2, { size: 9 });
  text(money(s.total), COL + COL / 2, yTotal + H_TOTAL / 2, { size: 10 });
  text("PRORATED 13TH", COL / 2, yPro + H_PRO / 2 - 7, { bold: true, size: 9 });
  text("MONTH", COL / 2, yPro + H_PRO / 2 + 7, { bold: true, size: 9 });
  text(money(s.prorated), COL + COL / 2, yPro + H_PRO / 2, {
    bold: true,
    size: 12,
    color: "#e00000",
  });

  // lines
  line(0, H_HEAD, W, H_HEAD);
  line(0, yMonths, W, yMonths);
  line(0, yTotal, W, yTotal);
  line(0, yPro, W, yPro);
  line(COL, 0, COL, H);

  // thick outer border
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  return canvas.toDataURL("image/jpeg", 0.95);
};

const downloadStatement = (s: StatementInput, year: number) => {
  const url = statementDataUrl(s);

  if (!url) return;

  const a = document.createElement("a");

  a.href = url;
  a.download = `13thMonth_${year}_${s.idNumber}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

// ── Excel / JPG export columns (same order as the table) ──
const EXPORT_COLUMNS = (year: number): ExportColumn[] => [
  { label: "EMPLOYEE ID", group: "details", kind: "text" },
  { label: "EMPLOYEE NAME", group: "details", kind: "name" },
  { label: "MO.RATE", group: "details", kind: "amount" },
  ...SLOTS.map(
    (s): ExportColumn => ({
      label: slotLabel(year, s),
      group: "earnings",
      kind: "money",
    }),
  ),
  { label: "SUM TOTAL", group: "net", kind: "amount" },
  { label: "PRO RATED 13/MO", group: "net", kind: "amount" },
];

// ── small UI pieces ──
const TH =
  "whitespace-nowrap border border-slate-300 px-2 py-2 text-center text-[10px] font-bold leading-tight text-slate-800";
const TD = "border border-slate-200 px-1 py-1 text-right text-xs";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
      {children}
    </h3>
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

export default function ThirteenthMonthPage() {
  const router = useRouter();
  const requestIdRef = useRef(0);
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [view, setView] = useState<View>("form");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(true);

  const [data, setData] = useState<ServerData>(EMPTY_DATA);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Unsaved changes.
  //   edits[key] = the text in the box ("" = go back to the payroll amount)
  //   metaEdits[employeeId] = changed start / end date / remarks
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [metaEdits, setMetaEdits] = useState<Record<number, MetaEdit>>({});

  const dirtyCount = Object.keys(edits).length + Object.keys(metaEdits).length;
  const dirty = dirtyCount > 0;

  // ── auth ──
  useEffect(() => {
    if (!localStorage.getItem("adminSessionActive")) {
      router.push("/admin/login");
    }
  }, [router]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);

    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ── employees (same endpoint as the payroll page) ──
  useEffect(() => {
    (async () => {
      try {
        setEmployees(await fetchPayrollEmployees<Employee>());
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load employee records",
        );
      } finally {
        setEmpLoading(false);
      }
    })();
  }, []);

  // ── 13th month data of the year ──
  const loadData = async (y: number) => {
    const requestId = ++requestIdRef.current;

    setDataLoading(true);
    try {
      const res = await apiFetch<{ data: ServerData }>(`${API}?year=${y}`);

      if (requestId !== requestIdRef.current) return;
      setData({
        payroll: res.data?.payroll ?? [],
        manual: res.data?.manual ?? [],
        meta: res.data?.meta ?? [],
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setData(EMPTY_DATA);
      toast.error(
        error instanceof Error ? error.message : "Failed to load 13th month",
      );
    } finally {
      if (requestId === requestIdRef.current) setDataLoading(false);
    }
  };

  useEffect(() => {
    loadData(year);
  }, [year]);

  const loading = empLoading || dataLoading;

  // ── lookups ──
  const payrollMap = useMemo(() => {
    const m = new Map<string, number>();

    for (const p of data.payroll) {
      const k = slotKey(p.employee_id, p.month, p.cutoff);

      m.set(k, (m.get(k) ?? 0) + Number(p.amount));
    }

    return m;
  }, [data.payroll]);

  const manualMap = useMemo(() => {
    const m = new Map<string, number>();

    for (const p of data.manual) {
      m.set(slotKey(p.employee_id, p.month, p.cutoff), Number(p.amount));
    }

    return m;
  }, [data.manual]);

  const metaMap = useMemo(() => {
    const m = new Map<number, MetaRow>();

    for (const r of data.meta) m.set(Number(r.employee_id), r);

    return m;
  }, [data.meta]);

  // Employees who have something in this year (payroll or manual).
  const idsWithData = useMemo(() => {
    const s = new Set<number>();

    data.payroll.forEach((p) => s.add(Number(p.employee_id)));
    data.manual.forEach((p) => s.add(Number(p.employee_id)));

    return s;
  }, [data.payroll, data.manual]);

  // Amount of one slot: typed value > saved manual > payroll > nothing.
  const valueOf = (
    id: number,
    month: number,
    cutoff: Cutoff,
  ): { amount: number; source: Source } => {
    const k = slotKey(id, month, cutoff);
    const typed = edits[k];
    const payroll = payrollMap.get(k);
    const manual = manualMap.get(k);

    if (typed !== undefined) {
      if (typed.trim() === "") {
        return payroll !== undefined
          ? { amount: payroll, source: "payroll" }
          : { amount: 0, source: "none" };
      }

      return { amount: num(typed), source: "manual" };
    }
    if (manual !== undefined) return { amount: manual, source: "manual" };
    if (payroll !== undefined) return { amount: payroll, source: "payroll" };

    return { amount: 0, source: "none" };
  };

  const totalOf = (id: number): number =>
    round2(
      SLOTS.reduce((sum, s) => sum + valueOf(id, s.month, s.cutoff).amount, 0),
    );

  // Pro-rated 13th month = sum of the year / 12
  const proratedOf = (total: number): number => round2(total / 12);

  const metaOf = (id: number) => {
    const saved = metaMap.get(id);
    const edit = metaEdits[id] ?? {};

    return {
      start_date: dateOnly(
        edit.start_date !== undefined ? edit.start_date : saved?.start_date,
      ),
      end_date: dateOnly(
        edit.end_date !== undefined ? edit.end_date : saved?.end_date,
      ),
      remarks: String(
        edit.remarks !== undefined ? edit.remarks : (saved?.remarks ?? ""),
      ),
    };
  };

  // ── editing ──
  const setSlot = (id: number, month: number, cutoff: Cutoff, text: string) => {
    const k = slotKey(id, month, cutoff);
    const original = manualMap.has(k) ? String(manualMap.get(k)) : "";

    setEdits((prev) => {
      const next = { ...prev };

      // Back to what is already saved -> not a change anymore.
      if (text === original) delete next[k];
      else next[k] = text;

      return next;
    });
  };

  const setMeta = (id: number, field: keyof MetaEdit, value: string) => {
    const saved = metaMap.get(id);
    const original =
      field === "remarks"
        ? String(saved?.remarks ?? "")
        : dateOnly(saved?.[field]);

    setMetaEdits((prev) => {
      const next = { ...prev };
      const row = { ...(next[id] ?? {}) };

      if (value === original) delete row[field];
      else row[field] = value;

      if (Object.keys(row).length === 0) delete next[id];
      else next[id] = row;

      return next;
    });
  };

  // ── which employees are listed ──
  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return employees
      .filter((e) => !isHidden(e))
      .filter((e) => isActive(e) || idsWithData.has(e.id))
      .filter(
        (e) =>
          !q ||
          getPayrollName(e).toLowerCase().includes(q) ||
          String(e.id_number ?? "")
            .toLowerCase()
            .includes(q),
      )
      .slice()
      .sort((a, b) => {
        // 1) Active muna, then yung iba sa ilalim
        const byStatus = Number(isActive(b)) - Number(isActive(a));

        if (byStatus !== 0) return byStatus;

        // 2) Sa loob ng bawat group, sort by ID number
        return String(a.id_number ?? "").localeCompare(
          String(b.id_number ?? ""),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      });
  }, [employees, searchQuery, idsWithData]);

  // Everything computed per employee (recomputed on every edit).
  const computed = rows.map((employee) => {
    const total = totalOf(employee.id);

    return {
      employee,
      total,
      prorated: proratedOf(total),
      meta: metaOf(employee.id),
    };
  });

  const grand = computed.reduce(
    (acc, c) => ({
      total: acc.total + c.total,
      prorated: acc.prorated + c.prorated,
    }),
    { total: 0, prorated: 0 },
  );

  // Data of one employee's statement card (uses what is on screen now).
  const statementOf = ({
    employee,
    total,
    prorated,
  }: (typeof computed)[number]): StatementInput => ({
    idNumber: String(employee.id_number ?? ""),
    name: getPayrollName(employee),
    salary: num(employee.salary) + num(employee.de_minimis),
    months: MONTHS.map(
      (_, i) =>
        [
          valueOf(employee.id, i + 1, "1-15").amount,
          valueOf(employee.id, i + 1, "16-30").amount,
        ] as [number, number],
    ),
    total,
    prorated,
  });

  const downloadAllStatements = () => {
    if (computed.length === 0) return;
    // small gap between files so the browser does not block the downloads
    computed.forEach((c, i) =>
      window.setTimeout(() => downloadStatement(statementOf(c), year), i * 300),
    );
  };

  const missingRates = rows.filter((e) => num(e.salary) === 0).length;

  const selectedIndex = Math.max(
    0,
    computed.findIndex((c) => c.employee.id === selectedId),
  );
  const current = computed[selectedIndex];
  const goTo = (i: number) => {
    const t = computed[i];

    if (t) setSelectedId(t.employee.id);
  };

  // ── year change ──
  const changeYear = (y: number) => {
    if (
      dirty &&
      !window.confirm("You have unsaved changes. Switch year and discard them?")
    ) {
      return;
    }
    setEdits({});
    setMetaEdits({});
    setYear(y);
  };

  // ── save ──
  const handleSave = async () => {
    if (!dirty) return;

    // One entry per employee that has something changed.
    const ids = new Set<number>();

    Object.keys(edits).forEach((k) => ids.add(Number(k.split("|")[0])));
    Object.keys(metaEdits).forEach((id) => ids.add(Number(id)));

    const entries = Array.from(ids).map((employee_id) => {
      const slots = Object.entries(edits)
        .filter(([k]) => Number(k.split("|")[0]) === employee_id)
        .map(([k, text]) => {
          const [, month, cutoff] = k.split("|");

          return {
            month: Number(month),
            cutoff: cutoff as Cutoff,
            // blank -> null -> the backend removes the manual amount
            amount: text.trim() === "" ? null : num(text),
          };
        });

      return {
        employee_id,
        ...(metaEdits[employee_id] ?? {}),
        ...(slots.length ? { slots } : {}),
      };
    });

    setSaving(true);
    try {
      await apiFetch(API, {
        method: "POST",
        body: JSON.stringify({ year, entries }),
      });
      toast.success(`13th month ${year} saved.`);
      setEdits({});
      setMetaEdits({});
      await loadData(year);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save 13th month",
      );
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    setEdits({});
    setMetaEdits({});
    toast("Changes discarded.", { icon: "↩️" });
  };

  // ── export (everything shown) ──
  const handleExport = (type: "xlsx" | "jpg") => {
    if (computed.length === 0) {
      toast.error("Nothing to export.");

      return;
    }
    if (dirty) toast("Exporting with your unsaved changes.", { icon: "ℹ️" });

    const columns = EXPORT_COLUMNS(year);
    const exportData: PayrollExportData = {
      title: `13th Month Pay ${year} (${computed.length} employees)`,
      fileName: `13thMonth_${year}`,
      columns,
      rows: computed.map(({ employee, total, prorated }) => [
        String(employee.id_number ?? ""),
        getPayrollName(employee),
        num(employee.salary),
        ...SLOTS.map((s) => valueOf(employee.id, s.month, s.cutoff).amount),
        total,
        prorated,
      ]),
      totals: {
        [columns.findIndex((c) => c.label === "SUM TOTAL")]: grand.total,
        [columns.findIndex((c) => c.label === "PRO RATED 13/MO")]:
          grand.prorated,
      },
    };

    try {
      if (type === "xlsx") exportPayrollXlsx(exportData);
      else exportPayrollJpg(exportData);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export the table",
      );
    }
  };

  const yearOptions = [year - 2, year - 1, year, year + 1];

  // One editable amount box. Blue placeholder = amount from payroll,
  // amber = typed by hand (manual). Clear the box to use payroll again.
  const renderSlotInput = (
    id: number,
    month: number,
    cutoff: Cutoff,
    wide = false,
  ) => {
    const k = slotKey(id, month, cutoff);
    const { source } = valueOf(id, month, cutoff);
    const payroll = payrollMap.get(k);
    const shown =
      edits[k] ?? (manualMap.has(k) ? String(manualMap.get(k)) : "");

    return (
      <input
        aria-label={`${month}/${cutoff} amount`}
        className={`h-8 ${wide ? "w-full" : "w-[104px]"} rounded border px-2 text-right text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-600 placeholder:text-blue-600 ${
          source === "manual"
            ? "border-amber-300 bg-amber-50 font-semibold text-amber-900"
            : "border-transparent bg-white text-slate-900 hover:border-slate-200"
        } ${edits[k] !== undefined ? "ring-1 ring-amber-400" : ""}`}
        disabled={dataLoading}
        inputMode="decimal"
        placeholder={payroll !== undefined ? money(payroll) : "—"}
        step="any"
        title={
          source === "manual"
            ? payroll !== undefined
              ? `Typed by hand. Payroll amount: ${money(payroll)}. Clear to use payroll.`
              : "Typed by hand. Clear to remove."
            : payroll !== undefined
              ? "From saved payroll. Type to override."
              : "No saved payroll. Type to add."
        }
        type="number"
        value={shown}
        onChange={(e) => setSlot(id, month, cutoff, e.target.value)}
      />
    );
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg">
        <div className="mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
              <Gift className="h-6 w-6 text-white sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
                13th Month Pay
              </h1>
              <p className="mt-1 text-sm text-blue-100">
                Year {year} · Basic pay − LWOP − Tardiness, divided by 12
              </p>
            </div>
          </div>

          {!loading && (
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-blue-100">
              <span>
                <span className="font-semibold text-white">{rows.length}</span>{" "}
                employees
              </span>
              <span className="hidden h-4 w-px bg-white/30 sm:block" />
              <span>
                Sum total{" "}
                <span className="font-semibold text-white">
                  ₱{money(grand.total)}
                </span>
              </span>
              <span className="hidden h-4 w-px bg-white/30 sm:block" />
              <span>
                Pro-rated 13th month{" "}
                <span className="font-semibold text-white">
                  ₱{money(grand.prorated)}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="w-full min-w-0 space-y-5 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        {/* ── Controls ── */}
        <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <Select
                value={String(year)}
                onValueChange={(v) => changeYear(Number(v))}
              >
                <SelectTrigger className="h-10 w-[100px]">
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

              <div className="relative min-w-[220px] max-w-sm flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  aria-label="Search employees"
                  className="h-10 pl-9"
                  placeholder="Search by name or ID number"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  className="h-10"
                  disabled={loading || computed.length === 0}
                  type="button"
                  variant="outline"
                  onClick={() => handleExport("xlsx")}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Excel
                </Button>
                <Button
                  className="h-10"
                  disabled={loading || computed.length === 0}
                  type="button"
                  variant="outline"
                  onClick={() => handleExport("jpg")}
                >
                  <FileImage className="mr-2 h-4 w-4" />
                  JPG
                </Button>

                {dirty && (
                  <Button
                    className="h-10"
                    disabled={saving}
                    type="button"
                    variant="ghost"
                    onClick={discardChanges}
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    Discard
                  </Button>
                )}
                <Button
                  className="h-10 bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                  disabled={!dirty || saving || loading}
                  type="button"
                  onClick={handleSave}
                >
                  {saving ? (
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saving
                    ? "Saving..."
                    : dirty
                      ? `Save 13th month (${dirtyCount})`
                      : "Save 13th month"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-blue-300 bg-white" />
                <span className="text-blue-600">Blue</span> = from saved payroll
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-50" />
                <span className="text-amber-700">Amber</span> = typed by hand
                (wins over payroll)
              </span>
              <span>Clear a box to go back to the payroll amount.</span>
            </div>

            {missingRates > 0 && (
              <p className="text-xs text-red-600">
                {missingRates} employee{missingRates === 1 ? "" : "s"} have no
                monthly rate in the masterfile.
              </p>
            )}
          </div>
        </Card>

        {view === "table" ? (
          /* ───────────── TABLE VIEW (the sheet) ───────────── */
          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardContent className="p-0">
              <div className="max-h-[72vh] w-full overflow-auto">
                <table className="w-max border-collapse text-slate-800">
                  <thead className="sticky top-0 z-30">
                    <tr>
                      <th
                        className={`${TH} sticky left-0 z-40 w-[90px] min-w-[90px] bg-green-200`}
                      >
                        EMPLOYEE ID
                      </th>
                      <th
                        className={`${TH} sticky left-[90px] z-40 w-[230px] min-w-[230px] bg-green-200`}
                      >
                        EMPLOYEE NAME
                      </th>
                      <th
                        className={`${TH} w-[100px] min-w-[100px] bg-green-200`}
                      >
                        MO.RATE
                      </th>
                      {SLOTS.map((s) => (
                        <th
                          key={`${s.month}-${s.cutoff}`}
                          className={`${TH} w-[112px] min-w-[112px] ${
                            s.month % 2 === 1 ? "bg-green-100" : "bg-lime-100"
                          }`}
                        >
                          {slotLabel(year, s)}
                        </th>
                      ))}
                      <th
                        className={`${TH} w-[120px] min-w-[120px] bg-amber-100`}
                      >
                        SUM TOTAL
                      </th>
                      <th
                        className={`${TH} w-[130px] min-w-[130px] bg-lime-300`}
                      >
                        PRO RATED 13/MO
                      </th>
                      <th
                        className={`${TH} w-[150px] min-w-[150px] bg-yellow-300`}
                      >
                        START DATE
                      </th>
                      <th
                        className={`${TH} w-[150px] min-w-[150px] bg-red-400`}
                      >
                        END DATE
                      </th>
                      <th
                        className={`${TH} w-[200px] min-w-[200px] bg-slate-200`}
                      >
                        REMARKS
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          className="h-48 text-center text-xs text-slate-500"
                          colSpan={3 + SLOTS.length + 5}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Loader className="h-4 w-4 animate-spin" />
                            Loading 13th month...
                          </span>
                        </td>
                      </tr>
                    ) : computed.length === 0 ? (
                      <tr>
                        <td
                          className="h-48 text-center text-xs text-slate-500"
                          colSpan={3 + SLOTS.length + 5}
                        >
                          No employees match your search.
                        </td>
                      </tr>
                    ) : (
                      computed.map(({ employee, total, prorated, meta }) => {
                        const id = employee.id;

                        return (
                          <tr key={id} className="hover:bg-blue-50/40">
                            <td className="sticky left-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-3 py-1.5 text-center font-mono text-xs">
                              {employee.id_number}
                            </td>
                            <td className="sticky left-[90px] z-10 whitespace-nowrap border border-slate-200 bg-yellow-100 px-3 py-1.5 text-left text-xs font-medium">
                              {getPayrollName(employee)}
                              {!isActive(employee) && (
                                <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                                  ({String(employee.status)})
                                </span>
                              )}
                            </td>
                            <td
                              className={`${TD} bg-slate-50 px-2 text-slate-500`}
                            >
                              {money(num(employee.salary))}
                            </td>

                            {SLOTS.map((s) => (
                              <td
                                key={`${s.month}-${s.cutoff}`}
                                className={`${TD} bg-white`}
                              >
                                {renderSlotInput(id, s.month, s.cutoff)}
                              </td>
                            ))}

                            <td
                              className={`${TD} bg-amber-50 px-2 font-bold tabular-nums`}
                            >
                              {money(total)}
                            </td>
                            <td
                              className={`${TD} bg-lime-100 px-2 font-bold tabular-nums`}
                            >
                              {money(prorated)}
                            </td>
                            <td className={`${TD} bg-white`}>
                              <input
                                aria-label="Start date"
                                className="h-8 w-full rounded border border-transparent px-1 text-center text-xs outline-none hover:border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-600"
                                type="date"
                                value={meta.start_date}
                                onChange={(e) =>
                                  setMeta(id, "start_date", e.target.value)
                                }
                              />
                            </td>
                            <td className={`${TD} bg-white`}>
                              <input
                                aria-label="End date"
                                className="h-8 w-full rounded border border-transparent px-1 text-center text-xs outline-none hover:border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-600"
                                type="date"
                                value={meta.end_date}
                                onChange={(e) =>
                                  setMeta(id, "end_date", e.target.value)
                                }
                              />
                            </td>
                            <td className={`${TD} bg-white`}>
                              <input
                                aria-label="Remarks"
                                className="h-8 w-full rounded border border-transparent px-2 text-left text-xs outline-none hover:border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-600"
                                maxLength={255}
                                placeholder="—"
                                type="text"
                                value={meta.remarks}
                                onChange={(e) =>
                                  setMeta(id, "remarks", e.target.value)
                                }
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {!loading && computed.length > 0 && (
                    <tfoot className="sticky bottom-0 z-30">
                      <tr className="bg-slate-100 text-xs font-bold">
                        <td
                          className="sticky left-0 border border-slate-300 bg-slate-100 px-3 py-2 text-right"
                          colSpan={3 + SLOTS.length}
                        >
                          TOTAL
                        </td>
                        <td className="border border-slate-300 bg-amber-100 px-2 py-2 text-right tabular-nums">
                          {money(grand.total)}
                        </td>
                        <td className="border border-slate-300 bg-lime-200 px-2 py-2 text-right tabular-nums">
                          {money(grand.prorated)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        ) : view === "form" ? (
          /* ───────────── FORM VIEW (one employee) ───────────── */
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Employee list */}
            <Card className="flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                {loading ? (
                  <li className="flex h-40 items-center justify-center text-sm text-slate-500">
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Loading 13th month...
                  </li>
                ) : computed.length === 0 ? (
                  <li className="flex h-40 items-center justify-center px-4 text-center text-sm text-slate-500">
                    No employees match your search.
                  </li>
                ) : (
                  computed.map(({ employee, prorated }, i) => (
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
                        <p className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">
                          {money(prorated)}
                        </p>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </Card>

            {/* Employee form */}
            <Card className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {!current ? (
                <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                  {loading ? "Loading..." : "Select an employee."}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-slate-900">
                        {getPayrollName(current.employee)}
                      </h2>
                      <p className="text-xs text-slate-500">
                        ID {current.employee.id_number} · {year} ·{" "}
                        {selectedIndex + 1} of {computed.length}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
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

                  <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="min-w-0 space-y-6">
                      <section>
                        <SectionTitle>Employment</SectionTitle>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-600">
                              Start date
                            </span>
                            <Input
                              className="h-10"
                              type="date"
                              value={current.meta.start_date}
                              onChange={(e) =>
                                setMeta(
                                  current.employee.id,
                                  "start_date",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-600">
                              End date
                            </span>
                            <Input
                              className="h-10"
                              type="date"
                              value={current.meta.end_date}
                              onChange={(e) =>
                                setMeta(
                                  current.employee.id,
                                  "end_date",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-600">
                              Remarks
                            </span>
                            <Input
                              className="h-10"
                              maxLength={255}
                              value={current.meta.remarks}
                              onChange={(e) =>
                                setMeta(
                                  current.employee.id,
                                  "remarks",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                        </div>
                      </section>

                      <section>
                        <SectionTitle>Amount per cut-off</SectionTitle>
                        <div className="overflow-hidden rounded-xl border border-slate-200">
                          <div className="grid grid-cols-[110px_1fr_1fr] bg-slate-100 text-xs font-semibold text-slate-700">
                            <div className="px-3 py-2">Month</div>
                            <div className="px-3 py-2 text-center">1-15</div>
                            <div className="px-3 py-2 text-center">16-end</div>
                          </div>
                          {MONTHS.map((m, i) => (
                            <div
                              key={m}
                              className="grid grid-cols-[110px_1fr_1fr] items-center border-t border-slate-100"
                            >
                              <div className="px-3 py-1.5 text-sm text-slate-700">
                                {MONTHS_SHORT[i]}
                              </div>
                              <div className="px-2 py-1">
                                {renderSlotInput(
                                  current.employee.id,
                                  i + 1,
                                  "1-15",
                                  true,
                                )}
                              </div>
                              <div className="px-2 py-1">
                                {renderSlotInput(
                                  current.employee.id,
                                  i + 1,
                                  "16-30",
                                  true,
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>

                    {/* Live computation */}
                    <aside className="h-fit space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 xl:sticky xl:top-4">
                      <SectionTitle>Computation</SectionTitle>
                      <ReadOnly
                        label="Monthly rate"
                        value={money(num(current.employee.salary))}
                      />
                      <ReadOnly
                        label="Sum of the year"
                        value={money(current.total)}
                      />
                      <div className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 text-white">
                        <p className="text-xs text-blue-100">
                          Pro-rated 13th month
                        </p>
                        <p className="text-2xl font-bold tabular-nums">
                          ₱{money(current.prorated)}
                        </p>
                        <p className="mt-1 text-[11px] text-blue-100">
                          {money(current.total)} ÷ 12
                        </p>
                      </div>
                    </aside>
                  </div>
                </div>
              )}
            </Card>
          </div>
        ) : (
          /* ───────────── STATEMENT VIEW (image card per employee) ───────────── */
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                {loading ? (
                  <li className="flex h-40 items-center justify-center text-sm text-slate-500">
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Loading 13th month...
                  </li>
                ) : computed.length === 0 ? (
                  <li className="flex h-40 items-center justify-center px-4 text-center text-sm text-slate-500">
                    No employees match your search.
                  </li>
                ) : (
                  computed.map(({ employee, prorated }, i) => (
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
                        <p className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">
                          {money(prorated)}
                        </p>
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <div className="border-t border-slate-100 p-3">
                <Button
                  className="h-9 w-full"
                  disabled={loading || computed.length === 0}
                  type="button"
                  variant="outline"
                  onClick={downloadAllStatements}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download all ({computed.length})
                </Button>
              </div>
            </Card>

            <Card className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {!current ? (
                <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                  {loading ? "Loading..." : "Select an employee."}
                </div>
              ) : (
                (() => {
                  const stmt = statementOf(current);
                  const url = statementDataUrl(stmt);

                  return (
                    <div>
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-semibold text-slate-900">
                            {stmt.name}
                          </h2>
                          <p className="text-xs text-slate-500">
                            ID {stmt.idNumber} · {year} · {selectedIndex + 1} of{" "}
                            {computed.length}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            className="h-9 px-3"
                            disabled={selectedIndex === 0}
                            type="button"
                            variant="outline"
                            onClick={() => goTo(selectedIndex - 1)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            className="h-9 px-3"
                            disabled={selectedIndex >= computed.length - 1}
                            type="button"
                            variant="outline"
                            onClick={() => goTo(selectedIndex + 1)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          <Button
                            className="h-9 bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                            type="button"
                            onClick={() => downloadStatement(stmt, year)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            JPG
                          </Button>
                        </div>
                      </div>

                      <div className="flex justify-center overflow-auto bg-slate-50 p-4 sm:p-6">
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={`13th month statement of ${stmt.name}`}
                            className="w-full max-w-[420px] border border-slate-200 bg-white shadow-sm"
                            src={url}
                          />
                        ) : (
                          <p className="text-sm text-slate-500">
                            Unable to draw the statement.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </Card>
          </div>
        )}

        {/* ── Guide (same as the sheet) ── */}
        {/* <div className="rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-xs text-slate-700">
          <p className="font-bold text-slate-900">
            Guide: computation of 13th month pay (per cut-off basis)
          </p>
          <p className="mt-1">
            13th month pay (per cut-off) = Basic pay − Leave without pay (LWOP)
            − Tardiness. Pro-rated 13th month = sum of all cut-offs ÷ 12.
          </p>
          <p>
            Excluded: overtime pay, allowances, bonuses, incentives, government
            deductions. To be released on or before December 24.
          </p>
        </div> */}
      </div>
    </div>
  );
}
