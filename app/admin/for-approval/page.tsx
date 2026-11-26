"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  BadgeCheck,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notifyApprovalsChanged } from "@/lib/pending-approvals";

/* ───────── constants & types ───────── */

const OT_URL = "/api/admin/overtime-requests";
const LEAVE_URL = "/api/admin/leave-requests";
const PENDING = "Pending review";
const PAGE_SIZE = 10;

// true = each approver only sees (and can act on) requests assigned to them.
const ONLY_MY_APPROVALS = true;

// Leave decision statuses (same strings used by the employee leave view).
// If "Decline" maps to a different status in your backend, change DECLINED.
const APPROVED_CREDITS = "Approved (Leave Credits)";
const APPROVED_NO_PAY = "Approved leave without pay";
const DECLINED = "Unapproved absence";

type LeaveDecision =
  | typeof APPROVED_CREDITS
  | typeof APPROVED_NO_PAY
  | typeof DECLINED;

type OtDecision = "Approved" | "Rejected";

type Tab = "overtime" | "leave";

type ApproverOption = {
  id: number;
  name: string;
  department: string;
  position: string;
};

type OtRequest = {
  id: number;
  employee_number: string;
  date: string;
  minutes: number | string;
  note: string | null;
  proof_name: string | null;
  created_at?: string | null;
  status: string;
  reviewed_by?: string | null;
};

type LeaveRow = {
  id: number;
  employee_id: number;
  employee_number: string;
  leave_type: string;
  other_leave_type: string | null;
  start_date: string;
  end_date: string;
  number_of_days: number;
  half_day_period: "AM" | "PM" | null;
  early_leave_time: string | null;
  reason: string;
  status: string;
};

// NOTE: `?resource=employees` must return id, department and position.
type EmployeeRow = {
  id: number;
  employee_id: string; // employee number
  name: string;
  department: string | null;
  position: string | null;
  is_active?: boolean | number | string | null;
  status?: string | null;
};

/* ───────── helpers ───────── */

const parseDay = (v: string) => new Date(`${v}T00:00:00`);
const dateOnly = (v: string) => String(v ?? "").slice(0, 10);
const toNum = (v: unknown) => Number(v) || 0;

// Adjust this to match your employees API's active flag.
const isActiveEmployee = (e: EmployeeRow) =>
  e.is_active !== undefined && e.is_active !== null
    ? Boolean(Number(e.is_active))
    : String(e.status ?? "active").toLowerCase() === "active";

// Statuses that count as "approved" (shown in the Approved Requests section).
const isApprovedStatus = (s: string) =>
  s === "Approved" || s === APPROVED_CREDITS || s === APPROVED_NO_PAY;

/* ── approver resolution (based on department + position) ──
 *
 *  Staff (e.g. Eirene, Junior IT Dev) → Supervisor of the department,
 *                                       else Manager (e.g. Justin),
 *                                       else EA of the CEO
 *  Supervisor (e.g. Paola)            → Manager of the department,
 *                                       else EA of the CEO
 *  Manager (e.g. Justin)              → EA of the CEO
 *  No dept head (e.g. Roline)         → EA of the CEO
 */
const norm = (v?: string | null) =>
  String(v ?? "")
    .trim()
    .toLowerCase();
const isManager = (e: EmployeeRow) => /\bmanager\b/.test(norm(e.position));
const isSupervisor = (e: EmployeeRow) =>
  /\bsupervisor\b/.test(norm(e.position));
const isCeoEA = (e: EmployeeRow) =>
  /executive assistant/.test(norm(e.position));
// Dapat nasa ilalim ng isCeoEA, kasi ginagamit nito iyon.
const isCeo = (e: EmployeeRow) =>
  !isCeoEA(e) && /\bceo\b|chief executive/.test(norm(e.position));

