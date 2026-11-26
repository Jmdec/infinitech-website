"use client";

// Evaluation Monitoring page (converted from Leave Monitoring).
// Tracks probationary employees: 1st evaluation -> 2nd evaluation -> regularization.
// Records are sourced from the Employee Masterfile.
// The "Requests" tab lists evaluation requests filed by employees.
// The "Online evaluation" tab is the online Performance Appraisal form.
//
// Expected API (adjust the URLs/shape to your backend):
//   GET   /api/admin/evaluation-monitoring            -> { data: EvalRecord[] }
//   PATCH /api/admin/evaluation-monitoring/:id        -> body: EvalPatch
//   GET   /api/admin/evaluation-requests?status=...   -> { data: EvalRequest[] }  (pending count)
//
// Place at app/admin/evaluation-monitoring/page.tsx, with
// evaluation-requests-panel.tsx and online-evaluations-panel.tsx in the same folder.

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
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  Trash2,
  Inbox,
  List,
  Loader2,
  Pencil,
  Plus,
  Upload,
  Search,
  SlidersHorizontal,
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
import EvaluationRequestsPanel from "./evaluation-requests-panel";
import OnlineEvaluationsPanel, {
  type EvaluationSeed,
} from "./online-evaluations-panel";

/* ============================================================================
 * SCHEDULE RULES
 * When the evaluation dates are not yet filled in, they are suggested from the
 * Date Hired. Change these to match your company policy.
 * ========================================================================== */

const FIRST_EVAL_MONTHS = 3;
const SECOND_EVAL_MONTHS = 5;
const REGULARIZATION_MONTHS = 6;
const DUE_SOON_DAYS = 30;

/* ============================================================================
 * TYPES & CONSTANTS
 * ========================================================================== */

type FirstRemarks = "For further evaluation" | "For regularization";
type SecondRemarks = "Regularized" | "Not regularized";
type Stage =
  | "Awaiting 1st evaluation"
  | "For further evaluation"
  | "For regularization"
  | "Regularized"
  | "Not regularized";

type EvalRecord = {
  id: number;
  employee_id: number;
  employee_number: string;
  employee_name: string;
  position: string;
  department: string;
  /** Employee's masterfile status, e.g. "Probationary", "Regular". */
  employee_status: string | null;
  date_hired: string; // yyyy-MM-dd
  first_evaluation_date: string | null;
  first_remarks: FirstRemarks | null;
  second_evaluation_date: string | null;
  second_remarks: SecondRemarks | null;
  regularization_date: string | null;
  updated_at: string;
};

type EvalForm = {
  first_evaluation_date: string;
  first_remarks: FirstRemarks | "";
  second_evaluation_date: string;
  second_remarks: SecondRemarks | "";
  regularization_date: string;
};
type EvalAttachment = {
  id: number;
  step: "first" | "second" | "regularization";
  original_name: string;
  size: number;
  created_at: string;
};

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
type EmployeeOption = {
  id: number;
  employee_id: string;
  name: string;
  position: string;
  department: string;
  date_hired: string;
};

type ViewMode = "list" | "calendar" | "requests" | "evaluations";
type StatusTab = "Probationary" | "Regular";
const FIRST_REMARKS: FirstRemarks[] = [
  "For further evaluation",
  "For regularization",
];
const SECOND_REMARKS: SecondRemarks[] = ["Regularized", "Not regularized"];
const STAGES: Stage[] = [
  "Awaiting 1st evaluation",
  "For further evaluation",
  "For regularization",
  "Regularized",
  "Not regularized",
];

const STAGE_STYLES: Record<Stage, string> = {
  "Awaiting 1st evaluation": "bg-slate-50 text-slate-700 ring-slate-500/20",
  "For further evaluation": "bg-amber-50 text-amber-800 ring-amber-600/20",
  "For regularization": "bg-sky-50 text-sky-800 ring-sky-600/20",
  Regularized: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  "Not regularized": "bg-rose-50 text-rose-800 ring-rose-600/20",
};
const STAGE_DOT: Record<Stage, string> = {
  "Awaiting 1st evaluation": "bg-slate-400",
  "For further evaluation": "bg-amber-500",
  "For regularization": "bg-sky-500",
  Regularized: "bg-emerald-500",
  "Not regularized": "bg-rose-500",
};

type EventKind = "first" | "second" | "regularization";
const KIND_LABEL: Record<EventKind, string> = {
  first: "1st evaluation",
  second: "2nd evaluation",
  regularization: "Regularization",
};
const KIND_STYLE: Record<EventKind, string> = {
  first: "bg-sky-100 text-sky-950",
  second: "bg-violet-100 text-violet-950",
  regularization: "bg-emerald-100 text-emerald-950",
};

const PAGE_SIZE = 10;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-60";

const GRID_7: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
};
const TAB_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  whiteSpace: "nowrap",
};

