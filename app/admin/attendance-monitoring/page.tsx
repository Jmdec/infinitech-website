"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Clock, Loader2 } from "lucide-react";
import TardinessPage from "../tardiness/page";
import LeaveRequestsPage from "../leave-request/page";
import { useLeaveViewMode } from "../leave-request/employee-leave-view";

type TabKey = "tardiness" | "leave";

const TABS: { key: TabKey; label: string; icon: typeof Clock }[] = [
  { key: "tardiness", label: "Tardiness", icon: Clock },
  { key: "leave", label: "Leave Monitoring", icon: CalendarRange },
];

function AttendanceMonitoring() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { mode, session } = useLeaveViewMode();
  const [visited, setVisited] = useState<Set<TabKey>>(new Set());

  // Which tabs this user may see.
  const allowed = useMemo(() => {
    if (!session) return [] as TabKey[];
    const keys: string[] = (session.permissions || []).map(
      (p: { key: string }) => p.key,
    );
    const has = (k: string) =>
      session.is_superadmin === true ||
      keys.includes(k) ||
      keys.includes("all_directory");
    const list: TabKey[] = [];
    if (has("tardiness")) list.push("tardiness");
    if (mode === "admin") list.push("leave"); // Leave Monitoring is HR/admin only
    return list;
  }, [session, mode]);

  const tabs = TABS.filter((t) => allowed.includes(t.key));
  const requested = params.get("tab");
  const active =
    tabs.find((t) => t.key === requested)?.key ?? tabs[0]?.key ?? null;

  // Mount a tab the first time it is opened, then keep it mounted so its
  // filters, month and search survive switching tabs.
  useEffect(() => {
    if (active) {
      setVisited((prev) =>
        prev.has(active) ? prev : new Set(prev).add(active),
      );
    }
  }, [active]);

  if (mode === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading
      </div>
    );
  }

  if (!active) {
    return (
      <p className="p-16 text-center text-sm text-slate-500">
        You don&apos;t have access to any attendance pages.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="px-1 pt-1 sm:px-2">
        <div
          role="tablist"
          aria-label="Attendance monitoring"
          className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
          style={{ display: "inline-flex", gap: 4 }}
        >
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={active === key}
              onClick={() =>
                router.replace(`${pathname}?tab=${key}`, { scroll: false })
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                whiteSpace: "nowrap",
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${
                active === key
                  ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {visited.has("tardiness") && (
        <div hidden={active !== "tardiness"}>
          <TardinessPage />
        </div>
      )}
      {visited.has("leave") && (
        <div hidden={active !== "leave"}>
          <LeaveRequestsPage />
        </div>
      )}
    </div>
  );
}

// useSearchParams needs a Suspense boundary in the App Router.
export default function AttendanceMonitoringPage() {
  return (
    <Suspense fallback={null}>
      <AttendanceMonitoring />
    </Suspense>
  );
}
