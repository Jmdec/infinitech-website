"use client";
// components/dashboard/AdminInfoPanels.tsx
//
// Admin overview only: Alert + Overview panels. Fetch only.
//   GET /api/admin/dashboard-panels/alerts
//   GET /api/admin/dashboard-panels/overview

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import Link from "next/link";
type AlertRow = {
  key: string;
  label: string;
  count: number;
  names: string[];
  days: number;
  when?: string;
  description?: string | null;
};

type Alerts = { primary: AlertRow[]; secondary: AlertRow[] };

type ActiveEmployee = {
  id: number;
  name: string;
  position: string | null;
  department: string | null;
  last_login: string | null;
};

type Overview = {
  active_employees: number;
  employees: ActiveEmployee[];
};

const fmtDateTime = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function PanelShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 className="bg-blue-600 px-5 py-3 text-base font-semibold text-white">
        {title}
      </h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

function LabelRow({
  label,
  children,
  alignTop = false,
}: {
  label: string;
  children: React.ReactNode;
  alignTop?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 sm:grid-cols-[11rem_minmax(0,1fr)] ${
        alignTop ? "items-start" : "items-center"
      }`}
    >
      <span className="rounded-md bg-sky-50 px-3 py-2 text-right text-sm text-slate-700">
        {label}
      </span>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

function AlertLine({ row }: { row: AlertRow }) {
  const detail = row.description
    ? row.description
    : row.names.length > 0
      ? row.names.join(", ")
      : null;

  return (
    <LabelRow label={row.label} alignTop>
      {/* py-2 matches the label's vertical padding so the first lines line up */}
      <div className="py-2">
        <div className="flex items-baseline gap-3 leading-5">
          <span
            className={`w-4 shrink-0 text-center font-semibold tabular-nums ${
              row.count > 0 ? "text-rose-600" : "text-slate-400"
            }`}
            title={row.names.join(", ")}
          >
            {row.count > 0 ? row.count : "–"}
          </span>
          {!row.description && row.count > 0 && (
            <span className="text-slate-600">
              {row.when ?? `in ${row.days} days`}
            </span>
          )}
        </div>
        {detail && (
          <p className="mt-1 break-words pl-7 text-xs leading-5 text-slate-500">
            {detail}
          </p>
        )}
      </div>
    </LabelRow>
  );
}

export default function AdminInfoPanels() {
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const get = async <T,>(url: string): Promise<T | null> => {
      try {
        const res = await adminFetch(url, { cache: "no-store" });
        if (!res.ok) return null;
        const json = await res.json();
        return (json?.data ?? null) as T | null;
      } catch {
        return null;
      }
    };

    const [al, ov] = await Promise.all([
      get<Alerts>("/api/admin/dashboard-panels/alerts"),
      get<Overview>("/api/admin/dashboard-panels/overview"),
    ]);

    setAlerts(al);
    setOverview(ov);
    if (!al && !ov) setError("Unable to load dashboard panels.");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      {error && (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <PanelShell title="Alert">
          {alerts === null ? (
            <div className="h-56 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <div className="space-y-1">
              {alerts.primary.map((row) => (
                <AlertLine key={row.key} row={row} />
              ))}
              <hr className="my-3 border-slate-200" />
              {alerts.secondary.map((row) => (
                <AlertLine key={row.key} row={row} />
              ))}
            </div>
          )}
        </PanelShell>

        <PanelShell title="Overview">
          {overview === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <div className="space-y-2">
              <LabelRow label="Active Employees">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold tabular-nums">
                    {overview.active_employees.toLocaleString()}
                  </span>
                  <Link
                    href="/admin/employee-masterfile?add=1"
                    className="text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    Add Employee
                  </Link>
                </span>
              </LabelRow>

              {overview.employees.length > 0 && (
                <ul className="mt-4 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-slate-100">
                  {overview.employees.map((employee) => (
                    <li
                      className="flex items-center justify-between gap-3 px-3 py-2"
                      key={employee.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {employee.name}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {[employee.position, employee.department]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-slate-400">Last login</p>
                        <p
                          className={`text-xs tabular-nums ${
                            employee.last_login
                              ? "text-slate-700"
                              : "text-slate-400"
                          }`}
                        >
                          {employee.last_login
                            ? fmtDateTime(employee.last_login)
                            : "Never"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </PanelShell>
      </div>
    </div>
  );
}
