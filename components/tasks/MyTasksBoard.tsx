"use client";
// components/tasks/MyTasksBoard.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Check,
  Clock3,
  ListChecks,
  Loader,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UserPlus,
} from "lucide-react";
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
import TaskPushToggle from "@/components/tasks/TaskPushToggle"; // PUSH: enable-notifications button
import CompletedCalendar from "@/components/tasks/CompletedCalendar";
import {
  isAfterCutoff,
  localToday,
  manilaDayStart,
  parseServerDate,
  serverMs,
  workMsBetween,
} from "@/lib/time";
/* ============================================================================
 * TYPES + HELPERS
 *
 * hideTimer (Multimedia): the clock is hidden and replaced with the date
 * started / ended. Needs started_at and completed_at from the API.
 *
 * created_by_self: the API sets this to true only for tasks the signed-in
 * employee created themselves. Edit and Delete are shown only for those.
 * (The API must enforce the same rule. Hiding buttons is not security.)
 *
 * pending_decision: the API sets this while a new assignment auto-started on
 * top of another task and the employee still has to choose
 * "Start Task B" or "Pause Task B". It opens the decision dialog below.
 * ========================================================================== */

type TaskStatus =
  | "pending"
  | "in_progress"
  | "paused"
  | "for_review"
  | "revision_needed"
  | "completed"
  | "cancelled";

type PendingDecision = {
  id: number;
  interrupted_task_id: number | null; // Task A (was running before the assignment)
  interrupted_task_name: string | null;
  created_at: string;
};

type Task = {
  id: number;
  project: string | null;
  particulars: string;
  details: string | null;
  priority: "normal" | "urgent";
  status: TaskStatus;
  progress: number;
  estimated_minutes: number | null;
  due_date: string | null;
  started_at?: string | null;
  completed_at: string | null;
  worked_seconds: number;
  running_since: string | null;
  segments: number;
  last_remark: string | null;
  created_at?: string | null;
  assigned_by_name?: string | null;
  assigned_by_id?: number | null;
  updates?: TaskUpdate[];
  created_by_self?: boolean; // true = the employee made this task, so they may edit/delete it
  reassigned_from_name?: string | null; // who passed this task to you
  can_reassign?: boolean; // optional: the API decides
  submitted_at?: string | null;
  revision_count?: number;
  requires_review?: boolean; // true = manager ang nag-assign, kaya kailangan ng review
  pending_decision?: PendingDecision | null; // true-ish = employee must choose Start / Pause
};

type Segment = {
  id: number;
  task_id: number;
  particulars: string;
  priority: "normal" | "urgent";
  start: string;
  end: string | null;
  ongoing: boolean;
  pause_reason: string | null;
};

type TaskAction =
  | "start"
  | "pause"
  | "complete"
  | "progress"
  | "switch"
  | "reopen"
  | "submit";

type TaskUpdate = {
  progress: number;
  remarks: string | null;
  created_at: string;
  updated_by_name: string | null;
};

const assignedLabel = (task: Task) =>
  task.reassigned_from_name
    ? `Reassigned by ${task.reassigned_from_name}`
    : task.created_by_self
      ? "Added by you"
      : task.assigned_by_name
        ? `Assigned by ${task.assigned_by_name}`
        : null;

// Taong pwedeng mag-assign sa naka-login na employee (galing sa server).
type Assigner = {
  id: number;
  id_number: string;
  name: string;
  position: string | null;
};
const NO_ASSIGNER = "none";

type NewTaskForm = {
  project: string;
  particulars: string;
  details: string;
  priority: "normal" | "urgent";
  due_date: string;
  hours: string;
  minutes: string;
  startNow: boolean;
  assigned_by_id: string; // NO_ASSIGNER = ako mismo ang nag-add
};

// "Start it right away" is ON by default, so a new task starts its timer as
// soon as it is added. Untick it in the dialog to only add it to the To do list.
const EMPTY_FORM: NewTaskForm = {
  project: "",
  particulars: "",
  details: "",
  priority: "normal",
  due_date: "",
  hours: "",
  minutes: "",
  startNow: true,
  assigned_by_id: NO_ASSIGNER,
};

const SELECT_CONTENT_CLASS =
  "z-[999] border border-slate-200 bg-white text-slate-900 shadow-xl ";

// Value used by the "next task" dropdown when the employee only wants to pause.
const NO_NEXT_TASK = "none";

// Only tasks the employee created themselves can be edited or deleted.
const canModify = (task: Task) => task.created_by_self === true;

type AssignTarget = {
  id: number;
  id_number: string;
  name: string;
  can_receive: boolean;
  reason: string | null;
};

// Pwede i-assign sa iba ang task na galing kay maam (hindi mo ginawa).
const canReassign = (task: Task) =>
  task.can_reassign ?? task.created_by_self !== true;

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.message || "The request could not be completed.");
  return result;
}

const HOUR = 3_600_000;

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

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });

// "Nov 5, 8:58 AM", or a dash when there is no date yet.
const fmtStamp = (value?: string | null) =>
  value
    ? parseServerDate(value).toLocaleString("en-US", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

const floorHour = (ms: number) => {
  const date = new Date(ms);
  date.setMinutes(0, 0, 0);
  return date.getTime();
};

const fmtDue = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

// Names come from the tasks and timeline already loaded on this page.
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

/* ============================================================================
 * SMALL PIECES
 * ========================================================================== */

// The estimate comes from two boxes (hours + minutes). Returns the total in
// minutes, null when both boxes are empty, or an error message.
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

function PriorityBadge({ priority }: { priority: "normal" | "urgent" }) {
  if (priority !== "urgent") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
      <AlertTriangle aria-hidden="true" className="h-3 w-3" />
      Urgent
    </span>
  );
}