/* ============================================================================
 * HELPERS
 * ========================================================================== */

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

const dateValue = (date: Date) => format(date, "yyyy-MM-dd");
const parseDay = (value: string) => new Date(`${value}T00:00:00`);
// Empty values show a dash instead of a spreadsheet-style "June 28, 1900".
const prettyDate = (value: string | null | undefined) =>
  value ? format(parseDay(value), "MMMM d, yyyy") : "—";
const shortDate = (value: string | null | undefined) =>
  value ? format(parseDay(value), "MMM d, yyyy") : "—";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const scheduled = (hired: string, months: number) =>
  dateValue(addMonths(parseDay(hired), months));

/**
 * True once the saved regularization date has arrived (today or earlier).
 * Only a saved date counts, not the suggested one. An employee marked
 * "Not regularized" is never auto-regularized.
 */
const regularizationReached = (r: EvalRecord) =>
  !!r.regularization_date &&
  r.second_remarks !== "Not regularized" &&
  r.regularization_date.slice(0, 10) <= dateValue(new Date());

function stageOf(r: EvalRecord): Stage {
  const status = (r.employee_status || "").toLowerCase();
  if (r.second_remarks === "Regularized") return "Regularized";
  if (status === "regular" || status === "regularized") return "Regularized";
  if (regularizationReached(r)) return "Regularized";
  if (r.second_remarks === "Not regularized") return "Not regularized";
  if (r.first_remarks === "For regularization") return "For regularization";
  if (r.first_remarks === "For further evaluation")
    return "For further evaluation";
  return "Awaiting 1st evaluation";
}

const isFinished = (stage: Stage) =>
  stage === "Regularized" || stage === "Not regularized";
const isRegularEmployee = (r: EvalRecord) => {
  const status = (r.employee_status || "").toLowerCase();
  return (
    status === "regular" ||
    status === "regularized" ||
    r.second_remarks === "Regularized" ||
    regularizationReached(r)
  );
};
type Step = "first" | "second" | "regularization";
function currentStep(r: EvalRecord): Step {
  const stage = stageOf(r);
  if (stage === "Awaiting 1st evaluation") return "first";
  if (stage === "For further evaluation" || stage === "Not regularized")
    return "second";
  return "regularization"; // For regularization, Regularized
}
/** The three milestone dates: the saved one, or the suggested one from Date Hired. */
function plan(r: EvalRecord) {
  return {
    first:
      r.first_evaluation_date || scheduled(r.date_hired, FIRST_EVAL_MONTHS),
    second:
      r.second_evaluation_date || scheduled(r.date_hired, SECOND_EVAL_MONTHS),
    regularization:
      r.regularization_date || scheduled(r.date_hired, REGULARIZATION_MONTHS),
  };
}

/** The next thing HR needs to do for this employee. */
function nextAction(r: EvalRecord): { label: string; date: string } | null {
  const stage = stageOf(r);
  const p = plan(r);
  if (isFinished(stage)) return null;
  if (stage === "Awaiting 1st evaluation")
    return { label: "1st evaluation", date: p.first };
  if (stage === "For further evaluation")
    return { label: "2nd evaluation", date: p.second };
  return { label: "Regularization", date: p.regularization };
}

type CalEvent = {
  key: string;
  date: string;
  kind: EventKind;
  record: EvalRecord;
  done: boolean; // false = still scheduled / suggested
};

function eventsOf(r: EvalRecord): CalEvent[] {
  const p = plan(r);
  const stage = stageOf(r);
  const list: CalEvent[] = [
    {
      key: `${r.id}-first`,
      date: p.first,
      kind: "first",
      record: r,
      done: !!r.first_remarks,
    },
  ];
  // Employees marked "For regularization" after the 1st evaluation skip the 2nd.
  if (r.first_remarks !== "For regularization" || r.second_evaluation_date) {
    list.push({
      key: `${r.id}-second`,
      date: p.second,
      kind: "second",
      record: r,
      done: !!r.second_remarks,
    });
  }
  list.push({
    key: `${r.id}-reg`,
    date: p.regularization,
    kind: "regularization",
    record: r,
    done: stage === "Regularized",
  });
  return list;
}

function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STAGE_STYLES[stage]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[stage]}`} />
      {stage}
    </span>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-cyan-100 font-semibold text-cyan-900 ${size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"}`}
    >
      {initials(name)}
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

function DateCell({
  date,
  remarks,
}: {
  date: string | null;
  remarks?: string | null;
}) {
  return (
    <>
      <p className="truncate">{prettyDate(date)}</p>
      {remarks && <p className="truncate text-xs text-slate-500">{remarks}</p>}
    </>
  );
}

/* ============================================================================
 * PAGE
 * ========================================================================== */

