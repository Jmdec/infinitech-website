"use client";
// components/dashboard/DashboardInfoPanels.tsx
//
// Employee dashboard panels. Fetch only, nothing here can be edited.
//   Announcement (top) -> AnnouncementPanel, read-only
//   GET /api/admin/dashboard-panels/alerts
//   GET /api/admin/dashboard-panels/overview

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import AnnouncementPanel from "@/components/dashboard/AnnouncementPanel";

type AlertRow = {
  key: string;
  label: string;
  count: number;
  names: string[];
  days: number;
};

type Alerts = { primary: AlertRow[]; secondary: AlertRow[] };

type Overview = { last_login: string | null; active_employees: number };

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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[11rem_1fr]">
      <span className="rounded-md bg-sky-50 px-3 py-2 text-right text-sm text-slate-700">
        {label}
      </span>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

function AlertLine({ row }: { row: AlertRow }) {
  return (
    <LabelRow label={row.label}>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`min-w-4 font-semibold tabular-nums ${
            row.count > 0 ? "text-rose-600" : "text-slate-400"
          }`}
          title={row.names.join(", ")}
        >
          {row.count > 0 ? row.count : "–"}
        </span>
        <span className="text-slate-600">in {row.days} days</span>
        {row.names.length > 0 && (
          <span className="text-xs text-slate-500">{row.names.join(", ")}</span>
        )}
      </span>
    </LabelRow>
  );
}

export default function DashboardInfoPanels() {
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

      {/* Announcement (on top), fetch only */}
      <AnnouncementPanel />

      <div className="grid gap-5 lg:grid-cols-2">
        <PanelShell title="Alert">
          {alerts === null ? (
            <div className="h-56 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <div className="space-y-2">
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
              <LabelRow label="Last Login">
                {overview.last_login ? fmtDateTime(overview.last_login) : "–"}
              </LabelRow>
              <LabelRow label="Active Employees">
                <span className="font-semibold tabular-nums">
                  {overview.active_employees.toLocaleString()}
                </span>
              </LabelRow>
            </div>
          )}
        </PanelShell>
      </div>
    </div>
  );
}
