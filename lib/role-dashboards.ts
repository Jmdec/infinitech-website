// lib/role-dashboards.ts
import {
  Calculator,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type DashboardRole =
  | "hr"
  | "accounting"
  | "admin"
  | "superadmin"
  | "employee";

export type DashboardConfig = {
  role: DashboardRole;
  title: string;
  subtitle: string;
  path: string;
  icon: LucideIcon;
  gradient: string;
};

export const DASHBOARDS: Record<DashboardRole, DashboardConfig> = {
  hr: {
    role: "hr",
    title: "HR Dashboard",
    subtitle: "Employees, attendance, leave, and recruitment.",
    path: "/admin/hr/dashboard",
    icon: UsersRound,
    gradient: "from-blue-600 to-cyan-600",
  },
  accounting: {
    role: "accounting",
    title: "Accounting Dashboard",
    subtitle: "Payroll, expenses, and financial reports.",
    path: "/admin/accounting/dashboard",
    icon: Calculator,
    gradient: "from-emerald-600 to-teal-600",
  },
  admin: {
    role: "admin",
    title: "Admin Dashboard",
    subtitle: "Your assigned directories and incoming requests.",
    path: "/admin/admin/dashboard",
    icon: LayoutDashboard,
    gradient: "from-blue-600 to-purple-600",
  },
  superadmin: {
    role: "superadmin",
    title: "Superadmin Dashboard",
    subtitle: "System-wide overview, accounts, and every directory.",
    path: "/admin/superadmin/dashboard",
    icon: ShieldCheck,
    gradient: "from-purple-600 to-fuchsia-600",
  },
  employee: {
    role: "employee",
    title: "My Dashboard",
    subtitle: "Your tasks, timer, and progress for today.",
    path: "/admin/employee/dashboard",
    icon: ListChecks,
    gradient: "from-sky-600 to-indigo-600",
  },
};

export type SessionLike = {
  is_superadmin?: boolean;
  /** Returned by /api/admin/session (role preset key, e.g. "hr"). */
  role_key?: string | null;
  permissions?: { key: string; actions: string[] }[];
};

// Directories an employee-only account is allowed to have.
const EMPLOYEE_ONLY_KEYS = new Set(["my_tasks"]);

export function resolveDashboardRole(session: SessionLike): DashboardRole {
  if (session.is_superadmin) return "superadmin";

  const key = session.role_key?.toLowerCase();
  if (key && key in DASHBOARDS) return key as DashboardRole;

  // No usable role_key. An account with no directories at all (for example a
  // superadmin who was demoted) or one that can only open My Tasks is a plain
  // employee, not an admin. Anything else keeps the old fallback.
  const keys = (session.permissions ?? []).map((permission) => permission.key);
  if (keys.every((k) => EMPLOYEE_ONLY_KEYS.has(k))) {
    return "employee";
  }

  return "admin";
}

export const dashboardPathFor = (session: SessionLike) =>
  DASHBOARDS[resolveDashboardRole(session)].path;
