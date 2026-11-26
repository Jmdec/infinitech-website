"use client";
// components/tasks/CalendarDayTasks.tsx
//
// For the General Calendar:
//  - useTaskDayCounts(): per-day counts for one month (one request, cached).
//  - DayTasksCard: the people + tasks of ONE day (one request, cached),
//    grouped per person, with search, status filter and a details dialog.
//  - DayTasksDialog: the same card inside a popup, opened from the calendar chip.

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, Loader2, Search } from "lucide-react";
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
import { adminFetch } from "@/lib/admin-fetch";

export type DayCount = { tasks: number; people: number; names?: string[] };

type Status = "pending" | "in_progress" | "paused" | "completed" | "cancelled";

type CalTask = {
  id: number;
  particulars: string;
  details: string | null;
  priority: "normal" | "urgent";
  status: Status;
  progress: number;
  estimated_minutes: number | null;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  worked_seconds: number;
  day_seconds: number;
  last_remark: string | null;
  updates: {
    progress: number;
    remarks: string | null;
    created_at: string;
    updated_by_name: string | null;
  }[];
};

type Person = {
  employee_id: number;
  name: string;
  number: string;
  tasks: CalTask[];
};

const MANILA_TZ = "Asia/Manila";
const TTL = 60_000; // reuse a loaded day/month for a minute, then refetch

const STATUS: Record<Status, { label: string; dot: string; chip: string }> = {
  in_progress: {
    label: "Ongoing",
    dot: "bg-yellow-400",
    chip: "bg-yellow-100 text-yellow-800",
  },
  paused: {
    label: "Paused",
    dot: "bg-orange-400",
    chip: "bg-orange-50 text-orange-800",
  },
  pending: {
    label: "Pending",
    dot: "bg-slate-300",
    chip: "bg-slate-100 text-slate-700",
  },
  completed: {
    label: "Done",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-800",
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-rose-300",
    chip: "bg-rose-50 text-rose-800",
  },
};