function resolveApprover(
  requester: EmployeeRow | undefined,
  employees: EmployeeRow[],
): ApproverOption | null {
  if (!requester) return null;

  const active = employees.filter(isActiveEmployee);

  // EA of the CEO: ang CEO lang ang approver.
  if (isCeoEA(requester)) {
    const ceo = active.find((e) => isCeo(e) && e.id !== requester.id);
    return ceo
      ? {
          id: ceo.id,
          name: ceo.name,
          department: ceo.department ?? "",
          position: ceo.position ?? "",
        }
      : null;
  }

  const ea = active.find((e) => isCeoEA(e) && e.id !== requester.id);

  const deptHeads = active.filter(
    (e) =>
      e.id !== requester.id &&
      norm(e.department) === norm(requester.department) &&
      (isManager(e) || isSupervisor(e)),
  );
  const manager = deptHeads.find(isManager);
  const supervisor = deptHeads.find(isSupervisor);

  let pick: EmployeeRow | undefined;
  if (isManager(requester)) pick = ea;
  else if (isSupervisor(requester)) pick = manager ?? ea;
  else pick = supervisor ?? manager ?? ea;

  return pick
    ? {
        id: pick.id,
        name: pick.name,
        department: pick.department ?? "",
        position: pick.position ?? "",
      }
    : null;
}

const fmtDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

const fmtStamp = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
};

function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("adminSessionActive")
      : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

async function readJson<T = any>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errors = data.errors
      ? Object.values(data.errors as Record<string, string[]>)
          .flat()
          .join(" ")
      : "";
    throw new Error(
      errors || data.message || "The request could not be completed.",
    );
  }
  return data as T;
}

const leaveTypeLabel = (
  l: Pick<LeaveRow, "leave_type" | "other_leave_type">,
) =>
  l.other_leave_type ? `${l.leave_type} — ${l.other_leave_type}` : l.leave_type;

function leaveDuration(l: LeaveRow) {
  if (l.early_leave_time) {
    const [h, m] = l.early_leave_time.split(":").map(Number);
    return `Early leave (${format(new Date(2000, 0, 1, h, m), "h:mm a")})`;
  }
  if (l.half_day_period) return `Half day (${l.half_day_period})`;
  return `${l.number_of_days} ${l.number_of_days === 1 ? "day" : "days"}`;
}

function leaveRange(start: string, end: string) {
  const s = parseDay(dateOnly(start));
  const e = parseDay(dateOnly(end));
  if (start === end) return format(s, "MMM d, yyyy");
  return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
}

const stamp = (iso?: string | null) => {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
};

const OT_STATUS_STYLE: Record<string, string> = {
  "Pending review": "bg-amber-50 text-amber-800 ring-amber-600/20",
  Approved: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  Rejected: "bg-rose-50 text-rose-800 ring-rose-600/20",
  Cancelled: "bg-slate-50 text-slate-700 ring-slate-500/20",
  [APPROVED_CREDITS]: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  [APPROVED_NO_PAY]: "bg-sky-50 text-sky-800 ring-sky-600/20",
  [DECLINED]: "bg-rose-50 text-rose-800 ring-rose-600/20",
};

