"use client";
// components/tasks/TaskManagementBoard.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ClipboardList,
  Loader,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useProductivity } from "@/components/tasks/productivity/useProductivity";
import DayPicker from "@/components/tasks/productivity/DayPicker";
import ProductivityTiles from "@/components/tasks/productivity/ProductivityTiles";
import ProductivityBadge from "@/components/tasks/productivity/ProductivityBadge";
import DayReport from "@/components/tasks/productivity/DayReport";
import AiSummary from "@/components/tasks/AiSummary";
import type { ProductivityRow } from "@/lib/productivity";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminFetch } from "@/lib/admin-fetch";
import TaskPushToggle from "@/components/tasks/TaskPushToggle"; // ← bago
import {
  MANILA_TZ,
  localToday,
  parseServerDate,
  serverMs,
  workMsBetween,
} from "@/lib/time";

type Status =
  | "pending"
  | "in_progress"
  | "paused"
  | "for_review"
  | "revision_needed"
  | "completed"
  | "cancelled";

type ManagedTask = {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_number: string;
  assigned_by_name: string | null;
  project: string | null;
  particulars: string;
  details: string | null;
  priority: "normal" | "urgent";
  status: Status;
  progress: number;
  estimated_minutes: number | null;
  due_date: string | null;
  created_at: string;
  worked_seconds: number;
  running_since: string | null;
  /** First start time. Falls back to running_since if the API omits it. */
  started_at?: string | null;
  /** When the task was completed or cancelled. */
  completed_at?: string | null;
  segments: number;
  last_remark: string | null;
  /** Why the latest time log was closed, e.g. "Interrupted by Task #3". */
  last_pause_reason?: string | null;
  submitted_at?: string | null;
  revision_count?: number;
  updates: {
    progress: number;
    remarks: string | null;
    created_at: string;
    updated_by_name: string | null;
  }[];
};

type EligibleEmployee = {
  id: number;
  id_number: string;
  name: string;
  can_receive: boolean;
  reason: string | null;
};

// One row in the Assign dialog. The employee is picked once for all rows.
type TaskRow = {
  key: number;
  project: string;
  particulars: string;
  details: string;
  priority: "normal" | "urgent";
  due_date: string;
  hours: string;
  minutes: string;
};

const MAX_NEW_TASKS = 20;

let rowKeyCounter = 0;
const newRow = (): TaskRow => ({
  key: ++rowKeyCounter,
  project: "",
  particulars: "",
  details: "",
  priority: "normal",
  due_date: "",
  hours: "",
  minutes: "",
});

// A row nobody typed in. Skipped when saving, so a stray empty row is harmless.
const isBlankRow = (row: TaskRow) =>
  !row.project.trim() &&
  !row.particulars.trim() &&
  !row.details.trim() &&
  !row.due_date &&
  !row.hours &&
  !row.minutes &&
  row.priority === "normal";

const SELECT_CONTENT_CLASS =
  "z-[999] border border-slate-200 bg-white text-slate-900 shadow-xl ";

const STATUS: Record<Status, { label: string; badge: string }> = {
  in_progress: { label: "Ongoing", badge: "bg-yellow-100 text-yellow-800" },
  paused: { label: "Paused", badge: "bg-orange-50 text-orange-800" },
  pending: { label: "Pending", badge: "bg-slate-100 text-slate-700" },
  for_review: { label: "For review", badge: "bg-indigo-50 text-indigo-800" },
  revision_needed: {
    label: "Revision needed",
    badge: "bg-orange-100 text-orange-800",
  },
  completed: { label: "Completed", badge: "bg-emerald-50 text-emerald-800" },
  cancelled: { label: "Cancelled", badge: "bg-rose-50 text-rose-800" },
};

const STAT_TILES = [
  { key: "in_progress", label: "Ongoing", accent: "border-t-yellow-400" },
  { key: "paused", label: "Paused", accent: "border-t-orange-400" },
  { key: "pending", label: "Pending", accent: "border-t-slate-400" },
  { key: "for_review", label: "For review", accent: "border-t-indigo-400" },
  { key: "completed", label: "Completed", accent: "border-t-emerald-500" },
] as const;

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = result?.errors
      ? Object.values(result.errors as Record<string, string[]>)
          .flat()
          .join(" ")
      : "";
    throw new Error(
      details || result.message || "The request could not be completed.",
    );
  }
  return result;
}

