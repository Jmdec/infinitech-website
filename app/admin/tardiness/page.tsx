"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
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

// ── Tardiness rules ──────────────────────────────────────────────
// Shift starts 8:00 AM. 1–5 minutes is inside the grace period: not late,
// not counted. 6 minutes or more is late (red) and counted.
const SHIFT_START_MINUTES = 8 * 60;
const GRACE_MINUTES = 5;
const MAX_CHIPS = 3;
const PAGE_SIZE = 10;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type TardyRecord = {
  id: number;
  employee_id: number;
  employee_number: string;
  employee_name: string;
  nickname: string | null;
  department: string;
  position: string;
  date: string; // yyyy-MM-dd
  time_in: string; // HH:mm or HH:mm:ss
};
type Row = TardyRecord & { minutes: number; late: boolean; label: string };
type EmployeeOption = {
  id: number;
  employee_id: string;
  name: string;
  nickname: string | null;
  department: string;
  position: string;
};
type Form = { employee_number: string; date: string; time_in: string };
type Cutoff = "all" | "first" | "second";
type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
};

const EMPTY_FORM: Form = { employee_number: "", date: "", time_in: "" };
const GRID_7: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
};
const selectClass =
  "h-9 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const minutesLate = (t: string) =>
  Math.max(0, toMinutes(t) - SHIFT_START_MINUTES);
const format12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return format(new Date(2000, 0, 1, h, m), "h:mm a");
};
// "1 min", "13 mins"
const mins = (n: number) => `${n} ${n === 1 ? "min" : "mins"}`;
// "1 late", "2 lates"
const lates = (n: number) => `${n} ${n === 1 ? "late" : "lates"}`;
// Calendar chip colors: late = red (counted), grace = gray, on time = green
const chipClass = (r: { late: boolean; minutes: number }) =>
  r.late
    ? "bg-rose-100 text-rose-950 hover:bg-rose-200"
    : r.minutes > 0
      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
      : "bg-emerald-100 text-emerald-950 hover:bg-emerald-200";
const chipNote = (r: { late: boolean; minutes: number }) =>
  r.late
    ? `${mins(r.minutes)} late`
    : r.minutes > 0
      ? `${mins(r.minutes)}, within grace period (not counted)`
      : "on time";
const dateValue = (d: Date) => format(d, "yyyy-MM-dd");
const parseDay = (v: string) => new Date(`${v}T00:00:00`);

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

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

