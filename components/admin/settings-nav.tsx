"use client";
// components/admin/settings-nav.tsx
// Shared tab bar for the Settings area. Rendered by
// app/admin/(settings)/layout.tsx, so it stays visible on every page in
// the group: Email Settings, User Access and System Roadmap.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Mail, Map as MapIcon, Users } from "lucide-react";

type Tab = {
  href: string;
  label: string;
  icon: typeof Mail;
  /** Who may open it. Mirrors the access rules in lib/admin-navigation.ts. */
  visible: (session: Session) => boolean;
};

type Session = { isSuperadmin: boolean; keys: string[] };

const TABS: Tab[] = [
  {
    href: "/admin/settings",
    label: "Email Settings",
    icon: Mail,
    visible: (s) => s.isSuperadmin,
  },
  {
    href: "/admin/access-management",
    label: "User Access",
    icon: Users,
    visible: (s) =>
      s.isSuperadmin ||
      s.keys.includes("user_access_management") ||
      s.keys.includes("all_directory"),
  },
  {
    href: "/admin/audit-logs",
    label: "User Log",
    icon: Activity,
    visible: (s) =>
      s.isSuperadmin ||
      s.keys.includes("system_audit_logs") ||
      s.keys.includes("all_directory"),
  },
  {
    href: "/admin/roadmap",
    label: "System Roadmap",
    icon: MapIcon,
    visible: (s) => s.isSuperadmin,
  },
];

export default function SettingsNav() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/admin/session", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const json = await response.json();
        if (!active) return;
        setSession({
          isSuperadmin: json.is_superadmin === true,
          keys: (json.permissions ?? []).map(
            (permission: { key: string }) => permission.key,
          ),
        });
      } catch {
        // No session info: show no tabs rather than links the user can't open.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const tabs = session ? TABS.filter((tab) => tab.visible(session)) : [];

  // Nothing to switch between (or still loading): don't show an empty bar.
  if (tabs.length < 2) return null;

  return (
    <nav
      aria-label="Settings sections"
      className="mb-6 flex gap-6 overflow-x-auto border-b border-slate-200"
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-0.5 pb-3 pt-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ${
              active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
