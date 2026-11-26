"use client";
// components/dashboard/LeaveCreditsPage.tsx

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Lock, Sparkles, Unlock } from "lucide-react";
import {
  LEAVE_CREDITS_PER_EMPLOYEE,
  fmtDateObj,
  getLeaveStatus,
  useEmployeeAccount,
} from "@/lib/employee-account";

const LEAVE_FILING_HREF = "/admin/my-leave";

export default function LeaveCreditsPage() {
  const { employee, loaded } = useEmployeeAccount(false);
  const leave = useMemo(() => getLeaveStatus(employee), [employee]);

  return (
    <div className="space-y-6 pb-8">
      <header
        className={`rounded-3xl bg-gradient-to-r px-6 py-8 text-white shadow-lg sm:px-9 ${
          leave.unlocked
            ? "from-emerald-600 to-teal-600"
            : "from-slate-600 to-slate-700"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            {leave.unlocked ? (
              <Unlock aria-hidden="true" className="h-7 w-7" />
            ) : (
              <Lock aria-hidden="true" className="h-7 w-7" />
            )}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Leave Credits
            </h1>
            <p className="mt-1 text-sm text-white/80">
              {LEAVE_CREDITS_PER_EMPLOYEE} credits for every regular employee.
            </p>
          </div>
        </div>
      </header>

      {!loaded ? (
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
      ) : !employee ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Your account is not linked to an employee record yet. Ask HR to link
          it.
        </p>
      ) : (
        <section
          className={`rounded-2xl border p-6 shadow-sm ${
            leave.unlocked
              ? "border-slate-200 bg-white"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                {leave.unlocked ? "Credits left" : "Credits waiting for you"}
              </p>
              <p
                className={`mt-1 text-5xl font-bold tabular-nums ${
                  leave.unlocked ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {leave.unlocked ? leave.remaining : LEAVE_CREDITS_PER_EMPLOYEE}
                <span className="text-2xl font-semibold text-slate-400">
                  /{LEAVE_CREDITS_PER_EMPLOYEE}
                </span>
              </p>
              {leave.unlocked && (
                <p className="mt-1 text-sm text-slate-500">
                  {leave.used} of {LEAVE_CREDITS_PER_EMPLOYEE} used
                </p>
              )}
            </div>

            <div className="flex gap-2" aria-hidden="true">
              {Array.from({ length: LEAVE_CREDITS_PER_EMPLOYEE }, (_, i) => {
                const filled = leave.unlocked && i < leave.remaining;
                return (
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 ${
                      filled
                        ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                        : "bg-slate-200 text-slate-400 ring-slate-300"
                    }`}
                    key={i}
                  >
                    {leave.unlocked ? (
                      <Sparkles className="h-4 w-4" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          {!leave.unlocked && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>
                  {leave.regDate
                    ? `Regular since ${fmtDateObj(leave.regDate)}`
                    : "Not regular yet"}
                </span>
                <span>
                  {leave.unlockDate
                    ? `Unlocks ${fmtDateObj(leave.unlockDate)}`
                    : ""}
                </span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${leave.progress * 100}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {leave.daysLeft !== null
                  ? `${leave.daysLeft} ${leave.daysLeft === 1 ? "day" : "days"} to go. Keep it up, your credits unlock after 1 year as a regular employee.`
                  : leave.reason}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                You can still file leave anytime.
              </p>
            </div>
          )}

          <div className="mt-6">
            <Link
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              href={LEAVE_FILING_HREF}
            >
              File leave
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
