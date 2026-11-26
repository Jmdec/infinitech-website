"use client";

import { Loader2 } from "lucide-react";
import EmployeeLeaveRequestView, { useSession } from "./employee-leave-view";

export default function MyLeavePage() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  return <EmployeeLeaveRequestView session={session} />;
}
