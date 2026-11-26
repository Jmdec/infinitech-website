"use client";

// app/admin/my-overtime/page.tsx
import { Loader2 } from "lucide-react";
import { useSession } from "../my-leave/employee-leave-view";
import EmployeeOvertimeView from "./employee-overtime-view";

export default function MyOvertimePage() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  return <EmployeeOvertimeView session={session} />;
}