function LateBadge({ row }: { row: Row }) {
  const style = row.late
    ? "bg-rose-50 text-rose-800 ring-rose-600/20"
    : row.minutes > 0
      ? "bg-slate-50 text-slate-700 ring-slate-500/20"
      : "bg-emerald-50 text-emerald-800 ring-emerald-600/20";
  const text = row.late
    ? `${mins(row.minutes)} late`
    : row.minutes > 0
      ? `${mins(row.minutes)} (grace)`
      : "On time";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {text}
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

export default function TardinessPage() {
  const [records, setRecords] = useState<TardyRecord[]>([]);
  // All employees (used by the Summary tab)
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  // Employee picker (used by the Log / Edit dialog)
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeeOption | null>(null);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"calendar" | "list" | "summary">("calendar");
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [lateOnly, setLateOnly] = useState(false);
  const [cutoff, setCutoff] = useState<Cutoff>(
    new Date().getDate() <= 15 ? "first" : "second",
  );
  const [hideZero, setHideZero] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [selected, setSelected] = useState<Row | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null,
  );
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(
    null,
  );

  const today = new Date();
  const monthKey = format(month, "yyyy-MM");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/tardiness?month=${monthKey}`, {
        cache: "no-store",
      });
      setRecords((await readJson<{ data: TardyRecord[] }>(res)).data);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to load tardiness records.",
      );
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  // All employees, for the Summary tab
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch(
          "/api/admin/tardiness?resource=employees",
          { cache: "no-store" },
        );
        setEmployees((await readJson<{ data: EmployeeOption[] }>(res)).data);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Unable to load employees.",
        );
      }
    })();
  }, []);

  // Employee picker: search the server as the user types
  const searchEmployees = useCallback(async (q: string) => {
    try {
      const params = new URLSearchParams({ resource: "employees" });
      if (q.trim()) params.set("search", q.trim());
      const res = await adminFetch(`/api/admin/tardiness?${params}`, {
        cache: "no-store",
      });
      setEmployeeOptions(
        (await readJson<{ data: EmployeeOption[] }>(res)).data,
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to search employees.",
      );
    }
  }, []);

  useEffect(() => {
    if (!formOpen || editing) return;
    const t = window.setTimeout(() => void searchEmployees(employeeQuery), 250);
    return () => window.clearTimeout(t);
  }, [employeeQuery, formOpen, editing, searchEmployees]);

  const employeeMatches = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    return employeeOptions
      .filter(
        (e) =>
          !q ||
          [e.employee_id, e.name, e.nickname || "", e.department].some((v) =>
            v.toLowerCase().includes(q),
          ),
      )
      .slice(0, 8);
  }, [employeeOptions, employeeQuery]);

  useEffect(() => setPage(1), [search, department, lateOnly, monthKey]);

  // Enrich + filter
  const rows = useMemo<Row[]>(
    () =>
      records.map((r) => {
        const minutes = minutesLate(r.time_in);
        return {
          ...r,
          minutes,
          late: minutes > GRACE_MINUTES,
          label: r.nickname || r.employee_name,
        };
      }),
    [records],
  );

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(
        (r) =>
          (!q ||
            [
              r.employee_number,
              r.employee_name,
              r.nickname || "",
              r.department,
              r.position,
            ].some((v) => v.toLowerCase().includes(q))) &&
          (department === "All" || r.department === department) &&
          (!lateOnly || r.late),
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.time_in.localeCompare(b.time_in),
      );
  }, [rows, search, department, lateOnly]);

  const byDate = useMemo(() => {
    const map = new Map<string, Row[]>();
    filtered.forEach((r) => map.set(r.date, [...(map.get(r.date) ?? []), r]));
    return map;
  }, [filtered]);

  const stats = useMemo(() => {
    const late = filtered.filter((r) => r.late);
    return {
      lates: late.length,
      minutes: late.reduce((s, r) => s + r.minutes, 0),
      people: new Set(late.map((r) => r.employee_id)).size,
    };
  }, [filtered]);

  // Cut-off (1st–15th / 16th–end): shared by the log table and the summary
  const CUTOFF_LABEL: Record<Cutoff, string> = {
    all: "Whole month",
    first: "1st–15th",
    second: "16th–end",
  };

  const cutoffRows = useMemo(
    () =>
      filtered.filter((r) => {
        const day = Number(r.date.slice(8, 10));
        return cutoff === "all" || (cutoff === "first" ? day <= 15 : day > 15);
      }),
    [filtered, cutoff],
  );

  const summary = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<
      number,
      { name: string; label: string; minutes: number; lates: number }
    >();
    employees
      .filter(
        (e) =>
          (department === "All" || e.department === department) &&
          (!q ||
            [e.employee_id, e.name, e.nickname || "", e.department].some((v) =>
              v.toLowerCase().includes(q),
            )),
      )
      .forEach((e) =>
        map.set(e.id, {
          name: e.name,
          label: e.nickname || e.name,
          minutes: 0,
          lates: 0,
        }),
      );
    cutoffRows
      .filter((r) => r.late)
      .forEach((r) => {
        const cur = map.get(r.employee_id) ?? {
          name: r.employee_name,
          label: r.label,
          minutes: 0,
          lates: 0,
        };
        cur.minutes += r.minutes;
        cur.lates += 1;
        map.set(r.employee_id, cur);
      });
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.lates - a.lates || a.name.localeCompare(b.name));
  }, [employees, cutoffRows, department, search]);

  const summaryRows = useMemo(
    () => (hideZero || lateOnly ? summary.filter((s) => s.lates > 0) : summary),
    [summary, hideZero, lateOnly],
  );

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = addDays(startOfWeek(endOfMonth(month)), 6);
    const days: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return Array.from({ length: days.length / 7 }, (_, i) =>
      days.slice(i * 7, i * 7 + 7),
    );
  }, [month]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const dayRows = byDate.get(dateValue(selectedDate)) ?? [];

  const goToday = () => {
    setMonth(startOfMonth(today));
    setSelectedDate(today);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, date: dateValue(selectedDate) });
    setSelectedEmployee(null);
    setEmployeeQuery("");
    setFormOpen(true);
  };
  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      employee_number: r.employee_number,
      date: r.date,
      time_in: r.time_in.slice(0, 5),
    });
    setSelectedEmployee({
      id: r.employee_id,
      employee_id: r.employee_number,
      name: r.employee_name,
      nickname: r.nickname,
      department: r.department,
      position: r.position,
    });
    setEmployeeQuery(r.employee_number);
    setSelected(null);
    setFormOpen(true);
  };

  // Opens the confirmation dialog and resolves true/false
  const askConfirm = (request: ConfirmRequest) =>
    new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmRequest(request);
    });
  const settleConfirm = (confirmed: boolean) => {
    confirmResolverRef.current?.(confirmed);
    confirmResolverRef.current = null;
    setConfirmRequest(null);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedEmployee)
      return toast.error("Select an employee from the suggestions.");
    if (!form.date || !form.time_in)
      return toast.error("Enter the date and time in.");
    if (editing) {
      const ok = await askConfirm({
        title: "Save changes?",
        description: `The time-in for ${selectedEmployee.name} will be updated to ${format(parseDay(form.date), "MMM d, yyyy")} at ${format12(form.time_in)}.`,
        confirmLabel: "Save changes",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const res = await adminFetch(
        editing ? `/api/admin/tardiness/${editing.id}` : "/api/admin/tardiness",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: selectedEmployee.id,
            date: form.date,
            time_in: form.time_in,
          }),
        },
      );
      await readJson(res);
      toast.success(editing ? "Time-in updated." : "Time-in logged.");
      setFormOpen(false);
      if (form.date.slice(0, 7) !== monthKey)
        setMonth(startOfMonth(parseDay(form.date)));
      else await loadRecords();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to save time-in.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: Row) => {
    const ok = await askConfirm({
      title: "Delete this time-in?",
      description: `The time-in for ${r.employee_name} on ${format(parseDay(r.date), "MMM d, yyyy")} (${format12(r.time_in)}) will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await readJson(
        await adminFetch(`/api/admin/tardiness/${r.id}`, { method: "DELETE" }),
      );
      toast.success("Time-in deleted.");
      setSelected(null);
      await loadRecords();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to delete time-in.",
      );
    }
  };

  return (
    <section className="mx-auto max-w-[1600px] space-y-5 p-1 sm:p-2">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
                <Clock className="h-6 w-6 text-white sm:h-7 sm:w-7" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Tardiness monitoring
                </h1>
                <p className="mt-1 text-sm text-blue-100">
                  5-minute grace period. Time-ins of 6 minutes or more after
                  8:00 AM are late.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-blue-100">
              <span>
                <span className="font-semibold text-white">
                  {format(month, "MMMM yyyy")}
                </span>
              </span>
              <span className="hidden h-4 w-px bg-white/30 sm:block" />
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-300" />
                <span>
                  <span className="font-semibold text-white">
                    {stats.lates}
                  </span>{" "}
                  {stats.lates === 1 ? "late" : "lates"}
                </span>
              </span>
              <span>
                <span className="font-semibold text-white">
                  {stats.minutes}
                </span>{" "}
                total {stats.minutes === 1 ? "minute" : "minutes"} late
              </span>
              <span>
                <span className="font-semibold text-white">{stats.people}</span>{" "}
                {stats.people === 1 ? "employee" : "employees"} late
              </span>
            </div>
          </div>
          <Button
            className="h-11 shrink-0 bg-white px-5 font-semibold text-blue-700 shadow-md hover:bg-blue-50"
            onClick={openCreate}
          >
            <Plus className="mr-2 h-4 w-4" />
            Log time-in
          </Button>
        </div>
      </header>

      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div
              role="tablist"
              aria-label="Tardiness view"
              className="inline-flex shrink-0 self-start rounded-lg bg-slate-50 p-1"
              style={{ display: "inline-flex", gap: 4 }}
            >
              {(
                [
                  ["calendar", "Calendar", CalendarDays],
                  ["list", "List", List],
                  ["summary", "Summary", Users],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => setView(key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    whiteSpace: "nowrap",
                  }}
                  className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${view === key ? "bg-white text-cyan-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, nickname, ID or department"
                aria-label="Search tardiness records"
                className="pl-9"
              />
            </div>

            <select
              aria-label="Filter by department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className={selectClass}
            >
              <option value="All">All departments</option>
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={lateOnly}
                onChange={(e) => setLateOnly(e.target.checked)}
              />
              Late only
            </label>
          </div>
        </div>

        <div
          className={`grid items-start gap-6 ${view === "calendar" ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}
        >
          {/* ───────── CALENDAR ───────── */}
          {view === "calendar" && (
            <div className="min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {format(month, "MMMM yyyy")}
                  </h2>
                  <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Late (6+ mins, counted)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      Grace (1–5 mins, not counted)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      On time
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={goToday}>
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() => setMonth((v) => subMonths(v, 1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next month"
                    onClick={() => setMonth((v) => addMonths(v, 1))}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div
                    style={GRID_7}
                    className="border-b border-slate-200 bg-slate-50/70"
                  >
                    {WEEKDAYS.map((d) => (
                      <div
                        key={d}
                        className="py-2 text-center text-xs font-medium text-slate-500"
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="divide-y divide-slate-200">
                    {weeks.map((week, i) => (
                      <div key={i} style={{ ...GRID_7, minHeight: 128 }}>
                        {week.map((day) => {
                          const inMonth = isSameMonth(day, month);
                          const isToday = isSameDay(day, today);
                          const isSel = isSameDay(day, selectedDate);
                          const entries = byDate.get(dateValue(day)) ?? [];
                          return (
                            <div
                              key={dateValue(day)}
                              style={{ minWidth: 0 }}
                              className={`space-y-1 border-r border-slate-100 p-1.5 last:border-r-0 sm:p-2 ${!inMonth ? "bg-slate-50/70" : ""} ${isSel ? "bg-cyan-50/60" : ""}`}
                            >
                              <button
                                onClick={() => setSelectedDate(day)}
                                aria-label={`View time-ins for ${format(day, "MMMM d, yyyy")}`}
                                aria-pressed={isSel}
                                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${isToday ? "bg-cyan-700 font-semibold text-white" : inMonth ? "text-slate-800 hover:bg-slate-50" : "text-slate-400"} ${isSel && !isToday ? "ring-2 ring-cyan-600" : ""}`}
                              >
                                {format(day, "d")}
                              </button>
                              {entries.slice(0, MAX_CHIPS).map((r) => (
                                <button
                                  key={r.id}
                                  onClick={() => setSelected(r)}
                                  title={`${r.employee_number}, ${r.employee_name}, in at ${format12(r.time_in)} (${chipNote(r)})`}
                                  className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${chipClass(r)}`}
                                >
                                  <span className="font-medium">{r.label}</span>{" "}
                                  – {format12(r.time_in)}
                                </button>
                              ))}
                              {entries.length > MAX_CHIPS && (
                                <button
                                  onClick={() => setSelectedDate(day)}
                                  className="px-1 text-xs font-medium text-cyan-700 hover:underline"
                                >
                                  +{entries.length - MAX_CHIPS} more
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 border-t border-slate-100 p-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading time-ins
                </div>
              )}
            </div>
          )}

          {/* ───────── LIST ───────── */}
          {view === "list" && (
            <div className="min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <h2 className="font-semibold text-slate-900">
                  {format(month, "MMMM yyyy")}{" "}
                  <span className="font-normal text-slate-500">
                    ({filtered.length})
                  </span>
                </h2>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={goToday}>
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() => setMonth((v) => subMonths(v, 1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next month"
                    onClick={() => setMonth((v) => addMonths(v, 1))}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading time-ins
                </div>
              ) : visible.length === 0 ? (
                <p className="px-4 py-14 text-center text-sm text-slate-500">
                  No time-ins match. Try a different month or clear your search.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Employee</th>
                          <th className="px-3 py-2.5 font-medium">Date</th>
                          <th className="px-3 py-2.5 font-medium">Actual in</th>
                          <th className="px-3 py-2.5 font-medium">
                            Minutes late
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visible.map((r) => (
                          <tr
                            key={r.id}
                            className="text-slate-700 hover:bg-slate-50/60"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar name={r.employee_name} />
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-slate-900">
                                    {r.label}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    {r.employee_number}, {r.department}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              {format(parseDay(r.date), "MMM d, yyyy")}
                            </td>
                            <td className="px-3 py-3 tabular-nums">
                              {format12(r.time_in)}
                            </td>
                            <td className="px-3 py-3">
                              <LateBadge row={r} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelected(r)}
                              >
                                Details
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
                    <span className="text-slate-500">
                      Page {page} of {pages}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((c) => c - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= pages}
                        onClick={() => setPage((c) => c + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ───────── SUMMARY ───────── */}
          {view === "summary" && (
            <div className="min-w-0 space-y-4 p-4 sm:p-5">
              {/* Reminder */}
              <div className="overflow-hidden rounded-lg border border-emerald-200 text-sm">
                <div className="bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900">
                  Reminders
                </div>
                <p className="bg-white px-3 py-2 text-slate-700">
                  A 5-minute grace period is applied. Only time-ins 6 minutes or
                  more after 8:00 AM are counted as late. Total minutes include
                  the full minutes late.
                </p>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-amber-200 px-3 py-1.5 text-base font-bold text-amber-950">
                    {format(month, "MMMM yyyy")}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() => setMonth((v) => subMonths(v, 1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next month"
                    onClick={() => setMonth((v) => addMonths(v, 1))}
                  >
                    <ChevronRight />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div
                    role="tablist"
                    aria-label="Cut-off period"
                    className="inline-flex rounded-lg bg-slate-100 p-1"
                    style={{ display: "inline-flex", gap: 4 }}
                  >
                    {(["first", "second", "all"] as const).map((key) => (
                      <button
                        key={key}
                        role="tab"
                        aria-selected={cutoff === key}
                        onClick={() => setCutoff(key)}
                        className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${cutoff === key ? "bg-white text-cyan-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                      >
                        {key === "all"
                          ? "Whole month"
                          : `Cut-off ${CUTOFF_LABEL[key]}`}
                      </button>
                    ))}
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={hideZero || lateOnly}
                      disabled={lateOnly}
                      onChange={(e) => setHideZero(e.target.checked)}
                    />
                    Hide employees with no lates
                  </label>
                </div>
              </div>

              <div className="grid items-start gap-5 xl:grid-cols-2">
                {/* Left: time-in log for the cut-off */}
                <div className="min-w-0 overflow-hidden rounded-lg border border-emerald-200">
                  <div className="bg-emerald-100 px-3 py-2 text-center text-sm font-semibold text-emerald-900">
                    Cut-off period: {CUTOFF_LABEL[cutoff]}
                  </div>
                  <div className="max-h-[560px] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-emerald-50 text-xs text-emerald-900">
                        <tr>
                          <th className="px-3 py-2 font-semibold">
                            Employee name
                          </th>
                          <th className="px-3 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Actual in</th>
                          <th className="px-3 py-2 text-right font-semibold">
                            Minutes late
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loading ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-3 py-10 text-center text-slate-500"
                            >
                              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                              Loading time-ins
                            </td>
                          </tr>
                        ) : cutoffRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-3 py-10 text-center text-slate-500"
                            >
                              No time-ins in this cut-off.
                            </td>
                          </tr>
                        ) : (
                          cutoffRows.map((r) => (
                            <tr
                              key={r.id}
                              onClick={() => setSelected(r)}
                              className="cursor-pointer text-slate-700 hover:bg-slate-50"
                            >
                              <td className="px-3 py-2 font-medium text-slate-900">
                                {r.label}
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                {format(parseDay(r.date), "M/d/yyyy")}
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                {format12(r.time_in)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right tabular-nums ${r.late ? "bg-rose-200 font-semibold text-rose-900" : "text-slate-600"}`}
                              >
                                {r.minutes}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right: summary per employee */}
                <div className="min-w-0 overflow-hidden rounded-lg border border-emerald-200">
                  <div className="bg-emerald-100 px-3 py-2 text-center text-sm font-semibold text-emerald-900">
                    Summary
                  </div>
                  <div className="max-h-[560px] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-emerald-50 text-xs text-emerald-900">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Name</th>
                          <th className="px-3 py-2 text-right font-semibold">
                            Total lates (minutes)
                          </th>
                          <th className="px-3 py-2 text-right font-semibold">
                            No. of lates
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summaryRows.map((s) => (
                          <tr key={s.id} className="text-slate-700">
                            <td className="px-3 py-2">
                              <span className="font-medium text-slate-900">
                                {s.name}
                              </span>
                              {s.label !== s.name && (
                                <span className="ml-2 text-xs text-slate-500">
                                  “{s.label}”
                                </span>
                              )}
                            </td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums ${s.minutes > 0 ? "bg-rose-100 font-semibold text-rose-800" : "text-slate-500"}`}
                            >
                              {s.minutes}
                            </td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums ${s.lates > 0 ? "bg-rose-100 font-semibold text-rose-800" : "text-slate-500"}`}
                            >
                              {s.lates}
                            </td>
                          </tr>
                        ))}
                        {summaryRows.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-3 py-10 text-center text-slate-500"
                            >
                              No employees to summarize.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ───────── SIDEBAR (calendar only) ───────── */}
          {view === "calendar" && (
            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="font-semibold text-slate-900">
                  {isSameDay(selectedDate, today)
                    ? "Today"
                    : format(selectedDate, "EEEE, MMM d")}
                </h2>
                <p className="text-xs text-slate-500">
                  {dayRows.length === 0
                    ? "No time-ins logged."
                    : `${lates(dayRows.filter((r) => r.late).length)} of ${dayRows.length} logged`}
                </p>
                {dayRows.length > 0 && (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {dayRows.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => setSelected(r)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
                        >
                          <Avatar name={r.employee_name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {r.label}
                            </span>
                            <span className="block text-xs tabular-nums text-slate-500">
                              {format12(r.time_in)}
                            </span>
                          </span>
                          <LateBadge row={r} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          )}
        </div>
      </Card>

      {/* Log / edit time-in */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit time-in" : "Log time-in"}
            </DialogTitle>
            <DialogDescription>
              Minutes late are computed from the 8:00 AM shift start.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Employee">
              <div className="relative">
                <Input
                  value={employeeQuery}
                  onChange={(e) => {
                    setEmployeeQuery(e.target.value);
                    setSelectedEmployee(null);
                    setPickerOpen(true);
                  }}
                  onFocus={() => setPickerOpen(true)}
                  onBlur={() =>
                    window.setTimeout(() => setPickerOpen(false), 150)
                  }
                  placeholder="Search by name or Employee ID"
                  disabled={!!editing}
                  autoComplete="off"
                  required
                />
                {pickerOpen && !editing && !selectedEmployee && (
                  <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                    {employeeMatches.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-slate-500">
                        No employees found.
                      </li>
                    ) : (
                      employeeMatches.map((emp) => (
                        <li key={emp.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedEmployee(emp);
                              setEmployeeQuery(emp.employee_id);
                              setPickerOpen(false);
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                          >
                            <Avatar name={emp.name} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-900">
                                {emp.name}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {emp.employee_id}, {emp.department}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </Field>
            {selectedEmployee && (
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <Avatar name={selectedEmployee.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {selectedEmployee.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {selectedEmployee.nickname
                      ? `“${selectedEmployee.nickname}”, `
                      : ""}
                    {selectedEmployee.position}, {selectedEmployee.department}
                  </p>
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date">
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </Field>
              <Field label="Actual in">
                <Input
                  type="time"
                  value={form.time_in}
                  onChange={(e) =>
                    setForm({ ...form, time_in: e.target.value })
                  }
                  required
                />
              </Field>
            </div>
            {form.time_in && (
              <p className="text-xs text-slate-500">
                {(() => {
                  const m = minutesLate(form.time_in);
                  if (m === 0) return "On time.";
                  if (m <= GRACE_MINUTES)
                    return `${mins(m)} after 8:00 AM, within the grace period (not counted).`;
                  return `${mins(m)} late, counted as a late.`;
                })()}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !selectedEmployee}
                className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Log time-in"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Details */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-md grid-cols-1 overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 pr-6">
                  <Avatar name={selected.employee_name} />
                  <div className="min-w-0 flex-1 space-y-1 text-left">
                    <DialogTitle className="break-words leading-snug">
                      {selected.employee_name}
                    </DialogTitle>
                    <DialogDescription className="break-words">
                      {selected.employee_number}, {selected.position},{" "}
                      {selected.department}
                    </DialogDescription>
                    <div className="pt-1">
                      <LateBadge row={selected} />
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <dl className="grid gap-x-6 gap-y-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                {[
                  ["Nickname", selected.nickname || "—"],
                  ["Date", format(parseDay(selected.date), "EEE, MMM d, yyyy")],
                  ["Actual in", format12(selected.time_in)],
                  ["Shift start", format12("08:00")],
                  [
                    "Counted as late",
                    selected.late ? `Yes, ${mins(selected.minutes)}` : "No",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <DialogFooter className="flex-row justify-between gap-2 border-t border-slate-200 pt-4 sm:justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                  onClick={() => void remove(selected)}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(selected)}
                >
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation (replaces window.confirm) */}
      <Dialog
        open={!!confirmRequest}
        onOpenChange={(open) => !open && settleConfirm(false)}
      >
        <DialogContent className="max-w-md grid-cols-1 [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{confirmRequest?.title}</DialogTitle>
            <DialogDescription className="break-words">
              {confirmRequest?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => settleConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={
                confirmRequest?.destructive
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
              }
              onClick={() => settleConfirm(true)}
            >
              {confirmRequest?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
