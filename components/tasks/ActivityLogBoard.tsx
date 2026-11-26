"use client";
// components/tasks/ActivityLogBoard.tsx
//
// Shows only what the API returns. The API already hides logs above your level
// (a manager never receives superadmin logs), so nothing is filtered here for security.

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/admin-fetch";

type LogRow = {
  id: number;
  action: string;
  description: string;
  actor: string;
  actor_level: number;
  actor_level_name: string; // comes from the API (ActivityLog::LEVEL_NAMES)
  about: string | null;
  created_at: string;
};

// Must match the route in routes/api.php (php artisan route:list --path=activity-logs)
const ACTIVITY_LOG_URL = "/api/admin/task-management/activity-logs";

// Level badge is hidden for now (see the "Who" cell). Uncomment both to bring it back.
// const LEVEL_BADGE = (level: number) =>
//   level >= 100
//     ? "bg-purple-50 text-purple-800" // ALPHA
//     : level >= 70
//       ? "bg-blue-50 text-blue-800" // BRAVO
//       : level >= 50
//         ? "bg-sky-50 text-sky-800" // CHARLIE
//         : "bg-slate-100 text-slate-700"; // ECHO

const ACTIONS: [string, string][] = [
  ["", "All actions"],
  ["task.assigned", "Task assigned"],
  ["task.updated", "Task edited"],
  ["task.cancelled", "Task cancelled"],
  ["task.deleted", "Task deleted"],
  ["task.started", "Task started"],
  ["task.paused", "Task paused"],
  ["task.completed", "Task completed"],
  ["task.progress", "Progress saved"],
];

const MANILA_TZ = "Asia/Manila";

const parseServerDate = (value: string) => {
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return new Date(hasZone ? iso : `${iso}+08:00`);
};

const fmtWhen = (value: string) =>
  parseServerDate(value).toLocaleString("en-US", {
    timeZone: MANILA_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// Hides the task number: Completed task #8 “asdasd” -> Completed task “asdasd”
const hideTaskNumber = (text: string) => text.replace(/\s*#\d+/g, "");

export default function ActivityLogBoard() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (targetPage = 1) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(targetPage) });
        if (search.trim()) params.set("search", search.trim());
        if (action) params.set("action", action);
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        const response = await adminFetch(`${ACTIVITY_LOG_URL}?${params}`, {
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            result.message ||
              (response.status === 403
                ? "You don’t have access to the activity log."
                : "Unable to load the activity log."),
          );

        setRows(result.data);
        setPage(result.meta.current_page);
        setLastPage(result.meta.last_page);
        setTotal(result.meta.total);
      } catch (failure) {
        setRows((current) => current ?? []);
        setError(
          failure instanceof Error ? failure.message : "Unable to load logs.",
        );
      } finally {
        setLoading(false);
      }
    },
    [search, action, from, to],
  );

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, from, to]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Activity from you and your team. You can’t see logs from people above
          your level.
        </p>
        <Button
          disabled={loading}
          onClick={() => void load(page)}
          type="button"
          variant="outline"
        >
          <RefreshCw
            aria-hidden="true"
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center">
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              void load(1);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="Search activity"
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or activity (press Enter)"
              value={search}
            />
          </form>
          <select
            aria-label="Filter by action"
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            onChange={(event) => setAction(event.target.value)}
            value={action}
          >
            {ACTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Input
            aria-label="From date"
            className="w-full xl:w-40"
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            value={from}
          />
          <Input
            aria-label="To date"
            className="w-full xl:w-40"
            onChange={(event) => setTo(event.target.value)}
            type="date"
            value={to}
          />
        </div>

        {rows === null ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-slate-500">
            Loading activity…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="font-semibold text-slate-900">No activity found</p>
            <p className="mt-1 text-sm text-slate-500">
              Try changing the search or dates.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-sm [&_td]:px-3 [&_th]:px-3">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Who</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">About</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr
                    className="text-slate-700 hover:bg-blue-50/50"
                    key={row.id}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {fmtWhen(row.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="font-medium text-slate-900">{row.actor}</p>
                      {/* <span
                        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${LEVEL_BADGE(row.actor_level)}`}
                      >
                        {row.actor_level_name}
                      </span> */}
                    </td>
                    <td className="min-w-[200px] px-4 py-3">
                      {/* {row.description} */}
                      {hideTaskNumber(row.description)}
                    </td>
                    <td className="max-w-[160px] break-words px-4 py-3 text-xs text-slate-500 [overflow-wrap:anywhere]">
                      {/* {row.about ?? "—"} */}
                      {row.about ? hideTaskNumber(row.about) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>{total} entries</span>
          <div className="flex items-center gap-2">
            <Button
              disabled={loading || page <= 1}
              onClick={() => void load(page - 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <span>
              Page {page} of {lastPage}
            </span>
            <Button
              disabled={loading || page >= lastPage}
              onClick={() => void load(page + 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