const fmtClock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const fmtShort = (seconds: number) => {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

const fmtDue = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const fmtWhen = (value: string) =>
  parseServerDate(value).toLocaleString("en-US", {
    timeZone: MANILA_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// "Oct 28, 2026": the day a task was assigned.
const fmtDay = (value: string) =>
  parseServerDate(value).toLocaleDateString("en-US", {
    timeZone: MANILA_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  });

// "5:19 PM": the time of day a task was assigned.
const fmtTimeOfDay = (value: string) =>
  parseServerDate(value).toLocaleTimeString("en-US", {
    timeZone: MANILA_TZ,
    hour: "numeric",
    minute: "2-digit",
  });

function parseEstimate(
  hours: string,
  minutes: string,
): { total: number | null; error?: string } {
  const h = hours.trim();
  const m = minutes.trim();
  if (h === "" && m === "") return { total: null };

  const hv = h === "" ? 0 : Number(h);
  const mv = m === "" ? 0 : Number(m);
  if (!Number.isInteger(hv) || !Number.isInteger(mv) || hv < 0 || mv < 0)
    return { total: null, error: "Use whole numbers for hours and minutes." };
  if (mv > 59)
    return { total: null, error: "Minutes must be between 0 and 59." };

  const total = hv * 60 + mv;
  if (total < 1)
    return { total: null, error: "Estimate must be at least 1 minute." };
  if (total > 99999)
    return { total: null, error: "That estimate is too long." };
  return { total };
}

const isClosed = (task: ManagedTask) =>
  task.status === "completed" || task.status === "cancelled";

// The clock is shown as HH:MM:SS while the task is open (ongoing or paused).
const isTicking = (task: ManagedTask) =>
  task.status === "in_progress" || task.status === "paused";

// When the task was first started (null if it hasn't started yet).
const startedOf = (task: ManagedTask) =>
  task.started_at ?? task.running_since ?? null;

const endedOf = (task: ManagedTask) => {
  if (!isClosed(task)) return null;
  if (task.completed_at) return task.completed_at;
  if (task.status === "completed") return task.updates?.[0]?.created_at ?? null;
  return null;
};

// Replaces the timer for Multimedia: "Started Oct 28, 5:19 PM · Ended Oct 29, 2:00 PM"
const fmtRange = (task: ManagedTask) => {
  const started = startedOf(task);
  const ended = endedOf(task);
  if (!started) return "Not started";
  return `Started ${fmtWhen(started)}${ended ? ` · Ended ${fmtWhen(ended)}` : ""}`;
};

const isOverdue = (task: ManagedTask, today: string) =>
  !!task.due_date && !isClosed(task) && task.due_date.slice(0, 10) < today;

// Running past its estimate counts as overdue too. Never flagged when the
// timers are hidden, otherwise it would reveal timer data.
const isOvertime = (task: ManagedTask, nowMs: number, hideTimer = false) =>
  !hideTimer &&
  !isClosed(task) &&
  !!task.estimated_minutes &&
  liveSecondsAt(task, nowMs) > task.estimated_minutes * 60;

// Manila calendar day ("2026-11-09") of a server timestamp.
const dayOf = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TZ }).format(
    parseServerDate(value),
  );

// First day of the chosen period, or null for "any time".
const periodStart = (period: Period): string | null => {
  if (period === "all") return null;
  const today = localToday();
  if (period === "today") return today;
  if (period === "month") return `${today.slice(0, 7)}-01`;
  // week: back up to Monday
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const inPeriod = (task: ManagedTask, period: Period) => {
  const start = periodStart(period);
  return !start || dayOf(task.created_at) >= start;
};
// Newest remark: the API's last_remark, or the newest update that has one.
const latestRemark = (task: ManagedTask): string | null =>
  task.last_remark ||
  task.updates?.find((update) => update.remarks)?.remarks ||
  null;

const pauseReasonText = (
  reason: string | null | undefined,
  names: Map<number, string>,
): string | null => {
  if (!reason) return null;
  return reason.replace(/Task\s*#(\d+)/gi, (_match, id) => {
    const name = names.get(Number(id));
    return name ? `“${name}”` : "another task";
  });
};

const isInterruptionReason = (reason: string | null | undefined) =>
  !!reason && /Task\s*#\d+/i.test(reason);

function liveSecondsAt(task: ManagedTask, nowMs: number) {
  return (
    task.worked_seconds +
    (task.running_since
      ? workMsBetween(serverMs(task.running_since), nowMs) / 1000
      : 0)
  );
}

const BAR_FILL: Record<Status, string> = {
  in_progress: "bg-yellow-400",
  paused: "bg-orange-400",
  pending: "bg-slate-300",
  for_review: "bg-indigo-400",
  revision_needed: "bg-orange-500",
  completed: "bg-emerald-500",
  cancelled: "bg-rose-300",
};

const STATUS_ORDER: Record<Status, number> = {
  in_progress: 0,
  paused: 1,
  revision_needed: 2,
  pending: 3,
  for_review: 4,
  completed: 5,
  cancelled: 6,
};

type Focus = "all" | "working" | "paused" | "overdue";
type Period = "all" | "today" | "week" | "month";

const EMPLOYEES_PER_PAGE = 8;

type EmployeeSummary = {
  id: number;
  name: string;
  number: string;
  all: ManagedTask[];
};

function EmployeeSummaryRow({
  summary,
  nowMs,
  today,
  expanded,
  onToggle,
  onHistory,
  pauseText,
  hideTimer,
  productivity,
  date,
}: {
  summary: EmployeeSummary;
  nowMs: number;
  today: string;
  expanded: boolean;
  onToggle: () => void;
  onHistory: (task: ManagedTask) => void;
  pauseText: (task: ManagedTask) => string | null;
  hideTimer: boolean;
  productivity?: ProductivityRow;
  date: string;
}) {
  const { all } = summary;

  const counts: Record<Status, number> = {
    in_progress: 0,
    paused: 0,
    pending: 0,
    for_review: 0,
    revision_needed: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const task of all) counts[task.status] += 1;

  // The bar only covers ongoing + paused tasks.
  const activeTotal = counts.in_progress + counts.paused;

  const overdue = all.filter(
    (task) => isOverdue(task, today) || isOvertime(task, nowMs, hideTimer),
  ).length;
  const worked = all.reduce((sum, task) => sum + liveSecondsAt(task, nowMs), 0);
  const runningTask = all.find((task) => task.status === "in_progress");
  const pausedTask = [...all]
    .reverse()
    .find((task) => task.status === "paused");

  // Only what is being worked on right now: ongoing first, then paused.
  const listed = all
    .filter(
      (task) =>
        task.status === "in_progress" ||
        task.status === "paused" ||
        task.status === "revision_needed",
    )
    .sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.id - b.id,
    );

  return (
    <div>
      {/* Compact row */}
      <button
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:gap-4 sm:px-5"
        onClick={onToggle}
        type="button"
      >
        <div
          className="w-44 shrink-0 sm:w-64"
          title={`${summary.name} · ${summary.number}`}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                runningTask
                  ? "animate-pulse bg-emerald-500"
                  : pausedTask
                    ? "bg-amber-400"
                    : "bg-slate-300"
              }`}
            />
            <p className="truncate text-sm font-semibold text-slate-900">
              {summary.name}
            </p>
          </div>
          <p className="mt-0.5 truncate pl-[18px] text-xs text-slate-500">
            {runningTask ? (
              <>
                <span className="font-medium text-emerald-700">Working</span> ·{" "}
                {runningTask.particulars}{" "}
                {!hideTimer && (
                  <span
                    className={`tabular-nums ${
                      isOvertime(runningTask, nowMs, hideTimer)
                        ? "font-semibold text-rose-600"
                        : ""
                    }`}
                  >
                    · {fmtClock(liveSecondsAt(runningTask, nowMs))}
                  </span>
                )}
              </>
            ) : pausedTask ? (
              <>
                <span className="font-medium text-amber-700">Paused</span> ·{" "}
                {pausedTask.particulars}{" "}
                {!hideTimer && (
                  <span
                    className={`tabular-nums ${
                      isOvertime(pausedTask, nowMs, hideTimer)
                        ? "font-semibold text-rose-600"
                        : ""
                    }`}
                  >
                    · {fmtClock(liveSecondsAt(pausedTask, nowMs))}
                  </span>
                )}
              </>
            ) : counts.pending + counts.revision_needed > 0 ? (
              <>Idle · {counts.pending + counts.revision_needed} waiting</>
            ) : (
              <>All done</>
            )}
          </p>
        </div>

        {/* Only ongoing + paused tasks. Plain gray when there are none. */}
        <div
          aria-label={`${counts.in_progress} ongoing, ${counts.paused} paused`}
          className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200"
          role="img"
        >
          {(["in_progress", "paused"] as Status[]).map(
            (key) =>
              counts[key] > 0 && (
                <span
                  className={`h-full ${BAR_FILL[key]} ${
                    key === "in_progress" ? "animate-pulse" : ""
                  }`}
                  key={key}
                  style={{ width: `${(counts[key] / activeTotal) * 100}%` }}
                  title={`${STATUS[key].label}: ${counts[key]}`}
                />
              ),
          )}
        </div>

        <span className="hidden shrink-0 sm:inline">
          <ProductivityBadge row={productivity} />
        </span>

        {overdue > 0 && (
          <span className="hidden shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 md:inline">
            {overdue} overdue
          </span>
        )}

        <span className="w-16 shrink-0 text-right">
          <span className="block text-base font-bold tabular-nums leading-tight text-slate-900">
            {activeTotal}
          </span>
          <span className="block text-[11px] text-slate-500">
            {counts.in_progress > 0 && counts.paused > 0
              ? `${counts.in_progress} ongoing · ${counts.paused} paused`
              : counts.in_progress > 0
                ? "ongoing"
                : counts.paused > 0
                  ? "paused"
                  : "active"}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Opened row: a plain list of their tasks */}
      {expanded && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 pb-4 pt-3 sm:px-5">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-500 ring-1 ring-slate-200">
              ID {summary.number}
            </span>
            {!hideTimer && (
              <span className="rounded-full bg-white px-2 py-0.5 font-medium tabular-nums text-slate-700 ring-1 ring-slate-200">
                {fmtShort(worked)} total time
              </span>
            )}
            {overdue > 0 && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                {overdue} overdue
              </span>
            )}
          </div>
          <DayReport row={productivity} />
          {!hideTimer && (
            <AiSummary
              url={`/api/admin/task-management/ai/day?employee_id=${summary.id}&date=${date}`}
            />
          )}
          {listed.length === 0 && (
            <p className="rounded-xl bg-white px-3 py-4 text-center text-xs text-slate-500 ring-1 ring-slate-200">
              No ongoing, paused, or revision tasks.
            </p>
          )}
          <ul className="space-y-2">
            {listed.map((task) => {
              const late = isOvertime(task, nowMs, hideTimer);
              const dueLate = isOverdue(task, today);
              const remark = latestRemark(task);
              const pauseReason = pauseText(task);
              return (
                <li
                  className="rounded-xl bg-white px-3 py-3 ring-1 ring-slate-200"
                  key={task.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
                      <span className="truncate">{task.particulars}</span>
                      {task.priority === "urgent" && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                          <AlertTriangle
                            aria-hidden="true"
                            className="h-3 w-3"
                          />
                          Urgent
                        </span>
                      )}
                    </p>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[task.status].badge} ${
                        task.status === "paused" ? "cursor-help" : ""
                      }`}
                      title={
                        task.status === "paused"
                          ? pauseReason
                            ? `Paused: ${pauseReason}`
                            : "Paused. No reason recorded."
                          : undefined
                      }
                    >
                      {task.status === "in_progress" && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
                      )}
                      {STATUS[task.status].label}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                      {(isTicking(task) ||
                        task.status === "revision_needed") && (
                        <div
                          className={`h-full rounded-full ${BAR_FILL[task.status]}`}
                          style={{ width: `${task.progress}%` }}
                        />
                      )}
                    </div>
                    {(isTicking(task) || task.status === "revision_needed") && (
                      <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-700">
                        {task.progress}%
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Assigned {fmtWhen(task.created_at)}</span>
                    {hideTimer ? (
                      <span>{fmtRange(task)}</span>
                    ) : (
                      <span
                        className={`tabular-nums ${
                          late ? "font-semibold text-rose-600" : ""
                        }`}
                      >
                        Time:{" "}
                        {isTicking(task)
                          ? fmtClock(liveSecondsAt(task, nowMs))
                          : fmtShort(task.worked_seconds)}
                        {task.estimated_minutes &&
                          ` of ${fmtShort(task.estimated_minutes * 60)}`}
                        {late && " · over estimate"}
                      </span>
                    )}
                    {task.due_date && (
                      <span
                        className={dueLate ? "font-semibold text-rose-600" : ""}
                      >
                        Due {fmtDue(task.due_date)}
                        {dueLate && " · overdue"}
                      </span>
                    )}
                  </div>

                  {/* Hidden when it is the same text as the Latest line below,
                      so the employee's remark isn't shown twice. */}
                  {task.status === "paused" &&
                    pauseReason &&
                    pauseReason !== remark && (
                      <p className="mt-1.5 break-words text-xs text-amber-800 [overflow-wrap:anywhere]">
                        Paused: {pauseReason}
                      </p>
                    )}
                  {remark && (
                    <p className="mt-1.5 whitespace-pre-line break-words text-xs italic text-slate-600 [overflow-wrap:anywhere]">
                      Latest: “{remark}”
                    </p>
                  )}
                  <button
                    className="mt-1.5 text-xs font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    onClick={() => onHistory(task)}
                    type="button"
                  >
                    View updates
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function TaskManagementBoard({
  embedded = false,
  hideTimer = false,
}: {
  embedded?: boolean;
  hideTimer?: boolean;
}) {
  const [tasks, setTasks] = useState<ManagedTask[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // True for people who can assign but must not see the board
  // (Roline, Justin). The server sends hide_board and returns no tasks.
  const [boardHidden, setBoardHidden] = useState(false);
  const productivity = useProductivity(!boardHidden);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [memberSearch, setMemberSearch] = useState("");

  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const [employees, setEmployees] = useState<EligibleEmployee[]>([]);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedTask | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [rows, setRows] = useState<TaskRow[]>(() => [newRow()]);
  const [lastAddedKey, setLastAddedKey] = useState<number | null>(null);

  // After "Add another task", jump to the new row so you can type right away.
  useEffect(() => {
    if (lastAddedKey === null) return;
    const el = document.getElementById(
      `task-particulars-${lastAddedKey}`,
    ) as HTMLInputElement | null;
    el?.scrollIntoView({ block: "nearest" });
    el?.focus();
  }, [lastAddedKey]);

  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<ManagedTask | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ManagedTask | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [historyTask, setHistoryTask] = useState<ManagedTask | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ManagedTask | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState<"accept" | "revise" | null>(null);
  const [reviewError, setReviewError] = useState("");

  const reviewQueue = useMemo(
    () =>
      (tasks ?? [])
        .filter((t) => t.status === "for_review")
        .sort(
          (a, b) =>
            parseServerDate(a.submitted_at ?? a.created_at).getTime() -
            parseServerDate(b.submitted_at ?? b.created_at).getTime(),
        ),
    [tasks],
  );

  function openReview(task: ManagedTask) {
    setReviewTarget(task);
    setReviewNote("");
    setReviewError("");
  }

  async function submitReview(decision: "accept" | "revise") {
    if (!reviewTarget) return;
    const note = reviewNote.trim();
    if (decision === "revise" && !note)
      return setReviewError("Tell the employee what needs to be corrected.");

    setReviewing(decision);
    setReviewError("");
    try {
      await readJson(
        await adminFetch(
          `/api/admin/task-management/tasks/${reviewTarget.id}/${
            decision === "accept" ? "accept" : "request-revision"
          }`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note: note || null }),
          },
        ),
      );
      toast.success(
        decision === "accept" ? "Task accepted." : "Revision requested.",
      );
      setReviewTarget(null);
      await load();
    } catch (failure) {
      setReviewError(
        failure instanceof Error
          ? failure.message
          : "Unable to save the review.",
      );
    } finally {
      setReviewing(null);
    }
  }
  // Employee summary: which row is open, and paging.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(EMPLOYEES_PER_PAGE);
  const [focus, setFocus] = useState<Focus>("all");
  const [period, setPeriod] = useState<Period>("all");

  /* ── data ── */

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setError("");
      const result = await readJson(
        await adminFetch("/api/admin/task-management/tasks", {
          cache: "no-store",
        }),
      );
      setOffset(serverMs(result.server_now) - Date.now());
      setBoardHidden(result.hide_board === true);
      setTasks(result.data);
    } catch (failure) {
      setTasks((current) => current ?? []);
      setError(
        failure instanceof Error ? failure.message : "Unable to load tasks.",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ↓ BAGO: toast + reload kapag may dumating na push
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "my-tasks:push") return;
      const payload = event.data.payload as
        | { title?: string; body?: string }
        | undefined;
      toast(
        payload?.body
          ? `${payload.title ?? "Update"}: ${payload.body}`
          : (payload?.title ?? "A task was updated."),
        { icon: "🔔" },
      );
      void load();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [load]);

  useEffect(() => {
    const clock = hideTimer
      ? null
      : window.setInterval(() => setTick((n) => n + 1), 1000);
    const sync = window.setInterval(() => void load(), 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (clock !== null) window.clearInterval(clock);
      window.clearInterval(sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, hideTimer]);

  useEffect(() => {
    if (embedded) {
      setCanCreate(true);
      setCanEdit(true);
      setCanDelete(true);
      return;
    }

    let active = true;
    (async () => {
      try {
        const session = await readJson(
          await adminFetch("/api/admin/session", { cache: "no-store" }),
        );
        if (!active) return;
        const actions: string[] =
          (session.permissions as { key: string; actions: string[] }[])?.find(
            (permission) => permission.key === "task_management",
          )?.actions ?? [];
        const superadmin = session.is_superadmin === true;
        setCanCreate(superadmin || actions.includes("create"));
        setCanEdit(superadmin || actions.includes("edit"));
        setCanDelete(superadmin || actions.includes("delete"));
      } catch {
        /* the API still enforces permissions */
      }
    })();
    return () => {
      active = false;
    };
  }, [embedded]);

  async function loadEmployees() {
    try {
      const result = await readJson(
        await adminFetch("/api/admin/task-management/employees", {
          cache: "no-store",
        }),
      );
      setEmployees(result.data);
      setEmployeesLoaded(true);
    } catch (failure) {
      setFormError(
        failure instanceof Error
          ? failure.message
          : "Unable to load your team.",
      );
    }
  }

  /* ── derived ── */

  const nowMs = Date.now() + offset;

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const task of tasks ?? [])
      result[task.status] = (result[task.status] ?? 0) + 1;
    return result;
  }, [tasks]);

  // Sidebar: one entry per team member, A to Z, with a live status dot.
  const members = useMemo(() => {
    const t = localToday();
    const map = new Map<
      number,
      {
        id: number;
        name: string;
        number: string;
        total: number;
        open: number;
        overdue: number;
        state: "working" | "paused" | "idle";
      }
    >();
    for (const task of tasks ?? []) {
      const member = map.get(task.employee_id) ?? {
        id: task.employee_id,
        name: task.employee_name,
        number: task.employee_number,
        total: 0,
        open: 0,
        overdue: 0,
        state: "idle" as const,
      };
      member.total += 1;
      if (!isClosed(task)) member.open += 1;
      if (isOverdue(task, t) || isOvertime(task, nowMs, hideTimer))
        member.overdue += 1;
      if (task.status === "in_progress") member.state = "working";
      else if (task.status === "paused" && member.state !== "working")
        member.state = "paused";
      map.set(task.employee_id, member);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, nowMs, hideTimer]);

  const visibleMembers = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(term) ||
        member.number.toLowerCase().includes(term),
    );
  }, [members, memberSearch]);

  // Table rows: filtered, newest assigned first.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (tasks ?? [])
      .filter((task) => {
        if (statusFilter !== "all" && task.status !== statusFilter)
          return false;
        if (
          employeeFilter !== "all" &&
          String(task.employee_id) !== employeeFilter
        )
          return false;
        if (!term) return true;
        return (
          task.particulars.toLowerCase().includes(term) ||
          (task.project ?? "").toLowerCase().includes(term) ||
          (task.details ?? "").toLowerCase().includes(term) ||
          task.employee_name.toLowerCase().includes(term) ||
          task.employee_number.toLowerCase().includes(term)
        );
      })
      .sort(
        (a, b) =>
          parseServerDate(b.created_at).getTime() -
          parseServerDate(a.created_at).getTime(),
      );
  }, [tasks, search, statusFilter, employeeFilter]);

  const filtersActive =
    search.trim() !== "" || statusFilter !== "all" || employeeFilter !== "all";

  const summaries = useMemo(() => {
    const term = search.trim().toLowerCase();
    const groups = new Map<number, ManagedTask[]>();

    for (const task of tasks ?? []) {
      if (task.status === "cancelled") continue;
      if (!inPeriod(task, period)) continue;
      if (
        employeeFilter !== "all" &&
        String(task.employee_id) !== employeeFilter
      )
        continue;
      if (
        term &&
        !task.employee_name.toLowerCase().includes(term) &&
        !task.employee_number.toLowerCase().includes(term)
      )
        continue;
      const list = groups.get(task.employee_id) ?? [];
      list.push(task);
      groups.set(task.employee_id, list);
    }

    const result: EmployeeSummary[] = [...groups.values()].map((list) => {
      const all = [...list].sort((a, b) => a.id - b.id);
      return {
        id: all[0].employee_id,
        name: all[0].employee_name,
        number: all[0].employee_number,
        all,
      };
    });

    // Anyone working right now first, then most open tasks, then by name.
    const open = (s: EmployeeSummary) =>
      s.all.filter((t) => !isClosed(t)).length;
    const running = (s: EmployeeSummary) =>
      s.all.some((t) => t.status === "in_progress") ? 1 : 0;
    return result.sort(
      (a, b) =>
        running(b) - running(a) ||
        open(b) - open(a) ||
        a.name.localeCompare(b.name),
    );
  }, [tasks, search, employeeFilter, period]);

  // How many employees fall under each quick filter.
  const focusCounts = useMemo(() => {
    const t = localToday();
    const result: Record<Focus, number> = {
      all: summaries.length,
      working: 0,
      paused: 0,
      overdue: 0,
    };
    for (const item of summaries) {
      if (item.all.some((x) => x.status === "in_progress")) result.working += 1;
      if (item.all.some((x) => x.status === "paused")) result.paused += 1;
      if (
        item.all.some((x) => isOverdue(x, t) || isOvertime(x, nowMs, hideTimer))
      )
        result.overdue += 1;
    }
    return result;
  }, [summaries, nowMs, hideTimer]);

  const shownSummaries = useMemo(() => {
    const t = localToday();
    return summaries.filter((item) => {
      if (focus === "working")
        return item.all.some((x) => x.status === "in_progress");
      if (focus === "paused")
        return item.all.some((x) => x.status === "paused");
      if (focus === "overdue")
        return item.all.some(
          (x) => isOverdue(x, t) || isOvertime(x, nowMs, hideTimer),
        );
      return true;
    });
  }, [summaries, focus, nowMs, hideTimer]);

  const formEmployees = useMemo(() => {
    if (!editing || employees.some((item) => item.id === editing.employee_id))
      return employees;
    return [
      {
        id: editing.employee_id,
        id_number: editing.employee_number,
        name: editing.employee_name,
        can_receive: true,
        reason: null,
      },
      ...employees,
    ];
  }, [employees, editing]);

  const liveSeconds = (task: ManagedTask) => liveSecondsAt(task, nowMs);

  // Task id -> name, so "Interrupted by Task #19" can show the real task name.
  const taskNames = useMemo(
    () =>
      new Map<number, string>(
        (tasks ?? []).map((task) => [task.id, task.particulars]),
      ),
    [tasks],
  );

  const pauseText = (task: ManagedTask) => {
    if (task.status !== "paused") return null;
    if (isInterruptionReason(task.last_pause_reason))
      return pauseReasonText(task.last_pause_reason, taskNames);
    return latestRemark(task) ?? task.last_pause_reason ?? null;
  };

  /* ── actions ── */

  function openCreate() {
    setEditing(null);
    setEmployeeId("");
    setRows([newRow()]);
    setFormError("");
    setFormOpen(true);
    if (!employeesLoaded) void loadEmployees();
  }

  function openEdit(task: ManagedTask) {
    setEditing(task);
    setEmployeeId(String(task.employee_id));
    setRows([
      {
        ...newRow(),
        project: task.project ?? "",
        particulars: task.particulars,
        details: task.details ?? "",
        priority: task.priority,
        due_date: task.due_date ? task.due_date.slice(0, 10) : "",
        hours: task.estimated_minutes
          ? String(Math.floor(task.estimated_minutes / 60))
          : "",
        minutes: task.estimated_minutes
          ? String(task.estimated_minutes % 60)
          : "",
      },
    ]);
    setFormError("");
    setFormOpen(true);
    if (!employeesLoaded) void loadEmployees();
  }

  function updateRow(key: number, patch: Partial<TaskRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    if (rows.length >= MAX_NEW_TASKS) return;
    const row = newRow();
    setRows([...rows, row]);
    setLastAddedKey(row.key);
  }

  function removeRow(key: number) {
    setRows((current) =>
      current.length > 1 ? current.filter((row) => row.key !== key) : current,
    );
  }

  async function save() {
    if (!employeeId) return setFormError("Choose a team member.");

    // Editing: the one task. Creating: every row that has something in it.
    const candidates = rows
      .map((row, index) => ({ row, number: index + 1 }))
      .filter(({ row }) => editing || !isBlankRow(row));

    if (candidates.length === 0)
      return setFormError("Enter the task particulars.");

    const multiple = candidates.length > 1;
    const prepared: {
      key: number;
      particulars: string;
      payload: Record<string, unknown>;
    }[] = [];

    // Only one task can run at a time, so only one starts automatically:
    // the first urgent task, or the first task if none is urgent.
    const startIndex = (() => {
      if (editing) return -1;
      const urgent = candidates.findIndex(
        ({ row }) => row.priority === "urgent",
      );
      return urgent >= 0 ? urgent : 0;
    })();

    for (let i = 0; i < candidates.length; i += 1) {
      const { row, number } = candidates[i];
      const where = multiple ? `Task ${number}: ` : "";
      if (!row.particulars.trim())
        return setFormError(`${where}Enter the task particulars.`);
      const estimate = parseEstimate(row.hours, row.minutes);
      if (estimate.error) return setFormError(`${where}${estimate.error}`);

      const payload: Record<string, unknown> = {
        employee_id: Number(employeeId),
        project: row.project.trim() || null,
        particulars: row.particulars.trim(),
        details: row.details.trim() || null,
        priority: row.priority,
        due_date: row.due_date || null,
        estimated_minutes: estimate.total,
      };
      // Only sent when creating. The edit endpoint doesn't accept it.
      if (!editing) payload.start_now = i === startIndex;

      prepared.push({
        key: row.key,
        particulars: row.particulars.trim(),
        payload,
      });
    }

    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        await readJson(
          await adminFetch(`/api/admin/task-management/tasks/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(prepared[0].payload),
          }),
        );
        toast.success("Task updated.");
        setFormOpen(false);
        await load();
        return;
      }

      const saved = new Set<number>();
      for (const item of prepared) {
        try {
          await readJson(
            await adminFetch("/api/admin/task-management/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item.payload),
            }),
          );
          saved.add(item.key);
        } catch (failure) {
          setRows((current) => current.filter((row) => !saved.has(row.key)));
          setFormError(
            `Couldn’t assign “${item.particulars}”. ${
              failure instanceof Error
                ? failure.message
                : "Unable to save the task."
            }`,
          );
          if (saved.size > 0)
            toast.success(
              `${saved.size} ${saved.size === 1 ? "task" : "tasks"} assigned.`,
            );
          await load();
          return;
        }
      }

      toast.success(
        prepared.length === 1
          ? hideTimer
            ? "Task assigned."
            : "Task assigned. Timer started."
          : hideTimer
            ? `${prepared.length} tasks assigned.`
            : `${prepared.length} tasks assigned. Timer started on the first one.`,
      );
      setFormOpen(false);
      await load();
    } catch (failure) {
      setFormError(
        failure instanceof Error ? failure.message : "Unable to save the task.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await readJson(
        await adminFetch(
          `/api/admin/task-management/tasks/${cancelTarget.id}/cancel`,
          { method: "PATCH" },
        ),
      );
      toast.success("Task cancelled.");
      setCancelTarget(null);
      await load();
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Unable to cancel the task.",
      );
    } finally {
      setCancelling(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await readJson(
        await adminFetch(
          `/api/admin/task-management/tasks/${deleteTarget.id}`,
          { method: "DELETE" },
        ),
      );
      toast.success("Task deleted.");
      setDeleteTarget(null);
      await load();
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Unable to delete the task.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const today = localToday();

  // Team state for the Assign dialog.
  const teamEmpty = employeesLoaded && formEmployees.length === 0;
  const nobodyCanReceive =
    employeesLoaded &&
    formEmployees.length > 0 &&
    !formEmployees.some((employee) => employee.can_receive);

  // How many tasks "Assign" will create (blank rows are skipped).
  const assignCount = editing
    ? 1
    : Math.max(1, rows.filter((row) => !isBlankRow(row)).length);

  /* ── render ── */

  return (
    <div className="space-y-5 pb-8">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Assign tasks to your team and see what they’re working on.
          </p>
          <div className="flex gap-2">
            <TaskPushToggle /> {/* ← bago */}
            <Button
              disabled={refreshing}
              onClick={() => void load()}
              type="button"
              variant="outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            {canCreate && (
              <Button onClick={openCreate} type="button">
                <Plus className="mr-2 h-4 w-4" />
                Assign task
              </Button>
            )}
          </div>
        </div>
      ) : (
        <header className="rounded-3xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-8 text-white shadow-lg sm:px-9">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <ClipboardList aria-hidden="true" className="h-7 w-7" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Task Management
                </h1>
                <p className="mt-1 text-sm text-blue-100">
                  {boardHidden
                    ? "Assign tasks to your team."
                    : "Assign tasks to your team and see what they’re working on."}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <TaskPushToggle /> {/* ← bago */}
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
                disabled={refreshing}
                onClick={() => void load()}
                type="button"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={refreshing ? "animate-spin" : ""}
                  size={16}
                />
                Refresh
              </button>
              {canCreate && (
                <Button
                  className="bg-white font-semibold text-blue-700 shadow-md hover:bg-blue-50"
                  onClick={openCreate}
                  type="button"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Assign task
                </Button>
              )}
            </div>
          </div>
        </header>
      )}

      {error && (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {reviewQueue.length > 0 && (canEdit || canCreate) && (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
            <Send aria-hidden="true" className="h-4 w-4 text-indigo-600" />
            Needs your review
            <span className="rounded-full bg-indigo-600 px-2 text-xs tabular-nums text-white">
              {reviewQueue.length}
            </span>
          </h2>
          <ul className="space-y-2">
            {reviewQueue.map((task) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-indigo-100"
                key={task.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {task.particulars}
                  </p>
                  <p className="text-xs text-slate-500">
                    {task.employee_name} · Submitted{" "}
                    {fmtWhen(task.submitted_at ?? task.created_at)}
                    {!hideTimer && ` · ${fmtShort(task.worked_seconds)} worked`}
                    {(task.revision_count ?? 0) > 0 &&
                      ` · Revision #${task.revision_count}`}
                  </p>
                </div>
                <Button
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                  onClick={() => openReview(task)}
                  size="sm"
                  type="button"
                >
                  Review
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* Status tiles double as filters */}
      {!boardHidden && tasks !== null && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {STAT_TILES.map((tile) => {
            const selected = statusFilter === tile.key;
            return (
              <button
                aria-pressed={selected}
                className={`rounded-2xl border border-t-4 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tile.accent} ${
                  selected
                    ? "border-blue-500 ring-1 ring-blue-500"
                    : "border-slate-200"
                }`}
                key={tile.key}
                onClick={() => setStatusFilter(selected ? "all" : tile.key)}
                type="button"
              >
                <p className="text-sm text-slate-500">{tile.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                  {counts[tile.key] ?? 0}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Employee summary: one compact row per team member */}
      {!boardHidden &&
        tasks !== null &&
        tasks.some((task) => task.status !== "cancelled") && (
          <section aria-label="Team summary" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <UsersRound
                    aria-hidden="true"
                    className="h-4 w-4 text-blue-600"
                  />
                  Team summary
                </h2>
                <p className="text-sm text-slate-500">
                  See who is working on what. Click a row for their tasks.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {(["in_progress", "paused"] as Status[]).map((key) => (
                  <span className="flex items-center gap-1.5" key={key}>
                    <span
                      className={`h-2.5 w-2.5 rounded-sm ${BAR_FILL[key]}`}
                    />
                    {STATUS[key].label}
                  </span>
                ))}
              </div>
            </div>

            {/* Quick filters */}
            <div
              aria-label="Filter team members"
              className="flex flex-wrap gap-2"
              role="group"
            >
              {(
                [
                  ["all", "All"],
                  ["working", "Working now"],
                  ["paused", "Paused"],
                  ["overdue", "Overdue"],
                ] as const
              ).map(([key, label]) => {
                const on = focus === key;
                return (
                  <button
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      on
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
                    }`}
                    key={key}
                    onClick={() => {
                      setFocus(key);
                      setVisibleCount(EMPLOYEES_PER_PAGE);
                      setExpandedId(null);
                    }}
                    type="button"
                  >
                    {label}
                    <span
                      className={`rounded-full px-1.5 text-xs tabular-nums ${
                        on ? "bg-white/20" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {focusCounts[key]}
                    </span>
                  </button>
                );
              })}
            </div>
            <DayPicker
              date={productivity.date}
              onChange={productivity.setDate}
            />
            <ProductivityTiles
              people={members.map((m) => ({ id: m.id, name: m.name }))}
              rows={productivity.rows}
            />
            {/* Period filter */}
            <div
              aria-label="Filter by period"
              className="inline-flex max-w-full overflow-x-auto rounded-full border border-slate-200 bg-white p-0.5"
              role="group"
            >
              {(
                [
                  ["all", "Any time"],
                  ["today", "Today"],
                  ["week", "This week"],
                  ["month", "This month"],
                ] as const
              ).map(([key, label]) => {
                const on = period === key;
                return (
                  <button
                    aria-pressed={on}
                    className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      on
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                    key={key}
                    onClick={() => {
                      setPeriod(key);
                      setVisibleCount(EMPLOYEES_PER_PAGE);
                      setExpandedId(null);
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {shownSummaries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
                Nobody matches this filter right now.{" "}
                <button
                  className="font-medium text-blue-700 hover:underline"
                  onClick={() => {
                    setFocus("all");
                    setPeriod("all");
                  }}
                  type="button"
                >
                  Show everyone
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {shownSummaries.slice(0, visibleCount).map((summary) => (
                  <EmployeeSummaryRow
                    date={productivity.date}
                    expanded={
                      expandedId === summary.id || shownSummaries.length === 1
                    }
                    hideTimer={hideTimer}
                    key={summary.id}
                    nowMs={nowMs}
                    onHistory={setHistoryTask}
                    onToggle={() =>
                      setExpandedId((current) =>
                        current === summary.id ? null : summary.id,
                      )
                    }
                    pauseText={pauseText}
                    productivity={productivity.byEmployee.get(summary.id)}
                    summary={summary}
                    today={today}
                  />
                ))}
              </div>
            )}

            {shownSummaries.length > EMPLOYEES_PER_PAGE && (
              <div className="flex gap-2">
                {visibleCount < shownSummaries.length && (
                  <Button
                    className="flex-1"
                    onClick={() =>
                      setVisibleCount((count) => count + EMPLOYEES_PER_PAGE)
                    }
                    type="button"
                    variant="outline"
                  >
                    Show more ({shownSummaries.length - visibleCount} left)
                  </Button>
                )}
                {visibleCount > EMPLOYEES_PER_PAGE && (
                  <Button
                    className="flex-1"
                    onClick={() => setVisibleCount(EMPLOYEES_PER_PAGE)}
                    type="button"
                    variant="ghost"
                  >
                    Show fewer
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

      {/* Hidden-board users (Roline, Justin) only get the Assign button */}
      {boardHidden ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
          Gamitin ang <span className="font-semibold">Assign task</span> para
          magbigay ng task sa kahit sinong empleyado.
        </div>
      ) : (
        /* Sidebar (team members) + table */
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {members.length > 0 && (
            <aside
              aria-label="Team members"
              className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:w-64 lg:shrink-0"
            >
              <div className="border-b border-slate-100 p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <UsersRound
                    aria-hidden="true"
                    className="h-4 w-4 text-blue-600"
                  />
                  Team members
                </p>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Employee
                </p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    aria-label="Find a team member"
                    className="h-9 pl-8 text-sm"
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Find a name"
                    value={memberSearch}
                  />
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto p-2 lg:max-h-[560px] lg:flex-col lg:gap-1 lg:overflow-x-hidden lg:overflow-y-auto">
                <button
                  aria-pressed={employeeFilter === "all"}
                  className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:w-full ${
                    employeeFilter === "all"
                      ? "bg-blue-50 text-blue-800 ring-1 ring-blue-500"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => setEmployeeFilter("all")}
                  type="button"
                >
                  <span>Everyone</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-slate-600 ring-1 ring-slate-200">
                    {tasks?.length ?? 0}
                  </span>
                </button>

                {visibleMembers.map((member) => {
                  const selected = employeeFilter === String(member.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:w-full ${
                        selected
                          ? "bg-blue-50 ring-1 ring-blue-500"
                          : "hover:bg-slate-50"
                      }`}
                      key={member.id}
                      onClick={() =>
                        setEmployeeFilter(selected ? "all" : String(member.id))
                      }
                      title={`${member.name} · ${member.number}`}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          member.state === "working"
                            ? "animate-pulse bg-emerald-500"
                            : member.state === "paused"
                              ? "bg-amber-400"
                              : "bg-slate-300"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block max-w-[150px] truncate text-sm font-medium text-slate-900 lg:max-w-none">
                          {member.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {member.state === "working"
                            ? "Working now"
                            : member.state === "paused"
                              ? "Paused"
                              : member.open > 0
                                ? `Idle · ${member.open} waiting`
                                : "All done"}
                          {member.overdue > 0 && (
                            <span className="font-semibold text-rose-600">
                              {" "}
                              · {member.overdue} overdue
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-slate-600 ring-1 ring-slate-200">
                        {member.total}
                      </span>
                    </button>
                  );
                })}

                {visibleMembers.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-slate-500">
                    No one matches “{memberSearch}”.
                  </p>
                )}
              </div>
            </aside>
          )}

          <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    aria-label="Search tasks"
                    className="pl-9"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search task, employee, or employee ID"
                    value={search}
                  />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Select onValueChange={setStatusFilter} value={statusFilter}>
                    <SelectTrigger
                      aria-label="Filter by status"
                      className="w-full sm:w-[160px]"
                    >
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent
                      className={SELECT_CONTENT_CLASS}
                      position="popper"
                    >
                      <SelectItem value="all">All statuses</SelectItem>
                      {(Object.keys(STATUS) as Status[]).map((key) => (
                        <SelectItem key={key} value={key}>
                          {STATUS[key].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filtersActive && (
                    <Button
                      className="shrink-0"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                        setEmployeeFilter("all");
                      }}
                      type="button"
                      variant="ghost"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {tasks === null ? (
              <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-slate-500">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                Loading tasks…
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left text-sm [&_td]:px-3 [&_th]:px-3">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="h-11 px-4 py-3">Task</th>

                      <th className="px-4 py-3">Assigned</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Progress</th>
                      <th className="px-4 py-3">
                        {hideTimer ? "Started / Ended" : "Time"}
                      </th>
                      <th className="px-4 py-3">Due</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((task) => {
                      const overdue =
                        !!task.due_date &&
                        !isClosed(task) &&
                        task.due_date.slice(0, 10) < today;
                      const overtime = isOvertime(task, nowMs, hideTimer);
                      const running = task.status === "in_progress";
                      const ticking = isTicking(task);
                      const pauseReason = pauseText(task);
                      const started = startedOf(task);
                      const ended = endedOf(task);
                      return (
                        <tr
                          className={`text-slate-700 transition-colors hover:bg-blue-50/50 ${
                            overtime ? "bg-rose-50/40" : ""
                          }`}
                          key={task.id}
                        >
                          <td className="min-w-[180px] px-4 py-3">
                            <button
                              className="block w-full max-w-[220px] rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              onClick={() => setHistoryTask(task)}
                              title="View progress updates"
                              type="button"
                            >
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="line-clamp-2 break-words font-semibold text-slate-900 hover:text-blue-700 hover:underline [overflow-wrap:anywhere]">
                                  {task.particulars}
                                </span>
                                {task.priority === "urgent" && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                                    <AlertTriangle
                                      aria-hidden="true"
                                      className="h-3 w-3"
                                    />
                                    Urgent
                                  </span>
                                )}
                              </span>
                              {task.project && (
                                <span className="mt-0.5 block text-xs font-medium text-blue-700">
                                  {task.project}
                                </span>
                              )}
                              {latestRemark(task) && (
                                <span className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs italic text-slate-500">
                                  Latest: “{latestRemark(task)}”
                                </span>
                              )}
                            </button>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3">
                            <p className="text-sm font-medium text-slate-900">
                              {fmtDay(task.created_at)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {fmtTimeOfDay(task.created_at)}
                            </p>
                            {task.assigned_by_name && (
                              <p className="text-xs text-slate-400">
                                by {task.assigned_by_name}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[task.status].badge} ${
                                task.status === "paused" ? "cursor-help" : ""
                              }`}
                              title={
                                task.status === "paused"
                                  ? pauseReason
                                    ? `Paused: ${pauseReason}`
                                    : "Paused. No reason recorded."
                                  : undefined
                              }
                            >
                              {task.status === "in_progress" && (
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
                              )}
                              {STATUS[task.status].label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex w-20 items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${
                                    task.status === "completed"
                                      ? "bg-emerald-500"
                                      : task.priority === "urgent"
                                        ? "bg-rose-500"
                                        : task.status === "in_progress"
                                          ? "bg-yellow-400"
                                          : "bg-blue-600"
                                  }`}
                                  style={{ width: `${task.progress}%` }}
                                />
                              </div>
                              <span className="w-9 text-right text-xs tabular-nums text-slate-500">
                                {task.progress}%
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {hideTimer ? (
                              <div className="text-xs text-slate-600">
                                <p>
                                  {started
                                    ? `Started ${fmtWhen(started)}`
                                    : "Not started"}
                                </p>
                                {ended && (
                                  <p className="text-slate-400">
                                    Ended {fmtWhen(ended)}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <>
                                <span
                                  className={
                                    overtime
                                      ? "font-semibold text-rose-600"
                                      : task.status === "in_progress"
                                        ? "font-semibold text-yellow-700"
                                        : task.status === "paused"
                                          ? "font-semibold text-orange-700"
                                          : task.status === "completed"
                                            ? "font-semibold text-emerald-700"
                                            : ""
                                  }
                                >
                                  {ticking
                                    ? fmtClock(liveSeconds(task))
                                    : fmtShort(task.worked_seconds)}
                                </span>
                                {task.estimated_minutes && (
                                  <span
                                    className={`text-xs ${
                                      overtime
                                        ? "text-rose-400"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {" "}
                                    / {fmtShort(task.estimated_minutes * 60)}
                                  </span>
                                )}
                                {overtime && (
                                  <p className="text-[11px] font-semibold text-rose-600">
                                    Over estimate
                                  </p>
                                )}
                                {task.status === "completed" && (
                                  <p className="text-[11px] font-normal text-emerald-700">
                                    {ended
                                      ? `Done ${fmtWhen(ended)}`
                                      : "Done · time not recorded"}
                                  </p>
                                )}
                              </>
                            )}
                          </td>
                          <td
                            className={`whitespace-nowrap px-4 py-3 text-xs ${
                              overdue
                                ? "font-semibold text-rose-600"
                                : "text-slate-500"
                            }`}
                          >
                            {task.due_date ? fmtDue(task.due_date) : "—"}
                            {overdue && " · overdue"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              {canEdit && task.status === "for_review" && (
                                <Button
                                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                                  onClick={() => openReview(task)}
                                  size="sm"
                                  type="button"
                                >
                                  Review
                                </Button>
                              )}
                              {canEdit && !isClosed(task) && (
                                <>
                                  <Button
                                    aria-label="Edit task"
                                    onClick={() => openEdit(task)}
                                    size="sm"
                                    title="Edit task"
                                    type="button"
                                    variant="outline"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    aria-label="Cancel task"
                                    className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                    onClick={() => setCancelTarget(task)}
                                    size="sm"
                                    title="Cancel task"
                                    type="button"
                                    variant="outline"
                                  >
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {canDelete && (
                                <Button
                                  aria-label="Delete task"
                                  className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                  disabled={running}
                                  onClick={() => setDeleteTarget(task)}
                                  size="sm"
                                  title={
                                    running
                                      ? "This task is running. Cancel it first, then delete it."
                                      : "Delete task"
                                  }
                                  type="button"
                                  variant="outline"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {visible.length === 0 && (
                      <tr>
                        <td className="px-4 py-16 text-center" colSpan={7}>
                          <p className="font-semibold text-slate-900">
                            {filtersActive
                              ? "No matching tasks"
                              : "No tasks yet"}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {filtersActive
                              ? "Try changing the search or filters."
                              : canCreate
                                ? "Assign the first task to someone on your team."
                                : "Tasks you assign to your team will show up here."}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">
              {visible.length} {visible.length === 1 ? "task" : "tasks"} shown
            </div>
          </div>
        </div>
      )}

      {/* ── Assign / edit dialog ── */}
      <Dialog
        onOpenChange={(open) => {
          if (saving && !open) return;
          setFormOpen(open);
        }}
        open={formOpen}
      >
        <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-2xl sm:w-full">
          <DialogHeader className="shrink-0 border-b border-blue-100 bg-gradient-to-r from-blue-50 via-white to-purple-50 px-5 py-5 pr-12 text-left sm:px-6">
            <DialogTitle className="text-lg sm:text-xl">
              {editing
                ? "Edit task"
                : assignCount > 1
                  ? `Assign ${assignCount} tasks`
                  : "Assign a task"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Changes show up on the employee’s board right away."
                : "Pick someone from your team, then add as many tasks as you need. The first task (or the first urgent one) starts automatically and pauses whatever they’re currently working on."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
            {formError && (
              <p
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
                role="alert"
              >
                {formError}
              </p>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-900">
                Team member
              </label>
              <Select
                disabled={
                  (!employeesLoaded && !editing) ||
                  teamEmpty ||
                  Boolean(editing && editing.status !== "pending")
                }
                onValueChange={setEmployeeId}
                value={employeeId}
              >
                <SelectTrigger aria-label="Choose a team member">
                  <SelectValue
                    placeholder={
                      !employeesLoaded
                        ? "Loading your team…"
                        : teamEmpty
                          ? "No team members"
                          : "Select a team member"
                    }
                  />
                </SelectTrigger>
                <SelectContent
                  className={SELECT_CONTENT_CLASS}
                  position="popper"
                >
                  {formEmployees.map((employee) => (
                    <SelectItem
                      disabled={!employee.can_receive}
                      key={employee.id}
                      value={String(employee.id)}
                    >
                      {employee.name} · {employee.id_number}
                      {!employee.can_receive &&
                        ` — ${employee.reason ?? "Can't receive tasks"}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {teamEmpty && (
                <p className="mt-1.5 text-xs text-slate-500">
                  No one is on your team yet. Your team is the non-supervisory
                  staff in your department. Ask an admin to check your position
                  and department.
                </p>
              )}
              {nobodyCanReceive && (
                <p className="mt-1.5 text-xs text-slate-500">
                  Nobody on your team can receive tasks yet. They need an active
                  account with My Tasks access. Ask an admin to set it up in
                  User Access Management.
                </p>
              )}
              {editing && editing.status !== "pending" && (
                <p className="mt-1.5 text-xs text-slate-500">
                  A task that has started can’t be reassigned.
                </p>
              )}
            </div>

            {rows.map((row, index) => (
              <div
                className={
                  editing
                    ? "space-y-4"
                    : "space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                }
                key={row.key}
              >
                {!editing && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">
                      Task {index + 1}
                    </p>
                    {rows.length > 1 && (
                      <button
                        aria-label={`Remove task ${index + 1}`}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        disabled={saving}
                        onClick={() => removeRow(row.key)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium text-slate-900"
                    htmlFor={`task-project-${row.key}`}
                  >
                    Project{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <Input
                    id={`task-project-${row.key}`}
                    maxLength={255}
                    onChange={(event) =>
                      updateRow(row.key, { project: event.target.value })
                    }
                    placeholder="Client portal"
                    value={row.project}
                  />
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium text-slate-900"
                    htmlFor={`task-particulars-${row.key}`}
                  >
                    Task particulars
                  </label>
                  <Input
                    id={`task-particulars-${row.key}`}
                    maxLength={255}
                    onChange={(event) =>
                      updateRow(row.key, { particulars: event.target.value })
                    }
                    onKeyDown={(event) => {
                      // Enter on the last row starts the next one.
                      if (
                        event.key === "Enter" &&
                        !editing &&
                        index === rows.length - 1 &&
                        row.particulars.trim()
                      ) {
                        event.preventDefault();
                        addRow();
                      }
                    }}
                    placeholder="Account dashboard"
                    value={row.particulars}
                  />
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium text-slate-900"
                    htmlFor={`task-details-${row.key}`}
                  >
                    Details{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    className="min-h-[72px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    id={`task-details-${row.key}`}
                    maxLength={2000}
                    onChange={(event) =>
                      updateRow(row.key, { details: event.target.value })
                    }
                    value={row.details}
                  />
                </div>

                <div
                  className={`grid gap-4 ${
                    hideTimer ? "sm:grid-cols-2" : "sm:grid-cols-3"
                  }`}
                >
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-900">
                      Priority
                    </label>
                    <Select
                      onValueChange={(value) =>
                        updateRow(row.key, {
                          priority: value === "urgent" ? "urgent" : "normal",
                        })
                      }
                      value={row.priority}
                    >
                      <SelectTrigger aria-label={`Priority, task ${index + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        className={SELECT_CONTENT_CLASS}
                        position="popper"
                      >
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-sm font-medium text-slate-900"
                      htmlFor={`task-due-${row.key}`}
                    >
                      Due date{" "}
                      <span className="font-normal text-slate-400">
                        (optional)
                      </span>
                    </label>
                    <Input
                      id={`task-due-${row.key}`}
                      min={editing ? undefined : today}
                      onChange={(event) =>
                        updateRow(row.key, { due_date: event.target.value })
                      }
                      type="date"
                      value={row.due_date}
                    />
                  </div>
                  {/* Estimates only matter for timed work, so Multimedia
                      doesn't see this field. Remove the condition if they
                      should still be able to set one. */}
                  {!hideTimer && (
                    <div>
                      <label
                        className="mb-1.5 block text-sm font-medium text-slate-900"
                        htmlFor={`task-hours-${row.key}`}
                      >
                        Estimate{" "}
                        <span className="font-normal text-slate-400">
                          (optional)
                        </span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          aria-label={`Estimate hours, task ${index + 1}`}
                          id={`task-hours-${row.key}`}
                          inputMode="numeric"
                          onChange={(event) =>
                            updateRow(row.key, {
                              hours: event.target.value.replace(/\D/g, ""),
                            })
                          }
                          placeholder="0"
                          value={row.hours}
                        />
                        <span className="text-sm text-slate-500">h</span>
                        <Input
                          aria-label={`Estimate minutes, task ${index + 1}`}
                          inputMode="numeric"
                          onChange={(event) =>
                            updateRow(row.key, {
                              minutes: event.target.value.replace(/\D/g, ""),
                            })
                          }
                          placeholder="30"
                          value={row.minutes}
                        />
                        <span className="text-sm text-slate-500">m</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {!editing && (
              <Button
                className="w-full border-dashed"
                disabled={saving || teamEmpty || rows.length >= MAX_NEW_TASKS}
                onClick={addRow}
                type="button"
                variant="outline"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add another task
              </Button>
            )}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:px-6">
            <Button
              disabled={saving}
              onClick={() => setFormOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
              disabled={saving || teamEmpty}
              onClick={() => void save()}
              type="button"
            >
              {saving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              {editing
                ? "Save changes"
                : assignCount > 1
                  ? `Assign ${assignCount} tasks`
                  : "Assign task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Progress history ── */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setHistoryTask(null);
        }}
        open={Boolean(historyTask)}
      >
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-lg flex-col rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>
              {historyTask?.project ?? historyTask?.particulars}
            </DialogTitle>
            <DialogDescription>{historyTask?.employee_name}</DialogDescription>
          </DialogHeader>

          {historyTask && (
            <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <p className="whitespace-pre-line break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                {historyTask.particulars}
              </p>

              {historyTask.details && (
                <p className="whitespace-pre-line break-words text-sm text-slate-600 [overflow-wrap:anywhere]">
                  {historyTask.details}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${STATUS[historyTask.status].badge}`}
                >
                  {STATUS[historyTask.status].label}
                </span>
                {historyTask.priority === "urgent" && (
                  <span className="font-semibold text-rose-700">Urgent</span>
                )}
                {historyTask.due_date && (
                  <span>Due {fmtDue(historyTask.due_date)}</span>
                )}
                <span>
                  Assigned {fmtWhen(historyTask.created_at)}
                  {historyTask.assigned_by_name &&
                    ` by ${historyTask.assigned_by_name}`}
                </span>
                {hideTimer && <span>{fmtRange(historyTask)}</span>}
              </div>

              {latestRemark(historyTask) && (
                <p className="whitespace-pre-line break-words text-xs italic text-slate-600 [overflow-wrap:anywhere]">
                  Latest: “{latestRemark(historyTask)}”
                </p>
              )}
            </div>
          )}

          <p className="text-sm font-semibold text-slate-900">
            Progress updates
          </p>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden">
            {historyTask && (historyTask.updates ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                No updates yet. They appear when the employee saves progress,
                pauses with a percent, or completes the task.
              </p>
            )}
            {historyTask?.updates?.map((update, index) => (
              <div
                className="min-w-0 overflow-hidden rounded-xl border border-slate-200 px-4 py-3"
                key={`${update.created_at}-${index}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {update.progress}%
                  </span>
                  <span className="text-xs text-slate-500">
                    {fmtWhen(update.created_at)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-700 [overflow-wrap:anywhere]">
                  {update.remarks || (
                    <span className="text-slate-400">No remarks</span>
                  )}
                </p>
                {update.updated_by_name && (
                  <p className="mt-1 text-xs text-slate-500">
                    by {update.updated_by_name}
                  </p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setHistoryTask(null)}
              type="button"
              variant="outline"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (!open && !reviewing) setReviewTarget(null);
        }}
        open={Boolean(reviewTarget)}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>Review submitted task</DialogTitle>
            <DialogDescription>{reviewTarget?.employee_name}</DialogDescription>
          </DialogHeader>

          {reviewTarget && (
            <div className="min-w-0 space-y-1 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <p className="whitespace-pre-line break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                {reviewTarget.particulars}
              </p>
              {reviewTarget.details && (
                <p className="whitespace-pre-line break-words text-sm text-slate-600 [overflow-wrap:anywhere]">
                  {reviewTarget.details}
                </p>
              )}
              {latestRemark(reviewTarget) && (
                <p className="whitespace-pre-line break-words text-xs italic text-slate-600 [overflow-wrap:anywhere]">
                  Latest: “{latestRemark(reviewTarget)}”
                </p>
              )}
              <p className="text-xs text-slate-500">
                Submitted{" "}
                {fmtWhen(reviewTarget.submitted_at ?? reviewTarget.created_at)}
                {!hideTimer &&
                  ` · ${fmtShort(reviewTarget.worked_seconds)} worked`}
              </p>
            </div>
          )}

          {reviewTarget && !hideTimer && (
            <AiSummary
              url={`/api/admin/task-management/ai/review/${reviewTarget.id}`}
            />
          )}

          {reviewError && (
            <p
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
              role="alert"
            >
              {reviewError}
            </p>
          )}

          <textarea
            aria-label="Review note"
            className="min-h-[96px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            maxLength={450}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Feedback (required if you request a revision)"
            value={reviewNote}
          />

          <DialogFooter className="gap-2">
            <Button
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
              disabled={reviewing !== null}
              onClick={() => void submitReview("revise")}
              type="button"
              variant="outline"
            >
              {reviewing === "revise" ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Request revision
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={reviewing !== null}
              onClick={() => void submitReview("accept")}
              type="button"
            >
              {reviewing === "accept" ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Cancel confirmation ── */}
      <Dialog
        onOpenChange={(open) => {
          if (!open && !cancelling) setCancelTarget(null);
        }}
        open={Boolean(cancelTarget)}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>Cancel this task?</DialogTitle>
            <DialogDescription className="leading-relaxed">
              “{cancelTarget?.particulars}” will be closed for{" "}
              {cancelTarget?.employee_name}.
              {!hideTimer &&
                cancelTarget &&
                isTicking(cancelTarget) &&
                " Its timer stops."}{" "}
              {hideTimer
                ? "Its history is kept."
                : "The time already logged is kept."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              disabled={cancelling}
              onClick={() => setCancelTarget(null)}
              type="button"
              variant="outline"
            >
              Keep task
            </Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={cancelling}
              onClick={() => void confirmCancel()}
              type="button"
            >
              {cancelling && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Cancel task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        open={Boolean(deleteTarget)}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>Delete this task?</DialogTitle>
            <DialogDescription className="leading-relaxed">
              “{deleteTarget?.particulars}” for {deleteTarget?.employee_name}{" "}
              will be removed for good, together with its logged time and
              progress updates. This can’t be undone. If you only want to stop
              it, use Cancel instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              type="button"
              variant="outline"
            >
              Keep task
            </Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={deleting}
              onClick={() => void confirmDelete()}
              type="button"
            >
              {deleting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Delete task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