async function getJson(url: string) {
  const response = await adminFetch(url, { cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Unable to load tasks.");
  return result;
}

const fmtShort = (seconds: number) => {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

const fmtStamp = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        timeZone: MANILA_TZ,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

/* ── per-day counts for a month ── */
export function useTaskDayCounts(month: string, enabled: boolean) {
  const [counts, setCounts] = useState<Record<string, DayCount>>({});
  const cache = useRef(
    new Map<string, { at: number; data: Record<string, DayCount> }>(),
  );

  useEffect(() => {
    if (!enabled) return;
    const hit = cache.current.get(month);
    if (hit && Date.now() - hit.at < TTL) {
      setCounts(hit.data);
      return;
    }

    let active = true;
    (async () => {
      try {
        const result = await getJson(
          `/api/admin/task-management/calendar/summary?month=${month}`,
        );
        if (!active) return;
        const data = result.data ?? {};
        cache.current.set(month, { at: Date.now(), data });
        setCounts(data);
      } catch {
        if (active) setCounts({});
      }
    })();
    return () => {
      active = false;
    };
  }, [month, enabled]);

  return counts;
}

/* ── the side card for one day ── */
export function DayTasksCard({ date }: { date: string }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [openTask, setOpenTask] = useState<{
    task: CalTask;
    person: Person;
  } | null>(null);
  const cache = useRef(new Map<string, { at: number; data: Person[] }>());

  useEffect(() => {
    // Few people: show everyone expanded. Many: start collapsed.
    const apply = (data: Person[]) => {
      setPeople(data);
      setOpen(new Set(data.length <= 3 ? data.map((p) => p.employee_id) : []));
    };

    const hit = cache.current.get(date);
    if (hit && Date.now() - hit.at < TTL) {
      apply(hit.data);
      setError("");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");
    setPeople([]);
    (async () => {
      try {
        const result = await getJson(
          `/api/admin/task-management/calendar/day?date=${date}`,
        );
        if (!active) return;
        const data: Person[] = result.data ?? [];
        cache.current.set(date, { at: Date.now(), data });
        apply(data);
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error ? failure.message : "Unable to load.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [date]);

  const searching = query.trim() !== "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .map((person) => {
        const personMatch =
          !q ||
          person.name.toLowerCase().includes(q) ||
          person.number.toLowerCase().includes(q);
        return {
          ...person,
          tasks: person.tasks.filter(
            (task) =>
              (status === "all" || task.status === status) &&
              (personMatch || task.particulars.toLowerCase().includes(q)),
          ),
        };
      })
      .filter((person) => person.tasks.length > 0);
  }, [people, query, status]);

  const totalTasks = people.reduce((sum, p) => sum + p.tasks.length, 0);

  const toggle = (id: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">Tasks</h2>
          <p className="text-xs text-slate-500">
            {loading
              ? "Loading…"
              : totalTasks === 0
                ? "No tasks worked on this day."
                : `${totalTasks} ${totalTasks === 1 ? "task" : "tasks"} · ${people.length} ${people.length === 1 ? "person" : "people"}`}
          </p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-cyan-700" />}
      </div>

      {error && (
        <p
          className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {people.length > 0 && (
        <>
          <div className="mt-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                aria-label="Find a person or task"
                className="h-9 pl-8 text-sm"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a name or task"
                value={query}
              />
            </div>
            <select
              aria-label="Filter by status"
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="all">All</option>
              <option value="in_progress">Ongoing</option>
              <option value="paused">Paused</option>
              <option value="pending">Pending</option>
              <option value="completed">Done</option>
            </select>
          </div>

          <div className="mt-3 max-h-[420px] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {filtered.length === 0 && (
              <p className="p-4 text-center text-sm text-slate-500">
                No match.
              </p>
            )}
            {filtered.map((person) => {
              const isOpen = searching || open.has(person.employee_id);
              return (
                <div key={person.employee_id}>
                  <button
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600"
                    onClick={() => toggle(person.employee_id)}
                    type="button"
                  >
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                        isOpen ? "" : "-rotate-90"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {person.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {person.number}
                      </span>
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                      {person.tasks.length}
                    </span>
                  </button>

                  {isOpen && (
                    <ul className="min-w-0 space-y-1 bg-slate-50/60 px-2 pb-2">
                      {person.tasks.map((task) => (
                        <li key={task.id} className="min-w-0">
                          <button
                            className="flex w-full min-w-0 items-start gap-2 rounded-lg bg-white px-2.5 py-2 text-left ring-1 ring-slate-200 transition hover:ring-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
                            onClick={() => setOpenTask({ task, person })}
                            type="button"
                          >
                            <span
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS[task.status].dot}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-slate-900">
                                {task.particulars}
                                {task.priority === "urgent" && (
                                  <span className="ml-1.5 text-xs font-semibold text-rose-600">
                                    Urgent
                                  </span>
                                )}
                              </span>
                              <span className="block text-xs tabular-nums text-slate-500">
                                {STATUS[task.status].label}
                                {task.day_seconds > 0 &&
                                  ` · ${fmtShort(task.day_seconds)} that day`}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Task details */}
      <Dialog
        onOpenChange={(value) => {
          if (!value) setOpenTask(null);
        }}
        open={Boolean(openTask)}
      >
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-lg flex-col rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>Task details</DialogTitle>
            <DialogDescription>
              {openTask
                ? `${openTask.person.name} · ${openTask.person.number}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {openTask && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden">
              <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <p className="whitespace-pre-line break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                  {openTask.task.particulars}
                </p>
                {openTask.task.details && (
                  <p className="whitespace-pre-line break-words text-sm text-slate-600 [overflow-wrap:anywhere]">
                    {openTask.task.details}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${STATUS[openTask.task.status].chip}`}
                  >
                    {STATUS[openTask.task.status].label} ·{" "}
                    {openTask.task.progress}%
                  </span>
                  {openTask.task.priority === "urgent" && (
                    <span className="font-semibold text-rose-700">Urgent</span>
                  )}
                  <span>Started {fmtStamp(openTask.task.started_at)}</span>
                  {openTask.task.completed_at && (
                    <span>Ended {fmtStamp(openTask.task.completed_at)}</span>
                  )}
                  <span className="tabular-nums">
                    That day {fmtShort(openTask.task.day_seconds)}
                  </span>
                  {openTask.task.estimated_minutes && (
                    <span>
                      Estimate {fmtShort(openTask.task.estimated_minutes * 60)}
                    </span>
                  )}
                  {openTask.task.due_date && (
                    <span>
                      Due{" "}
                      {format(
                        new Date(
                          `${openTask.task.due_date.slice(0, 10)}T00:00:00`,
                        ),
                        "MMM d",
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">
                  Notes & progress updates
                </p>
                {openTask.task.updates.length === 0 && (
                  <p className="py-4 text-center text-sm text-slate-500">
                    No notes were saved for this task.
                  </p>
                )}
                <div className="space-y-2">
                  {openTask.task.updates.map((update, index) => (
                    <div
                      className="min-w-0 overflow-hidden rounded-xl border border-slate-200 px-4 py-3"
                      key={`${update.created_at}-${index}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {update.progress}%
                        </span>
                        <span className="text-xs text-slate-500">
                          {fmtStamp(update.created_at)}
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
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setOpenTask(null)}
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

/* ── popup version: same list, opened from the calendar chip ── */
export function DayTasksDialog({
  date,
  open,
  onOpenChange,
}: {
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto overflow-x-hidden sm:max-w-xl">
        <DialogHeader className="text-left">
          <DialogTitle>
            Tasks · {format(new Date(`${date}T00:00:00`), "EEEE, MMM d")}
          </DialogTitle>
          <DialogDescription>
            Who worked on what that day. Click a task for its details.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0">{open && <DayTasksCard date={date} />}</div>
      </DialogContent>
    </Dialog>
  );
}