function StatusChip({ status }: { status: TaskStatus }) {
  const map: Partial<Record<TaskStatus, { label: string; cls: string }>> = {
    paused: { label: "Paused", cls: "bg-amber-50 text-amber-800" },
    revision_needed: {
      label: "Revision needed",
      cls: "bg-orange-100 text-orange-800",
    },
    for_review: { label: "For review", cls: "bg-indigo-50 text-indigo-800" },
  };
  const chip = map[status] ?? {
    label: "Not started",
    cls: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${chip.cls}`}
    >
      {chip.label}
    </span>
  );
}

function ProgressBar({ value, urgent }: { value: number; urgent?: boolean }) {
  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={value}
      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
      role="progressbar"
    >
      <div
        className={`h-full rounded-full transition-all ${
          urgent ? "bg-rose-500" : "bg-blue-600"
        }`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/* ============================================================================
 * TIMELINE BAR
 * One block per time log. A task that was interrupted shows up as several
 * blocks with the urgent task sitting in between. The open log is ONGOING.
 * Each task gets its own color (same task = same color), and every session is
 * also listed below the bar so tiny blocks are never anonymous.
 *
 * hideTimer (Multimedia): the per-session duration is hidden.
 * ========================================================================== */

const TASK_COLORS = [
  {
    done: "bg-blue-100 text-blue-800",
    live: "bg-blue-600 text-white",
    dot: "bg-blue-500",
  },
  {
    done: "bg-violet-100 text-violet-800",
    live: "bg-violet-600 text-white",
    dot: "bg-violet-500",
  },
  {
    done: "bg-teal-100 text-teal-800",
    live: "bg-teal-600 text-white",
    dot: "bg-teal-500",
  },
  {
    done: "bg-amber-100 text-amber-800",
    live: "bg-amber-600 text-white",
    dot: "bg-amber-500",
  },
  {
    done: "bg-fuchsia-100 text-fuchsia-800",
    live: "bg-fuchsia-600 text-white",
    dot: "bg-fuchsia-500",
  },
  {
    done: "bg-cyan-100 text-cyan-800",
    live: "bg-cyan-600 text-white",
    dot: "bg-cyan-500",
  },
];
const URGENT_COLOR = {
  done: "bg-rose-100 text-rose-800",
  live: "bg-rose-600 text-white",
  dot: "bg-rose-500",
};

function TimelineBar({
  segments,
  nowMs,
  names,
  hideTimer = false,
}: {
  segments: Segment[];
  nowMs: number;
  names: Map<number, string>;
  hideTimer?: boolean;
}) {
  const reasonOf = (segment: Segment) =>
    pauseReasonText(segment.pause_reason, names);

  const { lo, hi, ticks } = useMemo(() => {
    const midnight = manilaDayStart(nowMs);
    let low = midnight + 8 * HOUR;
    let high = midnight + 18 * HOUR;

    for (const segment of segments) {
      low = Math.min(low, serverMs(segment.start));
      high = Math.max(high, segment.end ? serverMs(segment.end) : nowMs);
    }
    high = Math.max(high, nowMs);

    low = floorHour(low);
    high = floorHour(high) + HOUR;

    const span = (high - low) / HOUR;
    const step = span > 12 ? 2 : 1;
    const marks: number[] = [];
    for (let t = low; t <= high; t += step * HOUR) marks.push(t);

    return { lo: low, hi: high, ticks: marks };
  }, [segments, nowMs]);

  const pct = (ms: number) => ((ms - lo) / (hi - lo)) * 100;

  // Same task = same color, so split sessions are easy to match.
  const colorOf = useMemo(() => {
    const ids: number[] = [];
    for (const s of segments) if (!ids.includes(s.task_id)) ids.push(s.task_id);
    return (s: Segment) =>
      s.priority === "urgent"
        ? URGENT_COLOR
        : TASK_COLORS[ids.indexOf(s.task_id) % TASK_COLORS.length];
  }, [segments]);

  const sessions = useMemo(
    () => [...segments].sort((a, b) => serverMs(a.start) - serverMs(b.start)),
    [segments],
  );

  return (
    <div>
      <div className="relative h-12 overflow-hidden rounded-xl bg-slate-100">
        {segments.map((segment) => {
          const start = serverMs(segment.start);
          const end = segment.end ? serverMs(segment.end) : nowMs;
          const width = Math.max(0.4, pct(end) - pct(start));
          const color = colorOf(segment);
          const tone = segment.ongoing ? color.live : color.done;

          return (
            <div
              className={`absolute top-0 flex h-full items-center overflow-hidden whitespace-nowrap border-r-2 border-white px-1.5 text-xs font-medium ${tone}`}
              key={segment.id}
              style={{
                left: `${pct(start)}%`,
                width: `${width}%`,
              }}
              title={`${segment.particulars}\n${fmtTime(start)} – ${
                segment.ongoing ? "ongoing" : fmtTime(end)
              }${reasonOf(segment) ? `\n${reasonOf(segment)}` : ""}`}
            >
              {segment.ongoing && (
                <span className="mr-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-current" />
              )}
              {/* Text is clipped by the block; very small blocks still have the tooltip + list below. */}
              {width > 2.5 && (
                <span className="truncate">{segment.particulars}</span>
              )}
            </div>
          );
        })}
        {segments.length === 0 && (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">
            Nothing tracked yet today.
          </p>
        )}
      </div>

      <div className="relative mt-1 h-5 text-[11px] text-slate-400">
        {ticks.map((tick) => (
          <span
            className="absolute -translate-x-1/2"
            key={tick}
            style={{ left: `${pct(tick)}%` }}
          >
            {new Date(tick).toLocaleTimeString("en-US", {
              timeZone: "Asia/Manila",
              hour: "numeric",
            })}
          </span>
        ))}
      </div>

      {/* Every session, in order, so nothing depends on block width. */}
      {sessions.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {sessions.map((segment) => {
            const start = serverMs(segment.start);
            const end = segment.end ? serverMs(segment.end) : nowMs;
            const color = colorOf(segment);
            return (
              <li
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                key={segment.id}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.dot} ${
                    segment.ongoing ? "animate-pulse" : ""
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">
                    {segment.particulars}
                    {segment.priority === "urgent" && (
                      <span className="ml-2 text-xs font-semibold text-rose-600">
                        Urgent
                      </span>
                    )}
                  </p>
                  {reasonOf(segment) && (
                    <p
                      className="truncate text-xs italic text-slate-500"
                      title={reasonOf(segment) ?? undefined}
                    >
                      {reasonOf(segment)}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  {fmtTime(start)} – {segment.ongoing ? "now" : fmtTime(end)}
                </span>
                {!hideTimer && (
                  <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">
                    {fmtShort(workMsBetween(start, end) / 1000)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-100 ring-1 ring-rose-200" />
          Urgent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 animate-pulse rounded-sm bg-blue-600" />
          Ongoing
        </span>
        <span>Same color = same task</span>
      </div>
    </div>
  );
}

// Survives navigating away and back, so the timer shows right away on return
// instead of waiting for the skeleton + fetch.
let boardCache: {
  tasks: Task[];
  segments: Segment[];
  offset: number;
} | null = null;
let cacheOwner: string | number | null = null;

export const clearMyTasksCache = () => {
  boardCache = null;
  cacheOwner = null;
};

export default function MyTasksBoard({
  title = "My Tasks",
  hideTimer = false,
}: {
  title?: string;
  hideTimer?: boolean;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(boardCache?.tasks ?? null);
  const [segments, setSegments] = useState<Segment[]>(
    boardCache?.segments ?? [],
  );
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [offset, setOffset] = useState(boardCache?.offset ?? 0); // server clock minus browser clock
  const [, setTick] = useState(0);
  const [draft, setDraft] = useState<{ id: number; value: number } | null>(
    null,
  );
  const [remarks, setRemarks] = useState("");
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  // Goes up when a task is completed, so the Completed calendar reloads.
  const [completedVersion, setCompletedVersion] = useState(0);

  const [canCreate, setCanCreate] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NewTaskForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit / delete
  const [editingId, setEditingId] = useState<number | null>(null); // null = adding a new task
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Assign this task to someone else
  const [assignTask, setAssignTask] = useState<Task | null>(null);
  const [assignTargets, setAssignTargets] = useState<AssignTarget[] | null>(
    null,
  );
  const [assignTo, setAssignTo] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [assignError, setAssignError] = useState("");
  const [assigning, setAssigning] = useState(false);

  // New assignment decision: "Start Task B" or "Pause Task B"
  const [decisionMode, setDecisionMode] = useState<"choose" | "pause">(
    "choose",
  );
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionNext, setDecisionNext] = useState<string>(NO_NEXT_TASK);
  const [deciding, setDeciding] = useState(false);

  // Mga pwedeng mag-assign sa akin (ayon sa hierarchy, galing sa server)
  const [assigners, setAssigners] = useState<Assigner[] | null>(null);

  async function loadAssigners() {
    if (assigners !== null) return;
    try {
      const result = await readJson(
        await adminFetch("/api/admin/my-tasks/assigners", {
          cache: "no-store",
        }),
      );
      setAssigners(result.data);
    } catch {
      setAssigners([]);
    }
  }

  // Progress dialog: "pause" asks for % before pausing, "update" just saves %.
  const [progressDialog, setProgressDialog] = useState<{
    task: Task;
    mode: "pause" | "update";
  } | null>(null);
  const [dialogValue, setDialogValue] = useState(0);
  const [dialogRemarks, setDialogRemarks] = useState("");
  // Task to start right after pausing. NO_NEXT_TASK = just pause.
  const [nextTaskId, setNextTaskId] = useState<string>(NO_NEXT_TASK);

  // Remembers which task was already auto-paused today (task id + date).
  const [pausingAll, setPausingAll] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setError("");
      const [taskResult, timelineResult] = await Promise.all([
        adminFetch("/api/admin/my-tasks", { cache: "no-store" }).then(readJson),
        adminFetch("/api/admin/my-tasks/timeline", {
          cache: "no-store",
        }).then(readJson),
      ]);
      setOffset(serverMs(taskResult.server_now) - Date.now());
      setTasks(taskResult.data);
      setSegments(timelineResult.data);
      boardCache = {
        tasks: taskResult.data,
        segments: timelineResult.data,
        offset: serverMs(taskResult.server_now) - Date.now(),
      };
      // Tell the floating timer (RunningTaskPill) to refresh right away.
      window.dispatchEvent(new Event("my-tasks:changed"));
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

  // PUSH: real-time refresh. The service worker (worker/index.js) posts a
  // message whenever a push arrives while this page is open. Show a toast
  // and reload the task list right away instead of waiting for the 15s sync.
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
          : (payload?.title ?? "Your tasks were updated."),
        { icon: "🔔" },
      );
      void load();
      setCompletedVersion((v) => v + 1); // refresh ng Completed calendar kapag na-accept
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [load]);

  // Re-render every second so the timer runs; resync with the server every
  // 15 seconds (so tasks assigned by a manager show up quickly) and whenever
  // the tab comes back into view.
  useEffect(() => {
    const clock = window.setInterval(() => setTick((n) => n + 1), 1000);
    const sync = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Only show "Add task" to accounts with the my_tasks "create" action.
  // The API still enforces permissions.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await readJson(
          await adminFetch("/api/admin/session", { cache: "no-store" }),
        );
        if (!active) return;
        const uid = session.user?.id ?? session.id ?? null; // adjust to your session shape
        if (uid !== null) {
          if (cacheOwner !== null && cacheOwner !== uid) {
            boardCache = null;
            setTasks(null);
            setSegments([]);
            setAssigners(null);
            void load();
          }
          cacheOwner = uid;
        }
        const actions: string[] =
          (session.permissions as { key: string; actions: string[] }[])?.find(
            (permission) => permission.key === "my_tasks",
          )?.actions ?? [];
        setCanCreate(
          session.is_superadmin === true || actions.includes("create"),
        );
      } catch {
        /* hide the button if the session can't be read */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
    void loadAssigners();
  }

  function openEdit(task: Task) {
    const est = task.estimated_minutes;
    setEditingId(task.id);
    setForm({
      project: task.project ?? "",
      particulars: task.particulars,
      details: task.details ?? "",
      priority: task.priority,
      due_date: task.due_date ? task.due_date.slice(0, 10) : "",
      hours: est && est >= 60 ? String(Math.floor(est / 60)) : "",
      minutes: est && est % 60 > 0 ? String(est % 60) : "",
      startNow: false,
      assigned_by_id: task.assigned_by_id
        ? String(task.assigned_by_id)
        : NO_ASSIGNER,
    });
    setFormError("");
    setFormOpen(true);
    void loadAssigners();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await readJson(
        await adminFetch(`/api/admin/my-tasks/${deleteTarget.id}`, {
          method: "DELETE",
        }),
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

  async function saveTask() {
    const particulars = form.particulars.trim();
    if (!particulars) return setFormError("Enter what you’re working on.");
    const estimate = parseEstimate(form.hours, form.minutes);
    if (estimate.error) return setFormError(estimate.error);

    // EDIT: fix a task you already added.
    if (editingId !== null) {
      setSaving(true);
      setFormError("");
      try {
        await readJson(
          await adminFetch(`/api/admin/my-tasks/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project: form.project.trim() || null,
              particulars,
              details: form.details.trim() || null,
              priority: form.priority,
              due_date: form.due_date || null,
              estimated_minutes: estimate.total,
              assigned_by_id:
                form.assigned_by_id === NO_ASSIGNER
                  ? null
                  : Number(form.assigned_by_id),
            }),
          }),
        );
        setFormOpen(false);
        toast.success("Task updated.");
        await load();
      } catch (failure) {
        setFormError(
          failure instanceof Error
            ? failure.message
            : "Unable to update the task.",
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    // ADD: create a new task.
    setSaving(true);
    setFormError("");
    try {
      let newId: number | undefined;
      try {
        const created = await readJson(
          await adminFetch("/api/admin/my-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project: form.project.trim() || null,
              particulars,
              details: form.details.trim() || null,
              priority: form.priority,
              due_date: form.due_date || null,
              estimated_minutes: estimate.total,
              assigned_by_id:
                form.assigned_by_id === NO_ASSIGNER
                  ? null
                  : Number(form.assigned_by_id),
            }),
          }),
        );
        newId = created?.data?.id ?? created?.id;
      } catch (failure) {
        setFormError(
          failure instanceof Error
            ? failure.message
            : "Unable to add the task.",
        );
        return;
      }

      setFormOpen(false);

      // After 5:30 PM a task can't be started; it just goes to the To do list.
      const pastCutoff = isAfterCutoff(Date.now() + offset);
      const startNow = form.startNow && !pastCutoff;

      if (startNow) {
        if (!newId) {
          // The task was saved but we couldn't tell which one it is.
          toast.error(
            "Task added, but its timer couldn’t be started automatically. Press Start on it.",
          );
        } else {
          try {
            await readJson(
              await adminFetch(`/api/admin/my-tasks/${newId}/start`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              }),
            );
            toast.success("Task added and started.");
          } catch (failure) {
            toast.error(
              `Task added, but it couldn’t be started. ${
                failure instanceof Error ? failure.message : ""
              }`.trim(),
            );
          }
        }
      } else if (form.startNow && pastCutoff) {
        toast.success(
          "Task added. Work hours ended at 5:30 PM, so start it tomorrow morning.",
        );
      } else {
        toast.success("Task added.");
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function openAssign(task: Task) {
    setAssignTask(task);
    setAssignTo("");
    setAssignNote("");
    setAssignError("");
    setAssignTargets(null);
    try {
      const result = await readJson(
        await adminFetch("/api/admin/my-tasks/assign-targets", {
          cache: "no-store",
        }),
      );
      setAssignTargets(result.data);
    } catch (failure) {
      setAssignTargets([]);
      setAssignError(
        failure instanceof Error
          ? failure.message
          : "Unable to load your team.",
      );
    }
  }

  async function submitAssign() {
    if (!assignTask) return;
    if (!assignTo) return setAssignError("Choose who to assign this to.");
    setAssigning(true);
    setAssignError("");
    try {
      await readJson(
        await adminFetch(`/api/admin/my-tasks/${assignTask.id}/reassign`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: Number(assignTo),
            note: assignNote.trim() || null,
          }),
        }),
      );
      const name = assignTargets?.find((t) => String(t.id) === assignTo)?.name;
      toast.success(name ? `Task assigned to ${name}.` : "Task assigned.");
      setAssignTask(null);
      setDraft(null);
      setRemarks("");
      await load();
    } catch (failure) {
      setAssignError(
        failure instanceof Error
          ? failure.message
          : "Unable to assign the task.",
      );
    } finally {
      setAssigning(false);
    }
  }

  const nowMs = Date.now() + offset;
  const today = localToday();
  const afterCutoff = isAfterCutoff(nowMs);

  const running = tasks?.find((task) => task.status === "in_progress");
  // A new assignment that auto-started and is waiting for Start / Pause.
  const decisionTask =
    tasks?.find((task) => Boolean(task.pending_decision)) ?? null;
  const decisionName = decisionTask?.particulars ?? "the new task";
  const interruptedName =
    decisionTask?.pending_decision?.interrupted_task_name ??
    "your previous task";
  const historyTask = tasks?.find((task) => task.id === historyId) ?? null;
  const paused = tasks?.filter((task) => task.status === "paused") ?? [];
  const pending = tasks?.filter((task) => task.status === "pending") ?? [];
  const revision =
    tasks?.filter((task) => task.status === "revision_needed") ?? [];
  const forReview = tasks?.filter((task) => task.status === "for_review") ?? [];
  // const completed = tasks?.filter((task) => task.status === "completed") ?? [];

  // Fresh dialog every time a different assignment needs a decision.
  useEffect(() => {
    setDecisionMode("choose");
    setDecisionReason("");
    setDecisionNext(NO_NEXT_TASK);
  }, [decisionTask?.id]);

  // One list for everything waiting on the employee: urgent first, then the
  // earliest due date, then the oldest task.
  const todo = useMemo(
    () =>
      [...revision, ...paused, ...pending].sort((a, b) => {
        const rank = (t: Task) => (t.status === "revision_needed" ? 0 : 1);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
        const aDue = a.due_date ? a.due_date.slice(0, 10) : "9999-12-31";
        const bDue = b.due_date ? b.due_date.slice(0, 10) : "9999-12-31";
        if (aDue !== bDue) return aDue < bDue ? -1 : 1;
        return a.id - b.id;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks],
  );

  // Task id -> name, so "Interrupted by Task #14" can show the real task.
  // Segments are included too, in case that task isn't in the open list.
  const taskNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const segment of segments)
      map.set(segment.task_id, segment.particulars);
    for (const task of tasks ?? []) map.set(task.id, task.particulars);
    return map;
  }, [tasks, segments]);

  // Elapsed work time only: nights and time after 5:30 PM are not counted.
  const liveSeconds = (task: Task) =>
    task.pending_decision
      ? task.worked_seconds
      : task.worked_seconds +
        (task.running_since
          ? workMsBetween(serverMs(task.running_since), nowMs) / 1000
          : 0);

  const workedToday = useMemo(() => {
    const dayStart = manilaDayStart(nowMs);
    return segments.reduce((sum, segment) => {
      const start = Math.max(serverMs(segment.start), dayStart);
      const end = segment.end ? serverMs(segment.end) : nowMs;
      return sum + workMsBetween(start, end) / 1000;
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, Math.floor(nowMs / 1000)]);

  // Returns true when the request succeeded, so callers can chain another
  // action (e.g. start the next task after a pause).
  async function act(
    task: Task,
    action: TaskAction,
    body?: object,
  ): Promise<boolean> {
    setBusyId(task.id);
    try {
      await readJson(
        await adminFetch(`/api/admin/my-tasks/${task.id}/${action}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        }),
      );
      // "complete" shows its own toast with an Undo button (see finishTask).
      if (action !== "complete") {
        toast.success(
          {
            start: "Task started.",
            pause: "Task paused.",
            progress: "Progress saved.",
            switch: "Switched task.",
            reopen: "Task reopened.",
            submit: "Submitted for review. Timer stopped.",
          }[action],
        );
      }
      if (action === "progress") setDraft(null);
      if (action === "progress" || action === "complete" || action === "submit")
        setRemarks("");
      if (action === "complete" || action === "reopen")
        setCompletedVersion((value) => value + 1);
      await load();
      return true;
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Something went wrong.",
      );
      await load();
      return false;
    } finally {
      setBusyId(null);
    }
  }

  // Auto-pause the running task once it's 5:30 PM or later.
  // Runs once per task per day. Note: this only works while the page is open,
  // so the server should also pause tasks at 5:30 PM (cron).
  // Manual: pinipindot ng employee ang "Pause all" button.
  async function pauseAll() {
    setPausingAll(true);
    try {
      const result = await readJson(
        await adminFetch("/api/admin/my-tasks/pause-all", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: afterCutoff ? "Paused at end of day" : "Paused all tasks",
          }),
        }),
      );
      toast.success(
        result.count > 0 ? "All tasks paused." : "No task is running.",
      );
      setDraft(null);
      await load();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Unable to pause tasks.",
      );
    } finally {
      setPausingAll(false);
    }
  }

  // Starting while something else is running pauses that one first,
  // so ask before doing it.
  async function finishTask(task: Task) {
    if (task.requires_review) {
      await act(task, "submit", { remarks: remarks.trim() || null });
      return;
    }
    const ok = await act(task, "complete", {
      remarks: remarks.trim() || null,
    });
    if (!ok) return;
    toast(
      (t) => (
        <span className="flex items-center gap-3 text-sm">
          Completed “{task.particulars}”.
          <button
            className="font-semibold text-blue-600 underline"
            onClick={() => {
              toast.dismiss(t.id);
              void act(task, "reopen");
            }}
            type="button"
          >
            Undo
          </button>
        </span>
      ),
      { duration: 10_000, icon: "✅" },
    );
  }
  function requestStart(task: Task) {
    if (isAfterCutoff(Date.now() + offset)) {
      toast.error("Work hours ended at 5:30 PM. Continue tomorrow morning.");
      return;
    }
    if (running && running.id !== task.id) setConfirmTask(task);
    else void act(task, "start");
  }

  function openProgressDialog(task: Task, mode: "pause" | "update") {
    // If the slider on the running card was already moved, start from there.
    const start = draft?.id === task.id ? draft.value : task.progress;
    setDialogValue(start);
    setDialogRemarks("");
    setNextTaskId(NO_NEXT_TASK);
    setProgressDialog({ task, mode });
  }

  async function submitProgressDialog() {
    if (!progressDialog) return;
    const { task, mode } = progressDialog;
    const body = {
      progress: dialogValue,
      remarks: dialogRemarks.trim() || null,
    };
    const next =
      mode === "pause" && nextTaskId !== NO_NEXT_TASK
        ? todo.find((t) => String(t.id) === nextTaskId)
        : undefined;

    setProgressDialog(null);
    setDraft(null);

    // One request: pause + start next. If it fails, nothing changes.
    if (next && !isAfterCutoff(Date.now() + offset)) {
      await act(task, "switch", { ...body, next_id: next.id });
      return;
    }

    await act(task, mode === "pause" ? "pause" : "progress", body);
  }

  // "Pause Task B" was clicked: ask what to do next (default = go back to Task A).
  function chooseDecisionPause() {
    const interruptedId = decisionTask?.pending_decision?.interrupted_task_id;
    const canResume =
      !afterCutoff &&
      interruptedId != null &&
      todo.some((t) => t.id === interruptedId);
    setDecisionNext(canResume ? String(interruptedId) : NO_NEXT_TASK);
    setDecisionMode("pause");
  }

  // Sends the decision. "start" keeps Task B running; "pause" pauses it and
  // optionally starts Task A (or another task) right after.
  async function submitDecision(decision: "start" | "pause") {
    if (!decisionTask) return;
    setDeciding(true);
    try {
      await readJson(
        await adminFetch(`/api/admin/my-tasks/${decisionTask.id}/decision`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            reason: decisionReason.trim() || null,
            resume_task_id:
              decision === "pause" && decisionNext !== NO_NEXT_TASK
                ? Number(decisionNext)
                : null,
          }),
        }),
      );
      toast.success(
        decision === "start"
          ? "New task started."
          : "New task saved for later.",
      );
      setDecisionMode("choose");
      setDecisionReason("");
      await load();
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Unable to save your decision.",
      );
      await load();
    } finally {
      setDeciding(false);
    }
  }

  const progressValue =
    running && draft?.id === running.id
      ? draft.value
      : (running?.progress ?? 0);
  const progressChanged =
    Boolean(running) && progressValue !== running?.progress;

  return (
    <div className="space-y-6 pb-8">
      <header className="rounded-3xl bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-6 text-white shadow-lg sm:px-9 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <ListChecks aria-hidden="true" className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {title}
              </h1>
              <p className="mt-1 text-sm text-white/80">
                {tasks === null
                  ? "Loading your tasks…"
                  : todo.length + (running ? 1 : 0) === 0
                    ? "You’re all caught up."
                    : `${todo.length + (running ? 1 : 0)} open ${
                        todo.length + (running ? 1 : 0) === 1 ? "task" : "tasks"
                      }${running ? " · 1 running" : ""}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <Button
                className="bg-white font-semibold text-sky-700 shadow-md hover:bg-sky-50"
                onClick={openCreate}
                type="button"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add task
              </Button>
            )}
            {/* PUSH: turn browser notifications on/off for this device */}
            <TaskPushToggle />
            {running && (
              <Button
                className="bg-amber-500 font-semibold text-white shadow-md hover:bg-amber-600"
                disabled={pausingAll}
                onClick={() => void pauseAll()}
                type="button"
              >
                {pausingAll ? (
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="mr-2 h-4 w-4" />
                )}
                Pause all
              </Button>
            )}
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
          </div>
        </div>
      </header>

      {error && (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {afterCutoff && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          {running
            ? "Work hours ended at 5:30 PM. Your task is still running. Press “Pause all” to end your day. Time after 5:30 PM is not counted."
            : "Work hours ended at 5:30 PM. You can resume your tasks tomorrow morning."}
        </p>
      )}

      {tasks === null ? (
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <>
          {/* Current task */}
          {running ? (
            <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm ring-1 ring-emerald-100 sm:p-6">
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                        Working on
                      </span>
                      <PriorityBadge priority={running.priority} />
                    </div>
                    {running.project && (
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                        {running.project}
                      </p>
                    )}
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">
                      {running.particulars}
                    </h2>
                    {running.details && (
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-500">
                        {running.details}
                      </p>
                    )}
                    {assignedLabel(running) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {assignedLabel(running)}
                        {running.created_at &&
                          ` · ${fmtStamp(running.created_at)}`}
                      </p>
                    )}
                    {running.last_remark && (
                      <p className="mt-1 whitespace-pre-line text-xs italic text-slate-500">
                        Latest: “{running.last_remark}”
                      </p>
                    )}
                    <button
                      className="mt-1.5 text-xs font-medium text-blue-700 hover:underline"
                      onClick={() => setHistoryId(running.id)}
                      type="button"
                    >
                      View updates
                    </button>
                  </div>
                  <div className="text-right">
                    {hideTimer ? (
                      <>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Date started
                        </p>
                        <p className="text-base font-semibold text-slate-900">
                          {fmtStamp(
                            running.started_at ?? running.running_since,
                          )}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-4xl">
                          {fmtClock(liveSeconds(running))}
                        </p>
                        {running.estimated_minutes && (
                          <p className="text-xs text-slate-500">
                            Estimate {fmtShort(running.estimated_minutes * 60)}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">Progress</span>
                    <span className="tabular-nums text-slate-500">
                      {progressValue}%
                    </span>
                  </div>
                  <ProgressBar
                    urgent={running.priority === "urgent"}
                    value={progressValue}
                  />
                  <input
                    aria-label="Update progress"
                    className="mt-3 w-full accent-blue-600"
                    max={100}
                    min={0}
                    onChange={(event) =>
                      setDraft({
                        id: running.id,
                        value: Number(event.target.value),
                      })
                    }
                    step={5}
                    type="range"
                    value={progressValue}
                  />
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
                    <textarea
                      aria-label="What did you finish?"
                      className="min-h-[96px] min-w-0 flex-1 resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      maxLength={20000}
                      onChange={(event) => setRemarks(event.target.value)}
                      placeholder="What did you finish? (optional)"
                      rows={4}
                      value={remarks}
                    />
                    {(progressChanged || remarks.trim() !== "") && (
                      <Button
                        disabled={busyId === running.id}
                        onClick={() =>
                          void act(running, "progress", {
                            progress: progressValue,
                            remarks: remarks.trim() || null,
                          })
                        }
                        size="sm"
                        type="button"
                      >
                        {progressChanged ? "Save progress" : "Save note"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <Button
                    disabled={busyId === running.id}
                    onClick={() => openProgressDialog(running, "pause")}
                    type="button"
                    variant="outline"
                  >
                    {busyId === running.id ? (
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Pause className="mr-2 h-4 w-4" />
                    )}
                    Pause
                  </Button>
                  <Button
                    className={
                      running.requires_review
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }
                    disabled={busyId === running.id}
                    onClick={() => setCompleteTarget(running)}
                    type="button"
                  >
                    {running.requires_review ? (
                      <Send className="mr-2 h-4 w-4" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {running.requires_review ? "Submit for review" : "Complete"}
                  </Button>
                  {canReassign(running) && (
                    <Button
                      disabled={busyId === running.id}
                      onClick={() => void openAssign(running)}
                      title="Assign this task to someone else. Your timer on it stops."
                      type="button"
                      variant="outline"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Assign to
                    </Button>
                  )}
                  {canModify(running) && (
                    <>
                      <Button
                        disabled={busyId === running.id}
                        onClick={() => openEdit(running)}
                        type="button"
                        variant="outline"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        disabled
                        title="Pause or complete this task first, then delete it."
                        type="button"
                        variant="outline"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-4 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">
                No task is running.
              </span>{" "}
              {afterCutoff
                ? todo.length > 0
                  ? "Pick one tomorrow morning to continue."
                  : "You have no open tasks right now."
                : todo.length > 0
                  ? hideTimer
                    ? "Pick one below to start it right away."
                    : "Pick one below and your timer starts right away."
                  : canCreate
                    ? "You have no open tasks. Use Add task to log what you’re working on."
                    : "You have no open tasks right now."}
            </p>
          )}

          {/* To do */}
          {todo.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                To do{" "}
                <span className="font-normal text-slate-500">
                  · {todo.length}
                </span>
              </h2>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {todo.map((task) => {
                  const overdue =
                    !!task.due_date && task.due_date.slice(0, 10) < today;
                  return (
                    <div
                      className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4"
                      key={task.id}
                    >
                      <div className="min-w-0 flex-1 basis-64">
                        {task.project && (
                          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                            {task.project}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {task.particulars}
                          </p>
                          <PriorityBadge priority={task.priority} />
                          <StatusChip status={task.status} />
                        </div>
                        {task.details && (
                          <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-slate-500">
                            {task.details}
                          </p>
                        )}
                        {task.last_remark && (
                          <p
                            className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs italic text-slate-500"
                            title={task.last_remark}
                          >
                            Latest: “{task.last_remark}”
                          </p>
                        )}
                        {task.status === "revision_needed" &&
                          task.last_remark && (
                            <p className="mt-1.5 whitespace-pre-line rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                              <span className="font-semibold">
                                Reviewer feedback:
                              </span>{" "}
                              {task.last_remark}
                            </p>
                          )}
                        <p className="mt-1 text-xs text-slate-500">
                          {task.due_date && (
                            <span
                              className={
                                overdue ? "font-semibold text-rose-600" : ""
                              }
                            >
                              Due {fmtDue(task.due_date)}
                              {overdue && " · overdue"}
                            </span>
                          )}
                          {task.due_date && " · "}
                          {hideTimer ? (
                            <>
                              Started{" "}
                              {fmtStamp(task.started_at ?? task.running_since)}
                            </>
                          ) : (
                            <>
                              <span className="tabular-nums">
                                {task.status === "paused" ||
                                task.status === "revision_needed"
                                  ? fmtClock(liveSeconds(task))
                                  : fmtShort(liveSeconds(task))}
                              </span>{" "}
                              elapsed
                              {task.estimated_minutes &&
                                ` of ${fmtShort(task.estimated_minutes * 60)}`}
                              {task.segments > 1 &&
                                ` · ${task.segments} sessions`}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex w-24 items-center gap-2">
                        <ProgressBar
                          urgent={task.priority === "urgent"}
                          value={task.progress}
                        />
                        <span className="w-9 text-right text-xs tabular-nums text-slate-500">
                          {task.progress}%
                        </span>
                      </div>
                      <Button
                        disabled={busyId === task.id}
                        onClick={() => openProgressDialog(task, "update")}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Update %
                      </Button>
                      {canModify(task) && (
                        <>
                          <Button
                            aria-label="Edit task"
                            disabled={busyId === task.id}
                            onClick={() => openEdit(task)}
                            size="sm"
                            title="Edit"
                            type="button"
                            variant="outline"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            aria-label="Delete task"
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            disabled={busyId === task.id}
                            onClick={() => setDeleteTarget(task)}
                            size="sm"
                            title="Delete"
                            type="button"
                            variant="outline"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {canReassign(task) && (
                        <Button
                          disabled={busyId === task.id}
                          onClick={() => void openAssign(task)}
                          size="sm"
                          title="Assign this to someone else"
                          type="button"
                          variant="outline"
                        >
                          <UserPlus className="mr-1.5 h-4 w-4" />
                          Assign to
                        </Button>
                      )}

                      {/* BAGO: i-complete ang paused task nang hindi nagre-resume */}
                      {task.status === "paused" && (
                        <Button
                          className={
                            task.requires_review
                              ? "bg-indigo-600 text-white hover:bg-indigo-700"
                              : "bg-emerald-600 text-white hover:bg-emerald-700"
                          }
                          disabled={busyId === task.id}
                          onClick={() => setCompleteTarget(task)}
                          size="sm"
                          type="button"
                        >
                          {task.requires_review ? (
                            <Send className="mr-1.5 h-4 w-4" />
                          ) : (
                            <Check className="mr-1.5 h-4 w-4" />
                          )}
                          {task.requires_review ? "Submit" : "Complete"}
                        </Button>
                      )}

                      <Button
                        className="bg-blue-600 text-white hover:bg-blue-700"
                        disabled={busyId === task.id || afterCutoff}
                        onClick={() => requestStart(task)}
                        size="sm"
                        title={
                          afterCutoff
                            ? "Work hours ended at 5:30 PM. Continue tomorrow morning."
                            : undefined
                        }
                        type="button"
                      >
                        {busyId === task.id ? (
                          <Loader className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-1.5 h-4 w-4" />
                        )}
                        {task.status === "paused" ||
                        task.status === "revision_needed"
                          ? "Resume"
                          : "Start"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {forReview.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Waiting for review{" "}
                <span className="font-normal text-slate-500">
                  · {forReview.length}
                </span>
              </h2>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {forReview.map((task) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    key={task.id}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {task.particulars}
                      </p>
                      <p className="text-xs text-slate-500">
                        Submitted {fmtStamp(task.submitted_at)}
                        {task.assigned_by_name &&
                          ` · Reviewer: ${task.assigned_by_name}`}
                        {!hideTimer &&
                          ` · ${fmtShort(task.worked_seconds)} worked`}
                      </p>
                    </div>
                    <StatusChip status="for_review" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Today: summary + timeline */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Today’s timeline
                </h2>
                <p className="text-sm text-slate-500">
                  A task that got interrupted is split, with the urgent task in
                  between.
                </p>
              </div>
              {!hideTimer && (
                <p className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
                  <Clock3 aria-hidden="true" className="h-4 w-4" />
                  Worked today
                  <span className="font-semibold tabular-nums text-slate-900">
                    {fmtShort(workedToday)}
                  </span>
                </p>
              )}
            </div>
            <TimelineBar
              hideTimer={hideTimer}
              names={taskNames}
              nowMs={nowMs}
              segments={segments}
            />
          </section>

          <CompletedCalendar hideTimer={hideTimer} version={completedVersion} />
        </>
      )}

      {/* New assignment: the employee must choose Start or Pause for Task B.
          Can't be closed with Esc, the X or an outside click. */}
      <Dialog
        onOpenChange={() => {
          /* intentionally empty: a decision is required */
        }}
        open={Boolean(decisionTask)}
      >
        <DialogContent
          className="w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border-slate-200 bg-white [&>button]:hidden"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="text-left">
            <DialogTitle>New task assigned to you</DialogTitle>
            <DialogDescription className="leading-relaxed">
              {decisionTask?.assigned_by_name
                ? `${decisionTask.assigned_by_name} assigned `
                : "You were assigned "}
              <span className="font-semibold text-slate-900">
                “{decisionTask?.particulars}”
              </span>
              .{" "}
              {decisionTask?.pending_decision?.interrupted_task_name ? (
                <>
                  <span className="font-semibold text-slate-900">
                    “{decisionTask.pending_decision.interrupted_task_name}”
                  </span>{" "}
                  was paused.
                </>
              ) : (
                "Your previous task was paused."
              )}{" "}
              The timer for the new task has not started yet. Choose how to
              handle it.
            </DialogDescription>
          </DialogHeader>

          {/* Reason is shared by both choices (Start Task B / Pause Task B). */}
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-slate-900"
              htmlFor="decision-reason"
            >
              Reason{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              className="min-h-[80px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
              disabled={deciding}
              id="decision-reason"
              maxLength={255}
              onChange={(event) => setDecisionReason(event.target.value)}
              placeholder="Why are you choosing this? (optional)"
              value={decisionReason}
            />
          </div>

          {decisionMode === "choose" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 text-left transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
                disabled={deciding}
                onClick={() => void submitDecision("start")}
                type="button"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
                  {deciding ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </span>
                <span className="mt-3 block line-clamp-2 break-words text-base font-semibold text-slate-900">
                  Start “{decisionName}”
                </span>
                <span className="mt-1 block text-xs text-slate-600">
                  Start the timer on the newly assigned task.
                </span>
              </button>
              <button
                className="rounded-xl border border-orange-300 bg-orange-50/40 p-4 text-left transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-60"
                disabled={deciding}
                onClick={chooseDecisionPause}
                type="button"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white">
                  <Pause className="h-4 w-4" />
                </span>
                <span className="mt-3 block line-clamp-2 break-words text-base font-semibold text-slate-900">
                  Not now
                </span>
                <span className="mt-1 block text-xs text-slate-600">
                  Keep “{decisionName}” unstarted. Return to “{interruptedName}”
                  or select another task.
                </span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-900">
                  Continue with{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <Select
                  disabled={afterCutoff}
                  onValueChange={setDecisionNext}
                  value={decisionNext}
                >
                  <SelectTrigger aria-label="Continue with">
                    <SelectValue placeholder="Choose a task" />
                  </SelectTrigger>
                  <SelectContent
                    className={SELECT_CONTENT_CLASS}
                    position="popper"
                  >
                    <SelectItem value={NO_NEXT_TASK}>
                      None, I’ll pick later
                    </SelectItem>
                    {todo
                      .filter((t) => t.id !== decisionTask?.id)
                      .map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.particulars}
                          {t.id ===
                          decisionTask?.pending_decision?.interrupted_task_id
                            ? " · Interrupted"
                            : ""}
                          {t.priority === "urgent" ? " · Urgent" : ""}
                          {t.status === "paused"
                            ? ` · Paused (${t.progress}%)`
                            : ""}
                          {t.status === "revision_needed"
                            ? ` · Revision (${t.progress}%)`
                            : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {afterCutoff && (
                  <p className="mt-1 text-xs text-slate-500">
                    Work hours ended at 5:30 PM. You can continue tomorrow
                    morning.
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button
                  disabled={deciding}
                  onClick={() => setDecisionMode("choose")}
                  type="button"
                  variant="outline"
                >
                  Back
                </Button>
                <Button
                  className="max-w-full truncate bg-orange-500 text-white hover:bg-orange-600"
                  disabled={deciding}
                  onClick={() => void submitDecision("pause")}
                  type="button"
                >
                  {deciding ? (
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Pause className="mr-2 h-4 w-4" />
                  )}
                  {decisionNext !== NO_NEXT_TASK && !afterCutoff
                    ? "Continue with selected task"
                    : `Keep “${decisionName}” for later`}
                </Button>
              </DialogFooter>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Your choice and the time you made it are saved.
          </p>
        </DialogContent>
      </Dialog>

      {/* Set progress (before pausing, or on a task that isn't running) */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setProgressDialog(null);
        }}
        open={Boolean(progressDialog)}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>
              {progressDialog?.mode === "pause"
                ? "Pause this task?"
                : "Update progress"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {progressDialog?.mode === "pause"
                ? `Set how far along “${progressDialog.task.particulars}” is before you switch. ${
                    hideTimer
                      ? ""
                      : "Its timer keeps running until you complete it. "
                  }You can also pick what to work on next.`
                : `How much of “${progressDialog?.task.particulars ?? ""}” is done?`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Progress</span>
              <span className="text-lg font-semibold tabular-nums text-slate-900">
                {dialogValue}%
              </span>
            </div>
            <ProgressBar
              urgent={progressDialog?.task.priority === "urgent"}
              value={dialogValue}
            />
            <input
              aria-label="Progress percent"
              className="w-full accent-blue-600"
              max={100}
              min={0}
              onChange={(event) => setDialogValue(Number(event.target.value))}
              step={5}
              type="range"
              value={dialogValue}
            />
            <textarea
              aria-label="What did you finish?"
              className="min-h-[110px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              maxLength={20000}
              onChange={(event) => setDialogRemarks(event.target.value)}
              placeholder="What did you finish? (optional)"
              rows={5}
              value={dialogRemarks}
            />

            {/* Next task: only when pausing (and not after 5:30 PM) */}
            {progressDialog?.mode === "pause" && !afterCutoff && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-900">
                  Next task{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <Select onValueChange={setNextTaskId} value={nextTaskId}>
                  <SelectTrigger aria-label="Next task">
                    <SelectValue placeholder="Choose your next task" />
                  </SelectTrigger>
                  <SelectContent
                    className={SELECT_CONTENT_CLASS}
                    position="popper"
                  >
                    <SelectItem value={NO_NEXT_TASK}>
                      None, just pause
                    </SelectItem>
                    {todo
                      .filter((t) => t.id !== progressDialog.task.id)
                      .map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.particulars}
                          {t.priority === "urgent" ? " · Urgent" : ""}
                          {t.status === "paused"
                            ? ` · Paused (${t.progress}%)`
                            : ""}
                          {t.status === "revision_needed"
                            ? ` · Revision (${t.progress}%)`
                            : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              onClick={() => setProgressDialog(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={() => void submitProgressDialog()} type="button">
              {progressDialog?.mode === "pause"
                ? nextTaskId !== NO_NEXT_TASK && !afterCutoff
                  ? "Pause and start next"
                  : "Pause task"
                : "Save progress"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add or edit your own task */}
      <Dialog
        onOpenChange={(open) => {
          if (saving && !open) return;
          setFormOpen(open);
        }}
        open={formOpen}
      >
        <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-2xl sm:w-full">
          <DialogHeader className="shrink-0 border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-indigo-50 px-5 py-5 pr-12 text-left sm:px-6">
            <DialogTitle className="text-lg sm:text-xl">
              {editingId !== null ? "Edit task" : "Add a task"}
            </DialogTitle>
            <DialogDescription>
              {editingId !== null
                ? "Fix any details you got wrong. Your progress and timer are not affected."
                : "Add a task to your To do list."}
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
              <label
                className="mb-1.5 block text-sm font-medium text-slate-900"
                htmlFor="my-task-project"
              >
                Project{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Input
                id="my-task-project"
                maxLength={255}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    project: event.target.value,
                  }))
                }
                placeholder="Client portal"
                value={form.project}
              />
            </div>

            <div>
              <label
                className="mb-1.5 block text-sm font-medium text-slate-900"
                htmlFor="my-task-particulars"
              >
                What are you working on?
              </label>
              <Input
                id="my-task-particulars"
                maxLength={255}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    particulars: event.target.value,
                  }))
                }
                placeholder="Fix login page bug"
                value={form.particulars}
              />
            </div>

            <div>
              <label
                className="mb-1.5 block text-sm font-medium text-slate-900"
                htmlFor="my-task-details"
              >
                Details{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                className="min-h-[88px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                id="my-task-details"
                maxLength={20000}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    details: event.target.value,
                  }))
                }
                value={form.details}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-900">
                  Priority
                </label>
                <Select
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      priority: value === "urgent" ? "urgent" : "normal",
                    }))
                  }
                  value={form.priority}
                >
                  <SelectTrigger aria-label="Priority">
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
                  htmlFor="my-task-due"
                >
                  Due date
                </label>
                <Input
                  id="my-task-due"
                  min={editingId === null ? today : undefined}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      due_date: event.target.value,
                    }))
                  }
                  type="date"
                  value={form.due_date}
                />
              </div>
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-slate-900"
                  htmlFor="my-task-hours"
                >
                  Estimate
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    aria-label="Estimate hours"
                    id="my-task-hours"
                    inputMode="numeric"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        hours: event.target.value.replace(/\D/g, ""),
                      }))
                    }
                    placeholder="0"
                    value={form.hours}
                  />
                  <span className="text-sm text-slate-500">h</span>
                  <Input
                    aria-label="Estimate minutes"
                    inputMode="numeric"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        minutes: event.target.value.replace(/\D/g, ""),
                      }))
                    }
                    placeholder="30"
                    value={form.minutes}
                  />
                  <span className="text-sm text-slate-500">m</span>
                </div>
              </div>
            </div>

            {/* Assigned by: optional. Nakatago kung walang pwedeng mag-assign. */}
            {editingId === null && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-900">
                  Assigned by{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <Select
                  disabled={assigners === null || assigners.length === 0}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      assigned_by_id: value,
                    }))
                  }
                  value={form.assigned_by_id}
                >
                  <SelectTrigger aria-label="Assigned by">
                    <SelectValue
                      placeholder={
                        assigners === null
                          ? "Loading…"
                          : assigners.length === 0
                            ? "No one can assign to you"
                            : "Nobody"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent
                    className={SELECT_CONTENT_CLASS}
                    position="popper"
                  >
                    <SelectItem value={NO_ASSIGNER}>
                      None, I added this myself
                    </SelectItem>
                    {(assigners ?? []).map((person) => (
                      <SelectItem key={person.id} value={String(person.id)}>
                        {person.name}
                        {person.position ? ` · ${person.position}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Only when adding. Editing never starts or stops the timer. */}
            {editingId === null && (
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                <input
                  checked={form.startNow && !afterCutoff}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                  disabled={afterCutoff}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startNow: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>
                  <span className="font-medium text-slate-900">
                    Start it right away
                  </span>
                  <span className="block text-xs text-slate-500">
                    {afterCutoff
                      ? "Work hours ended at 5:30 PM. You can start it tomorrow morning."
                      : running
                        ? `Your current task “${running.particulars}” will be paused.`
                        : hideTimer
                          ? "The task starts as soon as you save."
                          : "Your timer begins as soon as you save."}
                  </span>
                </span>
              </label>
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
              className="bg-gradient-to-r from-sky-600 to-indigo-600 text-white hover:from-sky-700 hover:to-indigo-700"
              disabled={saving}
              onClick={() => void saveTask()}
              type="button"
            >
              {saving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              {editingId !== null
                ? "Save changes"
                : form.startNow && !afterCutoff
                  ? "Add and start"
                  : "Add task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm: starting a task pauses the running one */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setConfirmTask(null);
        }}
        open={Boolean(confirmTask)}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>Pause your current task?</DialogTitle>
            <DialogDescription className="leading-relaxed">
              “{running?.particulars}” will be paused (its progress stays
              {hideTimer ? "" : ", but its timer keeps running"}). “
              {confirmTask?.particulars}” starts right away, and you can resume
              the first one later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              onClick={() => setConfirmTask(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!confirmTask) return;
                const next = confirmTask;
                setConfirmTask(null);
                void act(next, "start");
              }}
              type="button"
            >
              Pause and start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: delete a task */}
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
              “{deleteTarget?.particulars}” will be removed from your list. This
              can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={deleting}
              onClick={() => void confirmDelete()}
              type="button"
            >
              {deleting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Assign this task to someone else (works even while it is running) */}
      <Dialog
        onOpenChange={(open) => {
          if (!open && !assigning) setAssignTask(null);
        }}
        open={Boolean(assignTask)}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>Assign this task to</DialogTitle>
            <DialogDescription className="leading-relaxed">
              “{assignTask?.particulars}” will move to the person you pick and
              will leave your list.
              {assignTask?.status === "in_progress" &&
                (hideTimer
                  ? " It is running now, so it stops on your side."
                  : " It is running now, so your timer on it stops and the time you logged is kept.")}{" "}
              The one who first assigned it can still see it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {assignError && (
              <p
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
                role="alert"
              >
                {assignError}
              </p>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-900">
                Assign to
              </label>
              <Select
                disabled={assignTargets === null}
                onValueChange={setAssignTo}
                value={assignTo}
              >
                <SelectTrigger aria-label="Assign to">
                  <SelectValue
                    placeholder={
                      assignTargets === null ? "Loading…" : "Select a person"
                    }
                  />
                </SelectTrigger>
                <SelectContent
                  className={SELECT_CONTENT_CLASS}
                  position="popper"
                >
                  {(assignTargets ?? []).map((person) => (
                    <SelectItem
                      disabled={!person.can_receive}
                      key={person.id}
                      value={String(person.id)}
                    >
                      {person.name} · {person.id_number}
                      {!person.can_receive &&
                        ` — ${person.reason ?? "Can't receive tasks"}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                className="mb-1.5 block text-sm font-medium text-slate-900"
                htmlFor="assign-note"
              >
                Note{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                className="min-h-[88px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                id="assign-note"
                maxLength={2000}
                onChange={(e) => setAssignNote(e.target.value)}
                placeholder="Anything they should know?"
                value={assignNote}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              disabled={assigning}
              onClick={() => setAssignTask(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={assigning || !assignTo}
              onClick={() => void submitAssign()}
              type="button"
            >
              {assigning ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Assign task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: complete a task */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setCompleteTarget(null);
        }}
        open={Boolean(completeTarget)}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>
              {completeTarget?.requires_review
                ? "Submit for review?"
                : "Mark this task as complete?"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {completeTarget?.requires_review ? (
                <>
                  “{completeTarget.particulars}” goes to{" "}
                  {completeTarget.assigned_by_name ?? "your reviewer"}
                  {hideTimer || completeTarget.status !== "in_progress"
                    ? ""
                    : " and your timer stops"}
                  . If changes are needed, it returns to your To do list and you
                  press Resume to continue.
                </>
              ) : (
                <>
                  “{completeTarget?.particulars}” will be set to 100%
                  {hideTimer || completeTarget?.status !== "in_progress"
                    ? ""
                    : " and its timer will stop"}
                  . You can undo it for a few minutes right after.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              onClick={() => setCompleteTarget(null)}
              type="button"
              variant="outline"
            >
              Not yet
            </Button>
            <Button
              className={
                completeTarget?.requires_review
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }
              onClick={() => {
                if (!completeTarget) return;
                const target = completeTarget;
                setCompleteTarget(null);
                void finishTask(target);
              }}
              type="button"
            >
              {completeTarget?.requires_review ? (
                <Send className="mr-2 h-4 w-4" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {completeTarget?.requires_review ? "Submit" : "Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (!open) setHistoryId(null);
        }}
        open={Boolean(historyTask)}
      >
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-lg flex-col rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>Task details</DialogTitle>
            <DialogDescription>
              {historyTask
                ? (assignedLabel(historyTask) ?? "Task history")
                : ""}
              {historyTask?.created_at &&
                ` · ${fmtStamp(historyTask.created_at)}`}
            </DialogDescription>
          </DialogHeader>
          {historyTask && (
            <div className="min-w-0 space-y-1 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <p className="whitespace-pre-line break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                {historyTask.particulars}
              </p>
              {historyTask.details && (
                <p className="whitespace-pre-line break-words text-sm text-slate-600 [overflow-wrap:anywhere]">
                  {historyTask.details}
                </p>
              )}
            </div>
          )}
          <p className="text-sm font-semibold text-slate-900">
            Progress updates
          </p>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {historyTask && (historyTask.updates ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                No updates yet.
              </p>
            )}
            {historyTask?.updates?.map((u, i) => (
              <div
                className="min-w-0 rounded-xl border border-slate-200 px-4 py-3"
                key={`${u.created_at}-${i}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold tabular-nums">
                    {u.progress}%
                  </span>
                  <span className="text-xs text-slate-500">
                    {fmtStamp(u.created_at)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-700 [overflow-wrap:anywhere]">
                  {u.remarks || (
                    <span className="text-slate-400">No remarks</span>
                  )}
                </p>
                {u.updated_by_name && (
                  <p className="mt-1 text-xs text-slate-500">
                    by {u.updated_by_name}
                  </p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setHistoryId(null)}
              type="button"
              variant="outline"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
