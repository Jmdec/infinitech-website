"use client";
// components/tasks/CompletedCalendar.tsx
//
// Completed tasks for any month/year.
//  - Per year: one request for the per-day counts (small).
//  - Per day: one request for the task list, only when a day is clicked.
// Everything fetched is remembered. `version` goes up when a task is
// completed, which clears the memory so the new task appears.

import { useEffect, useMemo, useRef, useState } from "react";
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
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminFetch } from "@/lib/admin-fetch";

type DoneTask = {
  id: number;
  particulars: string;
  details?: string | null;
  priority?: "normal" | "urgent";
  estimated_minutes?: number | null;
  due_date?: string | null;
  last_remark: string | null;
  worked_seconds: number;
  started_at?: string | null;
  completed_at: string;
  updates?: {
    progress: number;
    remarks: string | null;
    created_at: string;
    updated_by_name: string | null;
  }[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MANILA_TZ = "Asia/Manila";
const dayKey = (date: Date) => format(date, "yyyy-MM-dd");
const FIRST_YEAR = 2020;

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

const fmtTime = (value: string) =>
  new Date(value).toLocaleTimeString("en-US", {
    timeZone: MANILA_TZ,
    hour: "numeric",
    minute: "2-digit",
  });

async function getJson(url: string) {
  const response = await adminFetch(url, { cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.message || "Unable to load completed tasks.");
  return result;
}

export default function CompletedCalendar({
  hideTimer = false,
  version = 0,
}: {
  hideTimer?: boolean;
  version?: number;
}) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(dayKey(new Date()));

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dayTasks, setDayTasks] = useState<DoneTask[]>([]);
  const [loadingYear, setLoadingYear] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [error, setError] = useState("");
  const [openTask, setOpenTask] = useState<DoneTask | null>(null);

  const yearCache = useRef(new Map<string, Record<string, number>>());
  const dayCache = useRef(new Map<string, DoneTask[]>());
  const today = new Date();
  const year = month.getFullYear();
  const thisYear = today.getFullYear();

  // New completion -> forget everything loaded so far.
  useEffect(() => {
    yearCache.current.clear();
    dayCache.current.clear();
  }, [version]);

  // Per-day counts for the year being viewed.
  useEffect(() => {
    const key = `${version}:${year}`;
    const hit = yearCache.current.get(key);
    if (hit) {
      setCounts(hit);
      return;
    }

    let active = true;
    setLoadingYear(true);
    setError("");
    (async () => {
      try {
        const result = await getJson(
          `/api/admin/my-tasks/completed/summary?year=${year}`,
        );
        if (!active) return;
        yearCache.current.set(key, result.data ?? {});
        setCounts(result.data ?? {});
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error ? failure.message : "Unable to load.",
          );
      } finally {
        if (active) setLoadingYear(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [year, version]);

  // The tasks of the selected day.
  useEffect(() => {
    if (!selected) {
      setDayTasks([]);
      return;
    }
    const key = `${version}:${selected}`;
    const hit = dayCache.current.get(key);
    if (hit) {
      setDayTasks(hit);
      return;
    }

    let active = true;
    setLoadingDay(true);
    setError("");
    setDayTasks([]);
    (async () => {
      try {
        const result = await getJson(
          `/api/admin/my-tasks/completed?date=${selected}`,
        );
        if (!active) return;
        dayCache.current.set(key, result.data ?? []);
        setDayTasks(result.data ?? []);
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error ? failure.message : "Unable to load.",
          );
      } finally {
        if (active) setLoadingDay(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selected, version]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = addDays(startOfWeek(endOfMonth(month), { weekStartsOn: 0 }), 6);
    const list: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) list.push(d);
    return list;
  }, [month]);

  const monthTotal = useMemo(
    () =>
      Object.entries(counts).reduce(
        (sum, [key, n]) =>
          key.startsWith(format(month, "yyyy-MM")) ? sum + n : sum,
        0,
      ),
    [counts, month],
  );

  const atCurrentMonth = isSameMonth(month, today);
  const years: number[] = [];
  for (let y = thisYear; y >= FIRST_YEAR; y--) years.push(y);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Completed tasks
          </h2>
          <p className="text-sm text-slate-500">
            Pick a day to see what you finished ·{" "}
            <span className="tabular-nums">{monthTotal}</span> this month
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="Year"
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            onChange={(event) => {
              const next = new Date(month);
              next.setFullYear(Number(event.target.value));
              setMonth(startOfMonth(next));
              setSelected(null);
            }}
            value={year}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span className="mx-1 min-w-24 text-center text-sm font-semibold text-slate-900">
            {format(month, "MMMM")}
          </span>
          <Button
            onClick={() => {
              setMonth(startOfMonth(new Date()));
              setSelected(dayKey(new Date()));
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Today
          </Button>
          <Button
            aria-label="Previous month"
            disabled={year === FIRST_YEAR && month.getMonth() === 0}
            onClick={() => {
              setMonth((value) => subMonths(value, 1));
              setSelected(null);
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <Button
            aria-label="Next month"
            disabled={atCurrentMonth}
            onClick={() => {
              setMonth((value) => addMonths(value, 1));
              setSelected(null);
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Calendar */}
        <div className="relative border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70">
            {WEEKDAYS.map((day) => (
              <div
                className="py-2 text-center text-xs font-medium text-slate-500"
                key={day}
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = dayKey(day);
              const inMonth = isSameMonth(day, month);
              const count = inMonth ? (counts[key] ?? 0) : 0;
              const isToday = isSameDay(day, today);
              const isSelected = selected === key;
              return (
                <button
                  aria-pressed={isSelected}
                  className={`flex h-16 flex-col items-center gap-1 border-b border-r border-slate-100 p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                    isSelected
                      ? "bg-blue-50 ring-1 ring-inset ring-blue-500"
                      : inMonth
                        ? "hover:bg-slate-50"
                        : "bg-slate-50/70"
                  }`}
                  disabled={!inMonth || day > today}
                  key={key}
                  onClick={() => setSelected(isSelected ? null : key)}
                  type="button"
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-sm tabular-nums ${
                      isToday
                        ? "bg-blue-600 font-semibold text-white"
                        : inMonth
                          ? "text-slate-800"
                          : "text-slate-300"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {count > 0 && (
                    <span className="rounded-full bg-emerald-100 px-1.5 text-[11px] font-semibold tabular-nums text-emerald-800">
                      {count} done
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loadingYear && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
          )}
        </div>

        {/* Selected day */}
        <div className="max-h-[420px] overflow-y-auto p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            {selected
              ? format(new Date(`${selected}T00:00:00`), "EEEE, MMM d, yyyy")
              : "Pick a day"}
            {selected && !loadingDay && (
              <span className="font-normal text-slate-500">
                · {dayTasks.length}
              </span>
            )}
            {loadingDay && (
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            )}
          </p>

          {error && (
            <p
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              role="alert"
            >
              {error}
            </p>
          )}

          {!error && !selected && (
            <p className="py-8 text-center text-sm text-slate-500">
              Click a day with a green “done” badge.
            </p>
          )}

          {!error && selected && !loadingDay && dayTasks.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              No completed tasks on this day.
            </p>
          )}

          <ul className="space-y-2">
            {dayTasks.map((task) => (
              <li key={task.id}>
                <button
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  onClick={() => setOpenTask(task)}
                  type="button"
                >
                  <p className="text-sm font-medium text-slate-900">
                    {task.particulars}
                  </p>
                  {task.last_remark && (
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs italic text-slate-500">
                      “{task.last_remark}”
                    </p>
                  )}
                  <p className="mt-1 flex items-center justify-between gap-2 text-xs tabular-nums text-slate-500">
                    <span>
                      {hideTimer
                        ? `Started ${fmtStamp(task.started_at)} · Ended ${fmtStamp(task.completed_at)}`
                        : `${fmtShort(task.worked_seconds)} · done ${fmtTime(task.completed_at)}`}
                    </span>
                    <span className="font-medium text-blue-700">View</span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setOpenTask(null);
        }}
        open={Boolean(openTask)}
      >
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-lg flex-col rounded-2xl border-slate-200 bg-white">
          <DialogHeader className="text-left">
            <DialogTitle>Completed task</DialogTitle>
            <DialogDescription>
              {openTask ? `Done ${fmtStamp(openTask.completed_at)}` : ""}
            </DialogDescription>
          </DialogHeader>

          {openTask && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden">
              <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <p className="whitespace-pre-line break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                  {openTask.particulars}
                  {openTask.priority === "urgent" && (
                    <span className="ml-2 text-xs font-semibold text-rose-600">
                      Urgent
                    </span>
                  )}
                </p>
                {openTask.details && (
                  <p className="whitespace-pre-line break-words text-sm text-slate-600 [overflow-wrap:anywhere]">
                    {openTask.details}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>Started {fmtStamp(openTask.started_at)}</span>
                  <span>Ended {fmtStamp(openTask.completed_at)}</span>
                  {!hideTimer && (
                    <span className="tabular-nums">
                      Time {fmtShort(openTask.worked_seconds)}
                      {openTask.estimated_minutes
                        ? ` of ${fmtShort(openTask.estimated_minutes * 60)}`
                        : ""}
                    </span>
                  )}
                  {openTask.due_date && (
                    <span>
                      Due{" "}
                      {format(
                        new Date(`${openTask.due_date.slice(0, 10)}T00:00:00`),
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
                {(openTask.updates ?? []).length === 0 && (
                  <p className="py-4 text-center text-sm text-slate-500">
                    No notes were saved for this task.
                  </p>
                )}
                <div className="space-y-2">
                  {openTask.updates?.map((update, index) => (
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
    </section>
  );
}