function Badge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${OT_STATUS_STYLE[status] ?? OT_STATUS_STYLE.Cancelled}`}
    >
      {status}
    </span>
  );
}

function ApproverBlock({
  approver,
  loading,
  canAct,
}: {
  approver: ApproverOption | null;
  loading?: boolean;
  canAct?: boolean;
}) {
  return (
    <div className="space-y-1 border-t border-slate-200 px-6 py-3">
      <p className="text-xs font-medium text-slate-500">Approver</p>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : approver ? (
        <p className="text-sm font-medium text-slate-900">
          {approver.name}
          <span className="font-normal text-slate-500">
            , {approver.position} ({approver.department})
          </span>
        </p>
      ) : (
        <p className="text-xs text-rose-600">
          No approver found for this employee&apos;s department/position.
        </p>
      )}
      {approver && canAct === false && (
        <p className="text-xs text-rose-600">
          Only {approver.name} can approve or decline this request.
        </p>
      )}
    </div>
  );
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
      <p className="text-xs text-slate-500">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          aria-label="Previous page"
          disabled={page <= 1}
          size="sm"
          variant="outline"
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-medium text-slate-700">
          Page {page} of {totalPages}
        </span>
        <Button
          aria-label="Next page"
          disabled={page >= totalPages}
          size="sm"
          variant="outline"
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ───────── OT review dialog (proof + approve / decline) ───────── */

function OtReviewDialog({
  req,
  name,
  approver,
  canAct,
  onClose,
  onDecide,
}: {
  req: OtRequest;
  name: string;
  approver: ApproverOption | null;
  canAct: boolean;
  onClose: () => void;
  onDecide: (status: OtDecision, approvedBy: number | null) => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = req.status === PENDING;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const res = await adminFetch(`${OT_URL}/${req.id}/proof`, {
          cache: "no-store",
        });
        if (!res.ok)
          throw new Error(`Unable to load the proof (${res.status}).`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setMime(blob.type);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Unable to load the proof.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [req.id]);

  const decide = async (status: OtDecision) => {
    if (!approver || !canAct) {
      toast.error("Only the assigned approver can review this request.");
      return;
    }
    setBusy(true);
    try {
      await onDecide(status, approver.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            Overtime · {fmtDuration(toNum(req.minutes))}
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">{name}</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <span>
              OT date:{" "}
              <span className="font-semibold text-slate-800">
                {format(parseDay(dateOnly(req.date)), "EEE, MMM d, yyyy")}
              </span>
            </span>
            <span>
              Filed on:{" "}
              <span className="font-semibold text-slate-800">
                {fmtStamp(req.created_at)}
              </span>
            </span>
          </div>
          {req.note && (
            <p className="mt-2 text-xs text-slate-500">Reason: {req.note}</p>
          )}
        </div>

        <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : url && mime === "application/pdf" ? (
            <iframe
              className="h-[60vh] w-full rounded-lg bg-white"
              src={url}
              title="Overtime proof"
            />
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Overtime proof"
              className="max-h-[60vh] max-w-full rounded-lg object-contain"
              src={url}
            />
          ) : null}
        </div>

        <ApproverBlock approver={approver} canAct={canAct} />

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <Button disabled={busy} variant="outline" onClick={onClose}>
            Close
          </Button>
          {pending && (
            <>
              <Button
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={busy || !approver || !canAct}
                variant="outline"
                onClick={() => void decide("Rejected")}
              >
                Decline
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={busy || !approver || !canAct}
                onClick={() => void decide("Approved")}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── Leave review dialog (details + approve / decline) ───────── */

function LeaveReviewDialog({
  leave,
  name,
  approver,
  canAct,
  onClose,
  onDecide,
}: {
  leave: LeaveRow;
  name: string;
  approver: ApproverOption | null;
  canAct: boolean;
  onClose: () => void;
  onDecide: (status: LeaveDecision, approvedBy: number | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState<LeaveDecision | null>(null);
  const approverId = approver ? approver.id : null;
  const pending = leave.status === PENDING;

  const [creditInfo, setCreditInfo] = useState<{
    eligible: boolean;
    remaining: number;
    eligible_on: string;
  } | null>(null);
  const [creditLoading, setCreditLoading] = useState(true);

  // Leave credits ng employee sa taon ng leave
  useEffect(() => {
    let active = true;
    setCreditLoading(true);
    const year = dateOnly(leave.start_date).slice(0, 4);

    void (async () => {
      try {
        const data = await readJson<{
          data: {
            id: number;
            eligible: boolean;
            remaining: number;
            eligible_on: string;
          }[];
        }>(
          await adminFetch(`/api/admin/leave-credits?year=${year}`, {
            cache: "no-store",
          }),
        );
        const row = data.data.find((r) => r.id === leave.employee_id);
        if (active)
          setCreditInfo(
            row
              ? {
                  eligible: row.eligible,
                  remaining: row.remaining,
                  eligible_on: row.eligible_on,
                }
              : null,
          );
      } catch {
        if (active) setCreditInfo(null);
      } finally {
        if (active) setCreditLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [leave.employee_id, leave.start_date]);

  const creditsLocked =
    creditLoading ||
    !creditInfo?.eligible ||
    creditInfo.remaining < leave.number_of_days;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const decide = async (status: LeaveDecision) => {
    if (!approverId || !canAct) {
      toast.error("Only the assigned approver can review this request.");
      return;
    }
    if (status === APPROVED_CREDITS && creditsLocked) {
      toast.error("This employee can't use leave credits for this leave.");
      return;
    }
    setBusy(status);
    try {
      await onDecide(status, approverId);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        aria-modal="true"
        role="dialog"
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900">
              {leaveTypeLabel(leave)}
            </h3>
            <Badge status={leave.status} />
          </div>
          <p className="text-sm text-slate-600">
            {name} · {leave.employee_number}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <span>
              Date:{" "}
              <span className="font-semibold text-slate-800">
                {leaveRange(leave.start_date, leave.end_date)}
              </span>
            </span>
            <span>
              Duration:{" "}
              <span className="font-semibold text-slate-800">
                {leaveDuration(leave)}
              </span>
            </span>
          </div>
        </div>

        <div className="overflow-auto bg-slate-50 px-6 py-4">
          <p className="text-xs font-medium text-slate-500">Reason</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
            {leave.reason}
          </p>
        </div>

        <ApproverBlock
          approver={approver}
          canAct={pending ? canAct : undefined}
        />

        {pending && !creditLoading && creditsLocked && (
          <p className="border-t border-slate-200 px-6 py-2 text-xs text-slate-500">
            {!creditInfo?.eligible
              ? creditInfo?.eligible_on
                ? `Leave credits unlock on ${format(parseDay(creditInfo.eligible_on), "MMM d, yyyy")} (1 year after regularization). You can still approve without pay.`
                : "Leave credits are only for regular employees with 1 year since regularization. You can still approve without pay."
              : `Not enough leave credits (${creditInfo?.remaining ?? 0} remaining). You can still approve without pay.`}
          </p>
        )}

        <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto border-t border-slate-200 px-6 py-4">
          <Button
            className="whitespace-nowrap"
            disabled={!!busy}
            size="sm"
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
          {pending && (
            <>
              <Button
                className="whitespace-nowrap text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={!!busy || !canAct || !approver}
                size="sm"
                variant="outline"
                onClick={() => void decide(DECLINED)}
              >
                {busy === DECLINED && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Decline
              </Button>
              <Button
                className="whitespace-nowrap border-sky-300 text-sky-800 hover:bg-sky-50"
               disabled={!!busy || !canAct || !approver}
                size="sm"
                variant="outline"
                onClick={() => void decide(APPROVED_NO_PAY)}
              >
                {busy === APPROVED_NO_PAY && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Approve (no pay)
              </Button>
              <Button
                className="whitespace-nowrap bg-emerald-600 text-white hover:bg-emerald-700"
                 disabled={!!busy || !canAct || !approver || creditsLocked}
                size="sm"
                title={
                  creditsLocked && !creditLoading
                    ? "Not eligible for leave credits"
                    : undefined
                }
                onClick={() => void decide(APPROVED_CREDITS)}
              >
                {busy === APPROVED_CREDITS && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Approve (credits)
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── reusable section (header + tabs + lists) ───────── */

function RequestsSection({
  title,
  subtitle,
  loading,
  onRefresh,
  tab,
  onTab,
  ots,
  leaves,
  otPage,
  leavePage,
  onOtPage,
  onLeavePage,
  nameOf,
  onReviewOt,
  onReviewLeave,
  emptyOt,
  emptyLeave,
  tabLabels = { overtime: "Overtime requests", leave: "Leave requests" },
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  onRefresh: () => void;
  tab: Tab;
  onTab: (t: Tab) => void;
  ots: OtRequest[];
  leaves: LeaveRow[];
  otPage: number;
  leavePage: number;
  onOtPage: (p: number) => void;
  onLeavePage: (p: number) => void;
  nameOf: (id: string) => string;
  onReviewOt: (r: OtRequest) => void;
  onReviewLeave: (l: LeaveRow) => void;
  emptyOt: string;
  emptyLeave: string;
  tabLabels?: { overtime: string; leave: string };
}) {
  const otPages = Math.max(1, Math.ceil(ots.length / PAGE_SIZE));
  const otSafe = Math.min(otPage, otPages);
  const otItems = ots.slice((otSafe - 1) * PAGE_SIZE, otSafe * PAGE_SIZE);

  const leavePages = Math.max(1, Math.ceil(leaves.length / PAGE_SIZE));
  const leaveSafe = Math.min(leavePage, leavePages);
  const leaveItems = leaves.slice(
    (leaveSafe - 1) * PAGE_SIZE,
    leaveSafe * PAGE_SIZE,
  );

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "overtime", label: tabLabels.overtime, count: ots.length },
    { key: "leave", label: tabLabels.leave, count: leaves.length },
  ];

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
              <BadgeCheck className="h-6 w-6 text-white sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {title}
              </h1>
              <p className="mt-1 text-sm text-blue-100">{subtitle}</p>
            </div>
          </div>
          <Button
            className="h-11 shrink-0 bg-white px-5 font-semibold text-blue-700 shadow-md hover:bg-blue-50"
            disabled={loading}
            onClick={onRefresh}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </header>

      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 border-b border-slate-200 px-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
              onClick={() => onTab(t.key)}
            >
              {t.label}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  t.count > 0
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : tab === "overtime" ? (
          ots.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-slate-500">
              {emptyOt}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {otItems.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {nameOf(r.employee_number)}{" "}
                        <span className="font-normal text-slate-500">
                          · {r.employee_number}
                        </span>
                      </p>
                      <p className="text-sm text-slate-700">
                        {format(parseDay(dateOnly(r.date)), "EEE, MMM d, yyyy")}{" "}
                        <span className="font-semibold text-cyan-800">
                          · {fmtDuration(toNum(r.minutes))}
                        </span>
                      </p>
                      {r.note && (
                        <p
                          className="mt-0.5 max-w-xl truncate text-xs text-slate-500"
                          title={r.note}
                        >
                          {r.note}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">
                        Filed {fmtStamp(r.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge status={r.status} />
                      <Button
                        size="sm"
                        variant={r.status === PENDING ? "default" : "outline"}
                        className={
                          r.status === PENDING
                            ? "bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                            : ""
                        }
                        onClick={() => onReviewOt(r)}
                      >
                        <Clock className="mr-1.5 h-3.5 w-3.5" />
                        {r.status === PENDING ? "Review" : "View"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <Pager page={otSafe} total={ots.length} onPage={onOtPage} />
            </>
          )
        ) : leaves.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            {emptyLeave}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {leaveItems.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {nameOf(l.employee_number)}{" "}
                      <span className="font-normal text-slate-500">
                        · {l.employee_number}
                      </span>
                    </p>
                    <p className="text-sm text-slate-700">
                      {leaveTypeLabel(l)}{" "}
                      <span className="text-slate-500">
                        · {leaveRange(l.start_date, l.end_date)} ·{" "}
                        {leaveDuration(l)}
                      </span>
                    </p>
                    <p
                      className="mt-0.5 max-w-xl truncate text-xs text-slate-400"
                      title={l.reason}
                    >
                      {l.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge status={l.status} />
                    <Button
                      size="sm"
                      variant={l.status === PENDING ? "default" : "outline"}
                      className={
                        l.status === PENDING
                          ? "bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                          : ""
                      }
                      onClick={() => onReviewLeave(l)}
                    >
                      <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
                      {l.status === PENDING ? "Review" : "View"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pager
              page={leaveSafe}
              total={leaves.length}
              onPage={onLeavePage}
            />
          </>
        )}
      </Card>
    </div>
  );
}

/* ───────── page ───────── */

export default function ForApprovalPage() {
  const [tab, setTab] = useState<Tab>("overtime");
  const [approvedTab, setApprovedTab] = useState<Tab>("overtime");
  const [loading, setLoading] = useState(true);
  const [ots, setOts] = useState<OtRequest[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [activeIds, setActiveIds] = useState<Set<string> | null>(null);
  const [reviewing, setReviewing] = useState<OtRequest | null>(null);
  const [reviewingLeave, setReviewingLeave] = useState<LeaveRow | null>(null);
  const [otPage, setOtPage] = useState(1);
  const [leavePage, setLeavePage] = useState(1);
  const [apOtPage, setApOtPage] = useState(1);
  const [apLeavePage, setApLeavePage] = useState(1);
  const [myEmployeeId, setMyEmployeeId] = useState<number | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // Who is logged in (must be the employees.id, same id used by approverFor).
  useEffect(() => {
    void (async () => {
      try {
        const s = await readJson<any>(
          await adminFetch("/api/admin/session", { cache: "no-store" }),
        );
        const id =
          s.employee_id ??
          s.employee?.id ??
          s.user?.employee_id ??
          s.user?.employee?.id ??
          s.user?.id ??
          s.id;
        setMyEmployeeId(id ? Number(id) : null);
        setIsSuperadmin(s.is_superadmin === true);
      } catch {        setMyEmployeeId(null);
      } finally {
        setSessionLoaded(true);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [otRes, leaveRes] = await Promise.allSettled([
        readJson<{ data: OtRequest[] }>(
          await adminFetch(OT_URL, { cache: "no-store" }),
        ),
        readJson<{ data: LeaveRow[] }>(
          await adminFetch(LEAVE_URL, { cache: "no-store" }),
        ),
      ]);

      if (otRes.status === "fulfilled") setOts(otRes.value.data ?? []);
      else toast.error(otRes.reason?.message ?? "Unable to load overtime.");

      if (leaveRes.status === "fulfilled") setLeaves(leaveRes.value.data ?? []);
      else toast.error(leaveRes.reason?.message ?? "Unable to load leaves.");

      try {
        const emp = await readJson<{ data: EmployeeRow[] }>(
          await adminFetch(`${LEAVE_URL}?resource=employees`, {
            cache: "no-store",
          }),
        );
        const all = emp.data ?? [];
        setEmployees(all);
        const active = all.filter(isActiveEmployee);
        const map: Record<string, string> = {};
        active.forEach((e) => (map[e.employee_id] = e.name));
        setNames(map);
        setActiveIds(new Set(active.map((e) => e.employee_id)));
      } catch {
        /* names stay as ID; if this fails we don't filter */
        setEmployees([]);
        setActiveIds(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = (id: string) => names[id] || id;

  const isShown = useCallback(
    (employeeNumber: string) => !activeIds || activeIds.has(employeeNumber),
    [activeIds],
  );

  // Approver is based on the requester's department + position.
  const employeeByNumber = useMemo(() => {
    const m = new Map<string, EmployeeRow>();
    employees.forEach((e) => m.set(e.employee_id, e));
    return m;
  }, [employees]);

  const approverFor = useCallback(
    (employeeNumber: string) =>
      resolveApprover(employeeByNumber.get(employeeNumber), employees),
    [employeeByNumber, employees],
  );

  // Dapat nasa taas ito, bago ang isMine.
  const me = useMemo(
    () => employees.find((e) => e.id === myEmployeeId),
    [employees, myEmployeeId],
  );
  const myName = me?.name ?? null;
  // EA o CEO: walang limitasyon, kita lahat.
 const seesAll = isSuperadmin || (!!me && (isCeoEA(me) || isCeo(me)));

  const isMine = useCallback(
    (employeeNumber: string) => {
      if (!ONLY_MY_APPROVALS) return true;
      const requester = employeeByNumber.get(employeeNumber);
      const approverId = approverFor(employeeNumber)?.id;
      // Request ng EA: CEO (o superadmin) lang
      if (requester && isCeoEA(requester)) {
        return (
          isSuperadmin ||
          (myEmployeeId !== null && approverId === myEmployeeId)
        );
      }
      return (
        seesAll || (myEmployeeId !== null && approverId === myEmployeeId)
      );
    },
    [approverFor, employeeByNumber, myEmployeeId, seesAll, isSuperadmin],
  );

  // Active employees only + assigned to me, newest on top.
  const otAll = useMemo(
    () =>
      ots
        .filter((r) => isShown(r.employee_number) && isMine(r.employee_number))
        .sort(
          (a, b) => stamp(b.created_at) - stamp(a.created_at) || b.id - a.id,
        ),
    [ots, isShown, isMine],
  );

  // (No created_at on LeaveRow, so the highest id = most recently filed.)
  const leaveAll = useMemo(
    () =>
      leaves
        .filter((l) => isShown(l.employee_number) && isMine(l.employee_number))
        .sort((a, b) => b.id - a.id),
    [leaves, isShown, isMine],
  );

  const otPendingList = useMemo(
    () => otAll.filter((r) => r.status === PENDING),
    [otAll],
  );

  const otApprovedList = useMemo(
    () =>
      ots
        .filter((r) => isShown(r.employee_number) && isApprovedStatus(r.status))
        .filter((r) => {
          if (!ONLY_MY_APPROVALS) return true;
          if (seesAll) return isMine(r.employee_number);
          // May reviewed_by: ihambing sa pangalan ko. Wala: gamitin ang hierarchy.
          if (r.reviewed_by) {
            return !!myName && norm(r.reviewed_by) === norm(myName);
          }
          return isMine(r.employee_number);
        })
        .sort(
          (a, b) => stamp(b.created_at) - stamp(a.created_at) || b.id - a.id,
        ),
    [ots, isShown, isMine, myName, seesAll],
  );

  const leavePendingList = useMemo(
    () => leaveAll.filter((l) => l.status === PENDING),
    [leaveAll],
  );

  const leaveApprovedList = useMemo(
    () => leaveAll.filter((l) => isApprovedStatus(l.status)),
    [leaveAll],
  );

  const decideOt = async (status: OtDecision, approvedBy: number | null) => {
    if (!reviewing) return;
    try {
      await readJson(
        await adminFetch(`${OT_URL}/${reviewing.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ status, approved_by: approvedBy }),
        }),
      );
      toast.success(
        status === "Approved" ? "Overtime approved." : "Overtime rejected.",
      );
      setReviewing(null);
      await load();
      notifyApprovalsChanged();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to update the overtime.",
      );
    }
  };

  const decideLeave = async (
    status: LeaveDecision,
    approvedBy: number | null,
  ) => {
    if (!reviewingLeave) return;
    try {
      await readJson(
        await adminFetch(`${LEAVE_URL}/${reviewingLeave.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(
            status !== DECLINED && approvedBy
              ? { status, approved_by: approvedBy }
              : { status },
          ),
        }),
      );
      toast.success(
        status === DECLINED ? "Leave declined." : "Leave approved.",
      );
      setReviewingLeave(null);
      await load(); // approved items move to the "Approved Requests" section
      notifyApprovalsChanged();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to update the leave.",
      );
    }
  };

  return (
    <section className="mx-auto max-w-[1400px] space-y-10 p-1 sm:p-2">
      <RequestsSection
        title="For Approval"
        subtitle="Overtime and leave requests waiting for your review."
        loading={loading}
        onRefresh={() => void load()}
        tab={tab}
        onTab={setTab}
        ots={otPendingList}
        leaves={leavePendingList}
        otPage={otPage}
        leavePage={leavePage}
        onOtPage={setOtPage}
        onLeavePage={setLeavePage}
        nameOf={nameOf}
        onReviewOt={setReviewing}
        onReviewLeave={setReviewingLeave}
        emptyOt="No overtime requests."
        emptyLeave="No leave requests."
      />

      <RequestsSection
        title="Approved Requests"
        subtitle="Overtime and leave requests you have already approved."
        loading={loading}
        onRefresh={() => void load()}
        tab={approvedTab}
        onTab={setApprovedTab}
        ots={otApprovedList}
        leaves={leaveApprovedList}
        otPage={apOtPage}
        leavePage={apLeavePage}
        onOtPage={setApOtPage}
        onLeavePage={setApLeavePage}
        nameOf={nameOf}
        onReviewOt={setReviewing}
        onReviewLeave={setReviewingLeave}
        emptyOt="No approved overtime requests."
        emptyLeave="No approved leave requests."
        tabLabels={{ overtime: "Overtime", leave: "Leave" }}
      />

      {reviewing && sessionLoaded && (
        <OtReviewDialog
          key={reviewing.id}
          name={nameOf(reviewing.employee_number)}
          req={reviewing}
          approver={approverFor(reviewing.employee_number)}
         canAct={
            (isSuperadmin ||
              approverFor(reviewing.employee_number)?.id === myEmployeeId) &&
            !(me && reviewing.employee_number === me.employee_id)
          }          onClose={() => setReviewing(null)}
          onDecide={decideOt}
        />
      )}

      {reviewingLeave && sessionLoaded && (
        <LeaveReviewDialog
          key={reviewingLeave.id}
          name={nameOf(reviewingLeave.employee_number)}
          leave={reviewingLeave}
          approver={approverFor(reviewingLeave.employee_number)}
         canAct={
            (isSuperadmin ||
              approverFor(reviewingLeave.employee_number)?.id ===
                myEmployeeId) &&
            !(me && reviewingLeave.employee_number === me.employee_id)
          }
          onClose={() => setReviewingLeave(null)}
          onDecide={decideLeave}
        />
      )}
    </section>
  );
}
