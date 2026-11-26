"use client";
// components/dashboard/EmployeeAccountPanel.tsx
//
// Shown on every role dashboard for accounts linked to an employee record.
// Milestones and Leave Credits now have their own sidebar pages:
//   /admin/my-milestones
//   /admin/my-leave-credits

import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { useEmployeeAccount } from "@/lib/employee-account";

const OT_FILING_HREF = "/admin/my-overtime";

export default function EmployeeAccountPanel() {
  const { employee, loaded } = useEmployeeAccount(false);

  if (!loaded || !employee) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
          <Clock3 aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900">OT Filing</h2>
          <p className="text-sm text-slate-500">
            File overtime for the hours you rendered beyond your shift.
          </p>
        </div>
      </div>
      <Link
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        href={OT_FILING_HREF}
      >
        File overtime
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </section>
  );
}
