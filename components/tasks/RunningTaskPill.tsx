"use client";
// components/tasks/RunningTaskPill.tsx
//
// Floating timer for the task that is running right now. Mount it ONCE in the
// layout shared by the employee pages (e.g. the admin layout) so the timer
// stays visible while navigating. It hides itself on the My Tasks page, where
// the full board already shows the timer.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock3 } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";

type RunningTask = {
  id: number;
  particulars: string;
  priority: "normal" | "urgent";
  status: string;
  worked_seconds: number;
  running_since: string | null;
};

const fmtClock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

export default function RunningTaskPill({
  href = "/admin/my-tasks",
}: {
  /** Route of the My Tasks page. Change it if yours is different. */
  href?: string;
}) {
  const pathname = usePathname();
  const [task, setTask] = useState<RunningTask | null>(null);
  const [offset, setOffset] = useState(0); // server clock minus browser clock
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await adminFetch("/api/admin/my-tasks", {
        cache: "no-store",
      });
      if (!response.ok) {
        setTask(null);
        return;
      }
      const result = await response.json();
      setOffset(Date.parse(result.server_now) - Date.now());
      setTask(
        (result.data as RunningTask[]).find(
          (item) => item.status === "in_progress",
        ) ?? null,
      );
    } catch {
      /* keep showing the last known state */
    }
  }, []);

  useEffect(() => {
    void load();
    const sync = window.setInterval(() => void load(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onChanged = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("my-tasks:changed", onChanged);
    return () => {
      window.clearInterval(sync);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("my-tasks:changed", onChanged);
    };
  }, [load]);

  const running = Boolean(task);
  useEffect(() => {
    if (!running) return;
    const clock = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(clock);
  }, [running]);

  if (!task || pathname?.startsWith(href)) return null;

  const seconds =
    task.worked_seconds +
    (task.running_since
      ? Math.max(
          0,
          (Date.now() + offset - Date.parse(task.running_since)) / 1000,
        )
      : 0);

  return (
    <Link
      className="fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-emerald-200 bg-white py-2 pl-3 pr-4 shadow-lg ring-1 ring-emerald-100 transition hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      href={href}
      title="Go to My Tasks"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <span className="min-w-0">
        <span className="block max-w-[200px] truncate text-xs font-medium text-slate-600">
          <span className="text-slate-400">#{task.id}</span> {task.particulars}
        </span>
        <span className="flex items-center gap-1 text-sm font-bold tabular-nums text-slate-900">
          <Clock3 aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
          {fmtClock(seconds)}
        </span>
      </span>
    </Link>
  );
}