export default function EvaluationMonitoringPage() {
  const [records, setRecords] = useState<EvalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>("list");
  const [pendingRequests, setPendingRequests] = useState(0);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [stageFilter, setStageFilter] = useState("All");
  const [hiredFrom, setHiredFrom] = useState("");
  const [hiredTo, setHiredTo] = useState("");
  const [page, setPage] = useState(1);
  const [statusTab, setStatusTab] = useState<StatusTab>("Probationary");
  const [selected, setSelected] = useState<EvalRecord | null>(null);
  const [form, setForm] = useState<EvalForm | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [picked, setPicked] = useState<EmployeeOption | null>(null);
  // Employee to evaluate when jumping to the "Online evaluation" tab.
  const [evalSeed, setEvalSeed] = useState<EvaluationSeed | null>(null);

  const today = new Date();
  const todayValue = dateValue(today);

  // Search / filters / Add employee only apply to List and Calendar.
  const showToolbar = view === "list" || view === "calendar";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readJson<{ data: EvalRecord[] }>(
        await adminFetch("/api/admin/evaluation-monitoring", {
          cache: "no-store",
        }),
      );
      setRecords(data.data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load evaluation monitoring.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Number of employee requests still waiting for review (tab badge).
  const loadPending = useCallback(async () => {
    try {
      const data = await readJson<{ data: unknown[] }>(
        await adminFetch(
          "/api/admin/evaluation-requests?status=Pending%20review",
          { cache: "no-store" },
        ),
      );
      setPendingRequests(data.data.length);
    } catch {
      /* the badge is optional */
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    setPage(1);
  }, [search, departmentFilter, stageFilter, hiredFrom, hiredTo, statusTab]);
  /* ── filtering ── */

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records
      .filter((r) => {
        const matchesSearch =
          !query ||
          [
            r.employee_number,
            r.employee_name,
            r.position,
            r.department,
            r.employee_status || "",
          ].some((v) => (v || "").toLowerCase().includes(query));
        return (
          matchesSearch &&
          (departmentFilter === "All" || r.department === departmentFilter) &&
          (stageFilter === "All" || stageOf(r) === stageFilter) &&
          (!hiredFrom || r.date_hired >= hiredFrom) &&
          (!hiredTo || r.date_hired <= hiredTo)
        );
      })
      .sort(
        (a, b) =>
          // Unfinished first, then by the date the next action is due.
          Number(isFinished(stageOf(a))) - Number(isFinished(stageOf(b))) ||
          (nextAction(a)?.date || plan(a).regularization).localeCompare(
            nextAction(b)?.date || plan(b).regularization,
          ) ||
          a.employee_name.localeCompare(b.employee_name),
      );
  }, [records, search, departmentFilter, stageFilter, hiredFrom, hiredTo]);

  const departments = useMemo(
    () =>
      Array.from(
        new Set(records.map((r) => r.department).filter(Boolean)),
      ).sort(),
    [records],
  );

  const activeFilterCount = [
    departmentFilter !== "All",
    stageFilter !== "All",
    hiredFrom,
    hiredTo,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch("");
    setDepartmentFilter("All");
    setStageFilter("All");
    setHiredFrom("");
    setHiredTo("");
  };
  const tabCounts = useMemo(() => {
    const regular = filtered.filter(isRegularEmployee).length;
    return { Regular: regular, Probationary: filtered.length - regular };
  }, [filtered]);

  const tabbed = useMemo(
    () =>
      filtered.filter(
        (r) => isRegularEmployee(r) === (statusTab === "Regular"),
      ),
    [filtered, statusTab],
  );
  const pages = Math.max(1, Math.ceil(tabbed.length / PAGE_SIZE));
  const visible = tabbed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── stats ── */

  const soonValue = dateValue(addDays(today, DUE_SOON_DAYS));
  const stats = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let forRegularization = 0;
    let awaiting = 0;
    for (const r of records) {
      const stage = stageOf(r);
      const next = nextAction(r);
      if (next && next.date < todayValue) overdue++;
      else if (next && next.date <= soonValue) dueSoon++;
      if (stage === "For regularization") forRegularization++;
      if (stage === "Awaiting 1st evaluation") awaiting++;
    }
    return { overdue, dueSoon, forRegularization, awaiting };
  }, [records, todayValue, soonValue]);

  const dueSoonList = useMemo(
    () =>
      filtered
        .map((r) => ({ record: r, next: nextAction(r) }))
        .filter(
          (
            x,
          ): x is {
            record: EvalRecord;
            next: { label: string; date: string };
          } => !!x.next && x.next.date <= soonValue,
        )
        .sort((a, b) => a.next.date.localeCompare(b.next.date)),
    [filtered, soonValue],
  );

  /* ── calendar ── */

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const r of filtered) {
      for (const ev of eventsOf(r)) {
        const list = map.get(ev.date) || [];
        list.push(ev);
        map.set(ev.date, list);
      }
    }
    return map;
  }, [filtered]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = addDays(startOfWeek(endOfMonth(month), { weekStartsOn: 0 }), 6);
    const days: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  }, [month]);

  const selectedDayEvents = eventsByDay.get(dateValue(selectedDate)) || [];

  /* ── edit ── */

  const openDetails = (r: EvalRecord) => {
    setSelected(r);
    setAttachments([]);
    void loadAttachments(r.id);
    setForm({
      first_evaluation_date: r.first_evaluation_date || "",
      first_remarks: r.first_remarks || "",
      second_evaluation_date: r.second_evaluation_date || "",
      second_remarks: r.second_remarks || "",
      regularization_date: r.regularization_date || "",
    });
  };

  const closeDetails = () => {
    setSelected(null);
    setForm(null);
    setAttachments([]);
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<EvalAttachment[]>([]);
  const [toDelete, setToDelete] = useState<EvalAttachment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAttachments = async (employeeId: number) => {
    try {
      const data = await readJson<{ data: EvalAttachment[] }>(
        await adminFetch(
          `/api/admin/evaluation-monitoring/${employeeId}/attachments`,
          { cache: "no-store" },
        ),
      );
      setAttachments(data.data);
    } catch {
      setAttachments([]);
    }
  };

  const downloadAttachment = async (a: EvalAttachment) => {
    if (!selected) return;
    try {
      const res = await adminFetch(
        `/api/admin/evaluation-monitoring/${selected.id}/attachments/${a.id}`,
      );
      if (!res.ok) throw new Error("Unable to download file.");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = a.original_name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to download file.",
      );
    }
  };

  const deleteAttachment = async () => {
    if (!selected || !toDelete) return;
    setDeleting(true);
    try {
      await readJson(
        await adminFetch(
          `/api/admin/evaluation-monitoring/${selected.id}/attachments/${toDelete.id}`,
          { method: "DELETE" },
        ),
      );
      toast.success("File deleted.");
      setToDelete(null);
      await loadAttachments(selected.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete file.",
      );
    } finally {
      setDeleting(false);
    }
  };
  const uploadEvaluation = async (file: File) => {
    if (!selected) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("step", currentStep(selected)); // first | second | regularization
      await readJson(
        await adminFetch(
          `/api/admin/evaluation-monitoring/${selected.id}/attachments`,
          { method: "POST", body },
        ),
      );
      toast.success("Evaluation uploaded.");
      await loadAttachments(selected.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to upload evaluation.",
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  // Jump to the Online evaluation tab with this employee already chosen.
  const startOnlineEvaluation = () => {
    if (!selected) return;
    setEvalSeed({
      employee_id: selected.employee_id,
      employee_name: selected.employee_name,
      department: selected.department,
      job_title: selected.position,
    });
    closeDetails();
    setView("evaluations");
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !form) return;

    if (form.first_remarks && !form.first_evaluation_date) {
      toast.error("Enter the date of the 1st evaluation.");
      return;
    }
    if (form.second_remarks && !form.second_evaluation_date) {
      toast.error("Enter the date of the 2nd evaluation.");
      return;
    }
    if (
      form.first_evaluation_date &&
      form.second_evaluation_date &&
      form.second_evaluation_date < form.first_evaluation_date
    ) {
      toast.error("The 2nd evaluation cannot be before the 1st evaluation.");
      return;
    }
    if (form.second_remarks === "Regularized" && !form.regularization_date) {
      toast.error("Enter the date of regularization.");
      return;
    }

    const nullable = (v: string) => (v ? v : null);
    setSaving(true);
    try {
      await readJson(
        await adminFetch(`/api/admin/evaluation-monitoring/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_evaluation_date: nullable(form.first_evaluation_date),
            first_remarks: nullable(form.first_remarks),
            second_evaluation_date: nullable(form.second_evaluation_date),
            second_remarks: nullable(form.second_remarks),
            regularization_date: nullable(form.regularization_date),
          }),
        }),
      );
      toast.success("Evaluation updated.");
      closeDetails();
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save evaluation.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openAdd = async () => {
    setAddOpen(true);
    setEmployeeQuery("");
    setPicked(null);
    try {
      const data = await readJson<{ data: EmployeeOption[] }>(
        await adminFetch(
          "/api/admin/evaluation-monitoring?resource=employees",
          { cache: "no-store" },
        ),
      );
      setEmployeeOptions(data.data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load employees.",
      );
    }
  };

  const pickEmployee = (value: string) => {
    setEmployeeQuery(value);
    setPicked(employeeOptions.find((o) => o.employee_id === value) || null);
  };

  const addEmployee = async () => {
    if (!picked) return;
    setAdding(true);
    try {
      // An empty save creates the evaluation row, so the employee is listed.
      await readJson(
        await adminFetch(`/api/admin/evaluation-monitoring/${picked.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_evaluation_date: null,
            first_remarks: null,
            second_evaluation_date: null,
            second_remarks: null,
            regularization_date: null,
          }),
        }),
      );
      toast.success(`${picked.name} added to evaluation monitoring.`);
      setAddOpen(false);
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to add employee.",
      );
    } finally {
      setAdding(false);
    }
  };

  const addableEmployees = employeeOptions.filter(
    (o) => !records.some((r) => r.id === o.id),
  );

  const selectedPlan = selected ? plan(selected) : null;

  /* ============================== RENDER ============================== */

  return (
    <section className="mx-auto max-w-[1600px] space-y-5 p-1 sm:p-2">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
              <CalendarCheck className="h-6 w-6 text-white sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Evaluation monitoring
              </h1>
              {/* <p className="mt-1 text-sm text-blue-100">
                Track probationary employees from 1st evaluation to
                regularization. Records come from the Employee Masterfile.
              </p> */}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-blue-100">
              Showing{" "}
              <span className="font-semibold text-white">
                {filtered.length}
              </span>{" "}
              {filtered.length === 1 ? "employee" : "employees"}
            </span>
            <span className="hidden h-4 w-px bg-white/30 sm:block" />
            <span className="inline-flex items-center gap-2 text-blue-100">
              <span className="h-2 w-2 rounded-full bg-rose-300" />
              <span>
                <span className="font-semibold text-white">
                  {stats.overdue}
                </span>{" "}
                overdue
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-blue-100">
              <span className="h-2 w-2 rounded-full bg-amber-300" />
              <span>
                <span className="font-semibold text-white">
                  {stats.dueSoon}
                </span>{" "}
                due in {DUE_SOON_DAYS} days
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-blue-100">
              <span className="h-2 w-2 rounded-full bg-cyan-200" />
              <span>
                <span className="font-semibold text-white">
                  {stats.forRegularization}
                </span>{" "}
                for regularization
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-blue-100">
              <span className="h-2 w-2 rounded-full bg-slate-200" />
              <span>
                <span className="font-semibold text-white">
                  {stats.awaiting}
                </span>{" "}
                awaiting 1st evaluation
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-blue-100">
              <span className="h-2 w-2 rounded-full bg-fuchsia-300" />
              <span>
                <span className="font-semibold text-white">
                  {pendingRequests}
                </span>{" "}
                {pendingRequests === 1 ? "request" : "requests"} to review
              </span>
            </span>
          </div>
        </div>
      </header>

      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div
              role="tablist"
              aria-label="Evaluation view"
              className="inline-flex shrink-0 self-start rounded-lg bg-slate-50 p-1"
              style={{ display: "inline-flex", gap: 4 }}
            >
              {(
                [
                  ["list", "List", List],
                  ["calendar", "Calendar", CalendarDays],
                  ["requests", "Requests", Inbox],
                  ["evaluations", "Online evaluation", ClipboardCheck],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => setView(key)}
                  style={TAB_STYLE}
                  className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${view === key ? "bg-white text-cyan-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  <Icon className="h-4 w-4" /> {label}
                  {key === "requests" && pendingRequests > 0 && (
                    <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
                      {pendingRequests}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {showToolbar && (
              <>
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name, ID, position or department"
                    aria-label="Search evaluations"
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => void openAdd()}
                    className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                  >
                    <Plus className="h-4 w-4" /> Add employee
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setFiltersOpen((open) => !open)}
                    aria-expanded={filtersOpen}
                    aria-controls="evaluation-filters"
                  >
                    <SlidersHorizontal className="h-4 w-4" /> Filters
                    {activeFilterCount > 0 && (
                      <span className="ml-1 rounded-full bg-cyan-700 px-1.5 text-xs font-semibold text-white">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                  {(activeFilterCount > 0 || search) && (
                    <Button variant="ghost" onClick={clearFilters}>
                      Clear
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>

          {showToolbar && filtersOpen && (
            <div
              id="evaluation-filters"
              className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Field label="Department">
                <select
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="All">All departments</option>
                  {departments.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </Field>
              <Field label="Progress">
                <select
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="All">All stages</option>
                  {STAGES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Hired from">
                <Input
                  type="date"
                  value={hiredFrom}
                  onChange={(event) => setHiredFrom(event.target.value)}
                />
              </Field>
              <Field label="Hired to">
                <Input
                  type="date"
                  value={hiredTo}
                  min={hiredFrom || undefined}
                  onChange={(event) => setHiredTo(event.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        <div
          className={`grid items-start gap-6 ${view === "calendar" ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}
        >
          {view === "evaluations" ? (
            /* ───────── ONLINE EVALUATION ───────── */
            <OnlineEvaluationsPanel
              startSeed={evalSeed}
              onStartHandled={() => setEvalSeed(null)}
            />
          ) : view === "requests" ? (
            /* ───────── REQUESTS ───────── */
            <EvaluationRequestsPanel onChanged={() => void loadPending()} />
          ) : view === "list" ? (
            /* ───────── LIST ───────── */

            <div className="min-w-0 overflow-hidden">
              <div className="flex gap-2 border-b border-slate-200 px-4 pt-3">
                {(["Probationary", "Regular"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStatusTab(tab)}
                    aria-pressed={statusTab === tab}
                    className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 pb-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${
                      statusTab === tab
                        ? "border-cyan-700 text-cyan-800"
                        : "border-transparent text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {tab}
                    <span className="rounded-full bg-slate-100 px-1.5 text-xs">
                      {tabCounts[tab]}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <h2 className="font-semibold text-slate-900">
                  Employee evaluations{" "}
                  <span className="font-normal text-slate-500">
                    ({tabbed.length})
                  </span>
                </h2>
                <p className="hidden text-xs text-slate-500 sm:block">
                  Sorted by the next due date. Dates in grey are suggested from
                  Date Hired.
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading
                  evaluations
                </div>
              ) : visible.length === 0 ? (
                <div className="px-4 py-14 text-center">
                  <p className="font-medium text-slate-900">
                    No employees match
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Try a different search or clear your filters.
                  </p>
                  {(activeFilterCount > 0 || search) && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[1040px] table-fixed text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                        <tr>
                          <th className="w-[20%] px-4 py-2.5 font-medium">
                            Employee
                          </th>
                          <th className="w-[13%] px-3 py-2.5 font-medium">
                            Position
                          </th>
                          <th className="w-[10%] px-3 py-2.5 font-medium">
                            Date hired
                          </th>
                          <th className="w-[15%] px-3 py-2.5 font-medium">
                            Progress
                          </th>
                          <th className="w-[13%] px-3 py-2.5 font-medium">
                            1st evaluation
                          </th>
                          <th className="w-[13%] px-3 py-2.5 font-medium">
                            2nd evaluation
                          </th>
                          <th className="w-[10%] px-3 py-2.5 font-medium">
                            Regularization
                          </th>
                          <th className="w-[84px] px-4 py-2.5 text-right font-medium">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visible.map((r) => {
                          const stage = stageOf(r);
                          const next = nextAction(r);
                          const overdue = !!next && next.date < todayValue;
                          return (
                            <tr
                              key={r.id}
                              className="align-middle text-slate-700 hover:bg-slate-50/60"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <Avatar name={r.employee_name} size="sm" />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-900">
                                      {r.employee_name}
                                    </p>
                                    <p className="truncate text-xs text-slate-500">
                                      {r.employee_number}
                                      {r.employee_status
                                        ? `, ${r.employee_status}`
                                        : ""}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <p className="truncate">{r.position}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {r.department}
                                </p>
                              </td>
                              <td className="px-3 py-3">
                                {shortDate(r.date_hired)}
                              </td>
                              <td className="px-3 py-3">
                                <StageBadge stage={stage} />
                                {next && (
                                  <p
                                    className={`mt-1 truncate text-xs ${overdue ? "font-medium text-rose-700" : "text-slate-500"}`}
                                  >
                                    {overdue ? "Overdue: " : "Next: "}
                                    {next.label}, {shortDate(next.date)}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {r.first_evaluation_date ? (
                                  <DateCell
                                    date={r.first_evaluation_date}
                                    remarks={r.first_remarks}
                                  />
                                ) : (
                                  <p className="truncate text-slate-400">
                                    {prettyDate(plan(r).first)}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {r.second_evaluation_date ? (
                                  <DateCell
                                    date={r.second_evaluation_date}
                                    remarks={r.second_remarks}
                                  />
                                ) : r.first_remarks === "For regularization" ? (
                                  <p className="text-slate-400">Not needed</p>
                                ) : (
                                  <p className="truncate text-slate-400">
                                    {prettyDate(plan(r).second)}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {r.regularization_date ? (
                                  <p className="truncate">
                                    {prettyDate(r.regularization_date)}
                                  </p>
                                ) : (
                                  <p className="truncate text-slate-400">
                                    {prettyDate(plan(r).regularization)}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openDetails(r)}
                                >
                                  Details
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <ul className="divide-y divide-slate-100 md:hidden">
                    {visible.map((r) => {
                      const next = nextAction(r);
                      return (
                        <li key={r.id}>
                          <button
                            onClick={() => openDetails(r)}
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
                                <StageBadge stage={stageOf(r)} />
                              </span>
                              {next && (
                                <span
                                  className={`block text-xs ${next.date < todayValue ? "font-medium text-rose-700" : "text-slate-500"}`}
                                >
                                  {next.date < todayValue
                                    ? "Overdue: "
                                    : "Next: "}
                                  {next.label}, {shortDate(next.date)}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
                    <span className="text-slate-500">
                      Showing {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, tabbed.length)} of{" "}
                      {tabbed.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">
                        Page {page} of {pages}
                      </span>
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
          ) : (
            /* ───────── CALENDAR ───────── */
            <div className="min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {format(month, "MMMM yyyy")}
                  </h2>
                  <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-sky-500" />
                      1st evaluation
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-violet-500" />
                      2nd evaluation
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Regularization
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMonth(startOfMonth(today));
                      setSelectedDate(today);
                    }}
                  >
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
                    {WEEKDAYS.map((day) => (
                      <div
                        key={day}
                        className="py-2 text-center text-xs font-medium text-slate-500"
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                  <div style={GRID_7}>
                    {calendarDays.map((day) => {
                      const key = dateValue(day);
                      const events = eventsByDay.get(key) || [];
                      const inMonth = isSameMonth(day, month);
                      const isToday = isSameDay(day, today);
                      const isSelected = isSameDay(day, selectedDate);
                      return (
                        <div
                          key={key}
                          style={{ minHeight: 120, minWidth: 0 }}
                          className={`border-b border-r border-slate-100 p-1.5 ${!inMonth ? "bg-slate-50/70" : ""} ${isSelected ? "bg-cyan-50/60" : ""}`}
                        >
                          <button
                            onClick={() => setSelectedDate(day)}
                            aria-label={`View evaluations for ${format(day, "MMMM d, yyyy")}`}
                            aria-pressed={isSelected}
                            className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${isToday ? "bg-cyan-700 font-semibold text-white" : inMonth ? "text-slate-800 hover:bg-slate-50" : "text-slate-400"} ${isSelected && !isToday ? "ring-2 ring-cyan-600" : ""}`}
                          >
                            {format(day, "d")}
                          </button>
                          <div className="space-y-1">
                            {events.slice(0, MAX_CHIPS).map((ev) => (
                              <button
                                key={ev.key}
                                onClick={() => openDetails(ev.record)}
                                title={`${ev.record.employee_name}: ${KIND_LABEL[ev.kind]}${ev.done ? "" : " (scheduled)"}`}
                                className={`flex w-full items-center rounded px-1.5 py-0.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${KIND_STYLE[ev.kind]} ${ev.done ? "" : "border border-dashed border-slate-400 bg-white"}`}
                              >
                                <span className="truncate">
                                  {ev.record.employee_name}
                                </span>
                              </button>
                            ))}
                            {events.length > MAX_CHIPS && (
                              <button
                                onClick={() => setSelectedDate(day)}
                                className="px-1 text-xs font-medium text-cyan-700 hover:underline"
                              >
                                +{events.length - MAX_CHIPS} more
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 border-t border-slate-100 p-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading
                  evaluations
                </div>
              )}
            </div>
          )}

          {view === "calendar" && (
            <aside className="space-y-4 p-4 xl:pl-0">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="font-semibold text-slate-900">
                  {isSameDay(selectedDate, today)
                    ? "Today"
                    : format(selectedDate, "EEEE, MMM d")}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedDayEvents.length === 0
                    ? "Nothing scheduled."
                    : `${selectedDayEvents.length} scheduled`}
                </p>
                {selectedDayEvents.length > 0 && (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {selectedDayEvents.map((ev) => (
                      <li key={ev.key}>
                        <button
                          onClick={() => openDetails(ev.record)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50"
                        >
                          <Avatar name={ev.record.employee_name} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {ev.record.employee_name}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {KIND_LABEL[ev.kind]}
                              {ev.done ? " (done)" : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900">Needs action</h2>
                  {dueSoonList.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {dueSoonList.length}
                    </span>
                  )}
                </div>
                {dueSoonList.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Nothing is overdue or due in the next {DUE_SOON_DAYS} days.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1">
                    {dueSoonList.slice(0, 6).map(({ record, next }) => (
                      <li key={record.id}>
                        <button
                          onClick={() => openDetails(record)}
                          className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-50"
                        >
                          <Avatar name={record.employee_name} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {record.employee_name}
                            </span>
                            <span
                              className={`block truncate text-xs ${next.date < todayValue ? "font-medium text-rose-700" : "text-slate-500"}`}
                            >
                              {next.label}, {shortDate(next.date)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {dueSoonList.length > 6 && (
                  <button
                    onClick={() => setView("list")}
                    className="mt-3 text-sm font-medium text-cyan-700 hover:underline"
                  >
                    See all {dueSoonList.length} in the list
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
      </Card>

      {/* Add employee */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>
              Pick an employee from the masterfile to start tracking their
              evaluations. Dates are suggested from Date Hired.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Employee ID">
              <Input
                list="evaluation-employees"
                value={employeeQuery}
                onChange={(event) => pickEmployee(event.target.value)}
                placeholder="Search or select an Employee ID"
              />
              <datalist id="evaluation-employees">
                {addableEmployees.map((o) => (
                  <option key={o.id} value={o.employee_id}>
                    {o.name}, {o.department}
                  </option>
                ))}
              </datalist>
            </Field>
            {picked ? (
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <Avatar name={picked.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {picked.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {picked.position}, {picked.department}. Hired{" "}
                    {shortDate(picked.date_hired)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Choose an ID from the suggestions to load employee details.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!picked || adding}
              onClick={() => void addEmployee()}
              className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add to monitoring
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details / edit */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && closeDetails()}
      >
        <DialogContent className="max-w-2xl overflow-y-auto max-sm:max-h-[92vh] sm:overflow-visible">
          {selected && form && selectedPlan && (
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
                  <StageBadge stage={stageOf(selected)} />
                </div>
              </DialogHeader>

              <p className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span>
                  Date hired:{" "}
                  <span className="font-medium text-slate-900">
                    {prettyDate(selected.date_hired)}
                  </span>
                </span>
                {selected.regularization_date && (
                  <span>
                    Regularization date:{" "}
                    <span className="font-medium text-slate-900">
                      {prettyDate(selected.regularization_date)}
                    </span>
                  </span>
                )}
              </p>

              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {currentStep(selected) === "first" && (
                  <div className="grid items-start gap-3 p-3 sm:grid-cols-[120px_1fr_1fr]">
                    <h3 className="text-sm font-semibold text-slate-900 sm:pt-7">
                      1st evaluation
                    </h3>
                    <Field
                      label="Date"
                      hint={`Suggested: ${shortDate(scheduled(selected.date_hired, FIRST_EVAL_MONTHS))}`}
                    >
                      <Input
                        type="date"
                        value={form.first_evaluation_date}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            first_evaluation_date: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Remarks">
                      <select
                        value={form.first_remarks}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            first_remarks: event.target.value as
                              | FirstRemarks
                              | "",
                          })
                        }
                        className={selectClass}
                      >
                        <option value="">No remarks yet</option>
                        {FIRST_REMARKS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}

                {currentStep(selected) === "second" && (
                  <>
                    <div className="grid items-start gap-3 p-3 sm:grid-cols-[120px_1fr_1fr]">
                      <h3 className="text-sm font-semibold text-slate-900 sm:pt-7">
                        2nd evaluation
                      </h3>
                      <Field
                        label="Date"
                        hint={`Suggested: ${shortDate(scheduled(selected.date_hired, SECOND_EVAL_MONTHS))}`}
                      >
                        <Input
                          type="date"
                          min={form.first_evaluation_date || undefined}
                          value={form.second_evaluation_date}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              second_evaluation_date: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Remarks">
                        <select
                          value={form.second_remarks}
                          onChange={(event) => {
                            const value = event.target.value as
                              | SecondRemarks
                              | "";
                            setForm({
                              ...form,
                              second_remarks: value,
                              regularization_date:
                                value === "Regularized" &&
                                !form.regularization_date
                                  ? selectedPlan.regularization
                                  : form.regularization_date,
                            });
                          }}
                          className={selectClass}
                        >
                          <option value="">No remarks yet</option>
                          {SECOND_REMARKS.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    {form.second_remarks === "Regularized" && (
                      <div className="grid items-start gap-3 p-3 sm:grid-cols-[120px_1fr_1fr]">
                        <h3 className="text-sm font-semibold text-slate-900 sm:pt-7">
                          Regularization
                        </h3>
                        <Field label="Date">
                          <Input
                            type="date"
                            value={form.regularization_date}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                regularization_date: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </div>
                    )}
                  </>
                )}

                {currentStep(selected) === "regularization" && (
                  <div className="grid items-start gap-3 p-3 sm:grid-cols-[120px_1fr_1fr]">
                    <h3 className="text-sm font-semibold text-slate-900 sm:pt-7">
                      Regularization
                    </h3>
                    <Field
                      label="Date"
                      hint={`Suggested: ${shortDate(scheduled(selected.date_hired, REGULARIZATION_MONTHS))}`}
                    >
                      <Input
                        type="date"
                        value={form.regularization_date}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            regularization_date: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                )}
              </div>

              {attachments.length > 0 && (
                <div className="rounded-lg border border-slate-200">
                  <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">
                    Uploaded evaluations ({attachments.length})
                  </p>
                  <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
                    {attachments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-3 px-3 py-2 text-sm"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-900">
                            {a.original_name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {KIND_LABEL[a.step]}, {fileSize(a.size)},{" "}
                            {shortDate(a.created_at.slice(0, 10))}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void downloadAttachment(a)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setToDelete(a)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <DialogFooter>
                <div className="flex flex-wrap gap-2 sm:mr-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startOnlineEvaluation}
                  >
                    <ClipboardCheck className="h-4 w-4" /> Online evaluation
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}{" "}
                    Upload evaluation
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadEvaluation(file);
                    }}
                  />
                </div>
                <Button type="button" variant="outline" onClick={closeDetails}>
                  Cancel
                </Button>
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
                  Save changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete uploaded evaluation */}
      <Dialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete file?</DialogTitle>
            <DialogDescription>
              {toDelete?.original_name} will be permanently deleted. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button
              disabled={deleting}
              onClick={() => void deleteAttachment()}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
