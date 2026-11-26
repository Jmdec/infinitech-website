"use client";
// components/dashboard/RoleDashboardPage.tsx

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Trophy } from "lucide-react";
import AdminOverview from "@/components/dashboard/AdminOverview";
import EmployeeDashboard from "@/components/dashboard/EmployeeDashboard";
import RoleDashboard from "@/components/dashboard/RoleDashboard";
import { adminFetch } from "@/lib/admin-fetch";
import {
  dashboardPathFor,
  resolveDashboardRole,
  type DashboardRole,
  type SessionLike,
} from "@/lib/role-dashboards";

// Superadmins who also want the employee dashboard (full names, any casing).
// Everyone else with the admin role still sees only the admin overview.
const EMPLOYEE_VIEW_NAMES = ["justin de castro", "justin mangubat de castro"];

const normalize = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function wantsEmployeeView(session: SessionLike) {
  const s = session as unknown as Record<string, unknown>;
  const user = (s.user ?? {}) as Record<string, unknown>;
  const employee = (s.employee ?? {}) as Record<string, unknown>;

  const isSuperadmin =
    s.is_superadmin === true ||
    user.is_superadmin === true ||
    s.admin_role === "superadmin" ||
    user.admin_role === "superadmin";
  if (!isSuperadmin) return false;

  const names = [
    s.name,
    s.full_name,
    s.employee_name,
    user.name,
    user.full_name,
    employee.name,
    employee.full_name,
    [employee.first_name, employee.middle_name, employee.last_name]
      .filter(Boolean)
      .join(" "),
    [employee.first_name, employee.last_name].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .map(normalize);

  const matched = names.some((name) => EMPLOYEE_VIEW_NAMES.includes(name));

  if (!matched && process.env.NODE_ENV !== "production") {
    console.warn("[employee-view] superadmin not matched. Names seen:", names);
  }

  return matched;
}

export default function RoleDashboardPage({ role }: { role: DashboardRole }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionLike | null>(null);
  const [tab, setTab] = useState<"mine" | "role">("mine");

  useEffect(() => {
    if (!localStorage.getItem("adminSessionActive")) {
      router.replace("/admin/login");
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await adminFetch("/api/admin/session", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data: SessionLike = await res.json();
        if (!active) return;
        // Visiting another role's URL: send the user to their own dashboard.
        if (resolveDashboardRole(data) !== role) {
          router.replace(dashboardPathFor(data));
          return;
        }
        setSession(data);
      } catch {
        if (active) router.replace("/admin/login");
      }
    })();
    return () => {
      active = false;
    };
  }, [role, router]);

  if (!session) {
    return (
      <div className="flex min-h-96 items-center justify-center text-sm text-slate-500">
        Loading dashboard…
      </div>
    );
  }

  // Superadmins resolve to the "superadmin" role, so treat it like admin.
  const isAdminLike = role === "admin" || role === "superadmin";
  const adminWithEmployeeView = isAdminLike && wantsEmployeeView(session);

  if (isAdminLike && !adminWithEmployeeView) return <AdminOverview />;
  if (role === "employee") return <EmployeeDashboard />;

  const roleLabel = isAdminLike
    ? "Admin"
    : role === "hr"
      ? "HR"
      : role === "accounting"
        ? "Accounting"
        : "Team";

  const tabs = [
    { key: "mine", label: "My progress", icon: Trophy },
    { key: "role", label: `${roleLabel} overview`, icon: LayoutDashboard },
  ] as const;

  return (
    <div className="space-y-5">
      <div
        aria-label="Dashboard view"
        className="inline-flex rounded-xl bg-slate-100 p-1"
        role="tablist"
      >
        {tabs.map(({ key, label, icon: TabIcon }) => (
          <button
            aria-selected={tab === key}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              tab === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            type="button"
          >
            <TabIcon aria-hidden="true" className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Both stay mounted, so switching tabs doesn't refetch or reset.
          Admin overview has no OT / leave / milestones panel, so for the
          admin role the "My progress" tab keeps its own copy. */}
      <div className={tab === "mine" ? "" : "hidden"}>
        <EmployeeDashboard showAccountPanel={isAdminLike} />
      </div>
      <div className={tab === "role" ? "" : "hidden"}>
        {isAdminLike ? (
          <AdminOverview />
        ) : (
          <RoleDashboard role={role} session={session} />
        )}
      </div>
    </div>
  );
}
