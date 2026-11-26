"use client";
// app/admin/dashboard/page.tsx

import { useEffect, useState } from "react";
import AdminOverview from "@/components/dashboard/AdminOverview";
import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";
import { adminFetch } from "@/lib/admin-fetch";

export default function DashboardPage() {
  const [isSuperadmin, setIsSuperadmin] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await adminFetch("/api/admin/session", {
          cache: "no-store",
        });
        const data = await res.json();
        if (active) setIsSuperadmin(data?.is_superadmin === true);
      } catch {
        if (active) setIsSuperadmin(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (isSuperadmin === null) {
    return (
      <div className="flex min-h-96 items-center justify-center text-sm text-slate-500">
        Loading dashboard…
      </div>
    );
  }

  // Superadmins go through RoleDashboardPage, which shows the tabs only for Justin.
  // Everyone else keeps the same admin overview as before.
  return isSuperadmin ? (
    <RoleDashboardPage role="superadmin" />
  ) : (
    <AdminOverview />
  );
}
