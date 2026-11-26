// components/admin/use-department-scope.ts
"use client";

import { useEffect, useState } from "react";

// canSeeAll = superadmin / HR -> every department tab.
// Otherwise only `department` (resolved on the server: session, then masterfile).
export function useDepartmentScope() {
  const [state, setState] = useState<{
    loading: boolean;
    canSeeAll: boolean;
    department: string;
    error: string;
  }>({ loading: true, canSeeAll: false, department: "", error: "" });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // Same token the other admin pages (e.g. Employee Masterfile) send.
        // Without this header the server can't tell who is logged in.
        const token = localStorage.getItem("adminSessionActive");

        const res = await fetch("/api/admin/department-scope", {
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.data) {
          throw new Error(
            json?.message || `department-scope failed (${res.status})`,
          );
        }

        if (active) {
          setState({
            loading: false,
            canSeeAll: json.data.canSeeAll === true,
            department: String(json.data.department ?? ""),
            error: "",
          });
        }
      } catch (err: any) {
        console.error("[useDepartmentScope]", err);
        // Fail closed: if we cannot tell, do not show every department.
        if (active)
          setState({
            loading: false,
            canSeeAll: false,
            department: "",
            error: err?.message || "Failed to resolve department",
          });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return state;
}
