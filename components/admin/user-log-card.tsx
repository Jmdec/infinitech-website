"use client";
// components/admin/user-log-card.tsx
// "User log" tab for the Settings page. Same data and filters as the
// System audit log dialog on the User Access page (/api/admin/activity-logs).

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Activity, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Directory = { id: number; key: string; label: string };

type ActivityRow = {
  id: number;
  user_name: string | null;
  directory_key: string | null;
  description: string | null;
  action: string;
  method: string;
  path: string;
  status: number;
  outcome: string;
  ip: string | null;
  created_at: string;
};

// Page views are not logged, only these actions.
const ACTIVITY_ACTIONS = ["create", "edit", "delete", "export"] as const;

const SELECT_CONTENT_CLASS =
  "z-[999] border border-slate-200 bg-white text-slate-900 shadow-xl ";

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.message || "The request could not be completed.");
  return result;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function UserLogCard() {
  const [directories, setDirectories] = useState<Directory[]>([]);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [page, setPage] = useState({ current: 1, last: 1 });
  const [directory, setDirectory] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const requestRef = useRef(0);

  // Directory names for the filter and for the row labels.
  useEffect(() => {
    (async () => {
      try {
        const result = await readJson(
          await fetch("/api/admin/access-management/directories", {
            cache: "no-store",
          }),
        );
        setDirectories(result.data ?? []);
      } catch {
        setDirectories([]); // the log still works, rows show the raw key
      }
    })();
  }, []);

  const load = useCallback(
    async (pageNumber = 1) => {
      const requestId = ++requestRef.current;
      setActivity(null);
      try {
        const query = new URLSearchParams({ page: String(pageNumber) });
        if (directory) query.set("directory", directory);
        if (action) query.set("action", action);
        if (search.trim()) query.set("search", search.trim());
        const result = await readJson(
          await fetch(`/api/admin/activity-logs?${query}`, {
            cache: "no-store",
          }),
        );
        if (requestId !== requestRef.current) return; // outdated response
        setActivity(result.data ?? []);
        setPage({
          current: result.current_page ?? 1,
          last: result.last_page ?? 1,
        });
      } catch (failure) {
        if (requestId !== requestRef.current) return;
        toast.error(
          failure instanceof Error
            ? failure.message
            : "Unable to load the user log.",
        );
        setActivity([]);
        setPage({ current: 1, last: 1 });
      }
    },
    [directory, action, search],
  );

  // Reload when a filter changes. Typing in the search box waits 300ms.
  useEffect(() => {
    const timer = window.setTimeout(
      () => void load(1),
      search.trim() ? 300 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const filtersActive = Boolean(search.trim() || directory || action);

  const clearFilters = () => {
    setSearch("");
    setDirectory("");
    setAction("");
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 p-5 sm:p-6">
        <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
          <Activity aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">User log</h2>
          <p className="text-sm text-slate-500">
            Every create, edit, delete and export across all directories.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 border-y border-slate-100 p-4 sm:flex-row sm:items-center sm:px-6">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            aria-label="Search user log"
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search user or path"
            value={search}
          />
        </div>

        <Select
          onValueChange={(value) => setDirectory(value === "all" ? "" : value)}
          value={directory || "all"}
        >
          <SelectTrigger
            aria-label="Filter log by directory"
            className="w-full sm:w-[220px]"
          >
            <SelectValue placeholder="All directories" />
          </SelectTrigger>
          <SelectContent className={SELECT_CONTENT_CLASS} position="popper">
            <SelectItem value="all">All directories</SelectItem>
            {directories.map((item) => (
              <SelectItem key={item.id} value={item.key}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) => setAction(value === "all" ? "" : value)}
          value={action || "all"}
        >
          <SelectTrigger
            aria-label="Filter log by action"
            className="w-full sm:w-[150px]"
          >
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent className={SELECT_CONTENT_CLASS} position="popper">
            <SelectItem value="all">All actions</SelectItem>
            {ACTIVITY_ACTIONS.map((item) => (
              <SelectItem className="capitalize" key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtersActive && (
          <Button
            className="shrink-0"
            onClick={clearFilters}
            type="button"
            variant="ghost"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Results */}
      <div className="min-h-[200px]">
        {activity === null ? (
          <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            Loading user log…
          </div>
        ) : activity.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            {filtersActive
              ? "No activity matches these filters."
              : "No activity recorded yet."}
          </p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {activity.map((row) => {
              const directoryLabel =
                directories.find((item) => item.key === row.directory_key)
                  ?.label ??
                row.directory_key ??
                "—";
              const failed = row.outcome !== "success";
              return (
                <li
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:px-6"
                  key={row.id}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {row.description ??
                        `${row.action.charAt(0).toUpperCase()}${row.action.slice(1)} · ${directoryLabel}`}
                    </p>
                    <p
                      className="truncate text-xs text-slate-500"
                      title={`${row.method} ${row.path}`}
                    >
                      {row.user_name ?? "System"}
                      <span className="text-slate-300">{" · "}</span>
                      {directoryLabel}
                      {row.ip ? ` · ${row.ip}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        failed
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {row.outcome}
                    </span>
                    <time className="whitespace-nowrap text-xs text-slate-500">
                      {formatDateTime(row.created_at)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-6">
        <Button
          disabled={activity === null || page.current <= 1}
          onClick={() => void load(page.current - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <span className="text-xs text-slate-500">
          Page {page.current} of {page.last}
        </span>
        <Button
          disabled={activity === null || page.current >= page.last}
          onClick={() => void load(page.current + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </section>
  );
}
