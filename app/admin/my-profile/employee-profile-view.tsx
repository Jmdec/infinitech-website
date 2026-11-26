"use client";

import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  BadgeCheck,
  Briefcase,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Download,
  FilePlus2,
  FileText,
  Loader2,
  Phone,
  Receipt,
  User,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import toast from "react-hot-toast";

import { Card } from "@/components/ui/card";
import { type Employee, getFullName } from "@/components/admin/employee-types";
import {
  type AppraisalData,
  downloadAppraisalDocx,
} from "@/lib/generate-appraisal-docx";
import {
  downloadPayslip,
  payslipDataUrl,
  type PayrollCutoff,
  type PayrollEntryRecord,
  type PayslipData,
} from "@/lib/api";

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatCurrency = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  return `₱${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatMobileNumber = (value?: string | null) => {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("09")
    ? `63${digits.slice(1)}`
    : digits.startsWith("9") && digits.length === 10
      ? `63${digits}`
      : digits;
  if (national.startsWith("63") && national.length === 12) {
    return `+${national.slice(0, 5)} ${national.slice(5, 8)} ${national.slice(8)}`;
  }
  return value;
};

const PENDING_LABEL = "! Pending";

type ProfileTab = "profile" | "documents" | "payroll";

const PROFILE_TABS: { key: ProfileTab; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile", icon: User },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "payroll", label: "Payroll", icon: Receipt },
];

// ── Documents tab ──
// Mirrors the masterfile's footer actions (Employee ID, COE, Clearance Form,
// Clearance Cert) plus the Performance Appraisal. Employees can only DOWNLOAD
// what HR issued, never generate.
type DocumentKey =
  | "employee_id"
  | "coe"
  | "clearance_form"
  | "clearance_certificate"
  | "performance_appraisal";

interface DocumentItem {
  id: number;
  label: string | null;
  date: string | null;
  downloads: { label: string; url: string }[];
  /** Performance appraisal only: the saved evaluation, used to build the .docx here. */
  evaluation?: AppraisalData;
}

type DocumentsData = Partial<Record<DocumentKey, DocumentItem[]>>;

const DOCUMENTS: {
  key: DocumentKey;
  label: string;
  icon: LucideIcon;
  iconClass: string;
  emptyText: string;
}[] = [
  {
    key: "employee_id",
    label: "Employee ID",
    icon: CreditCard,
    iconClass: "bg-indigo-50 text-indigo-600",
    emptyText: "No ID issued yet.",
  },
  {
    key: "coe",
    label: "Certificate of Employment",
    icon: FilePlus2,
    iconClass: "bg-blue-50 text-blue-600",
    emptyText: "No COE issued yet.",
  },
  {
    key: "performance_appraisal",
    label: "Performance Appraisal",
    icon: ClipboardList,
    iconClass: "bg-amber-50 text-amber-600",
    emptyText: "No performance appraisal available yet.",
  },
  {
    key: "clearance_form",
    label: "Clearance Form",
    icon: ClipboardCheck,
    iconClass: "bg-violet-50 text-violet-600",
    emptyText: "No clearance form prepared.",
  },
  {
    key: "clearance_certificate",
    label: "Clearance Certificate",
    icon: BadgeCheck,
    iconClass: "bg-emerald-50 text-emerald-600",
    emptyText: "No clearance certificate issued.",
  },
];

// ── Payroll tab ──
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// One saved payroll period of the logged-in employee (from /api/admin/my-payslips).
type MyPayslip = {
  year: number;
  month: number;
  cutoff: PayrollCutoff;
  saved_at: string | null;
  entry: PayrollEntryRecord;
};

const toNum = (v: unknown): number => {
  const x = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const peso = (x: number) =>
  `₱${x.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// "1-15" or "16-<last day of the month>" (e.g. 16-31).
const periodLabel = (p: {
  year: number;
  month: number;
  cutoff: PayrollCutoff;
}) =>
  p.cutoff === "1-15" ? "1-15" : `16-${new Date(p.year, p.month, 0).getDate()}`;

// Rebuilds the payslip from the SAVED entry (nothing is recomputed).
function toPayslip(p: MyPayslip, idNumber: string, name: string): PayslipData {
  const e = p.entry;
  const days = toNum(e.days);
  const mealDays = Math.floor(days);
  const meal = toNum(e.meal_allowance);
  const load = toNum(e.load_allowance);
  const ot = toNum(e.overtime);
  const rest = toNum(e.rest_day);
  const perfect = toNum(e.perfect_attendance_amount);
  const adj = toNum(e.earnings_adjustment);
  const gross = toNum(e.gross_income);

  return {
    idNumber,
    name,
    month: p.month,
    year: p.year,
    cutoff: p.cutoff,
    days,
    mealDays,
    mealRate: mealDays > 0 ? round2(meal / mealDays) : 0,
    dailyRate: toNum(e.daily_rate),
    otHours: toNum(e.ot_hours),
    restDayHours: toNum(e.rest_day_hours),
    tardinessMinutes: toNum(e.tardiness_minutes),
    lwopDays: toNum(e.lwop_days),
    // Basic pay = gross minus the other earnings, so it always matches
    // what was saved.
    basicPay: round2(gross - meal - load - ot - rest - perfect - adj),
    deMinimis: 0,
    overtime: ot,
    restDay: rest,
    mealAllowance: meal,
    loadAllowance: load,
    perfectAttendance: perfect,
    earningsAdjustment: adj,
    grossIncome: gross,
    tardiness: toNum(e.tardiness),
    lwop: toNum(e.lwop),
    sss: toNum(e.sss),
    pagibig: toNum(e.pagibig),
    philhealth: toNum(e.philhealth),
    sssLoan: toNum(e.sss_loan),
    pagibigLoan: toNum(e.pagibig_loan),
    deductionAdjustment: toNum(e.deduction_adjustment),
    totalDeduction: toNum(e.total_deduction),
    netPay: toNum(e.net_pay),
  };
}

function InfoRow({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | null;
  href?: string;
}) {
  const content = value && value.trim() !== "" ? value : "—";
  const isPending = content === PENDING_LABEL;

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      {href && content !== "—" ? (
        <a
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-800 hover:text-cyan-700"
          href={href}
        >
          <span className="truncate">{content}</span>
          <Phone className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <p
          className={`break-words text-sm font-medium ${
            isPending ? "text-red-600" : "text-slate-800"
          }`}
        >
          {content}
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  cols = "grid-cols-2",
  className = "",
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  cols?: string;
  className?: string;
}) {
  return (
    <Card
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          {title}
        </h3>
      </div>
      <div className={`grid gap-x-4 gap-y-3 ${cols}`}>{children}</div>
    </Card>
  );
}

const joinName = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

export default function EmployeeProfileView() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("profile");

  const [documents, setDocuments] = useState<DocumentsData | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
  const documentsRequestedRef = useRef(false);

  // Payroll tab
  const [payslips, setPayslips] = useState<MyPayslip[] | null>(null);
  const [payslipsLoading, setPayslipsLoading] = useState(false);
  const [openSlip, setOpenSlip] = useState<PayslipData | null>(null);
  const payslipsRequestedRef = useRef(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const token = localStorage.getItem("adminSessionActive");
        const response = await fetch("/api/admin/my-profile", {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data?.message || "Unable to load your employee record.",
          );
        }
        if (active) setEmployee((data?.data ?? data) as Employee);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Unable to load your profile.";
        if (active) setError(message);
        toast.error(message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Documents load once, the first time the Documents tab is opened.
  // A ref (not state) guards against double fetching, so the request is
  // never cancelled by an effect re-run.
  useEffect(() => {
    if (tab !== "documents" || documentsRequestedRef.current) return;
    documentsRequestedRef.current = true;

    void (async () => {
      setDocumentsLoading(true);
      try {
        const token = localStorage.getItem("adminSessionActive");
        const response = await fetch("/api/admin/my-documents", {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.message || "Unable to load your documents.");
        }
        setDocuments((data?.data ?? {}) as DocumentsData);
      } catch (e) {
        setDocuments({});
        toast.error(
          e instanceof Error ? e.message : "Unable to load your documents.",
        );
      } finally {
        setDocumentsLoading(false);
      }
    })();
  }, [tab]);

  // Payslips load once, the first time the Payroll tab is opened.
  useEffect(() => {
    if (tab !== "payroll" || payslipsRequestedRef.current) return;
    payslipsRequestedRef.current = true;

    void (async () => {
      setPayslipsLoading(true);
      try {
        const token = localStorage.getItem("adminSessionActive");
        const response = await fetch("/api/admin/my-payslips", {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.message || "Unable to load your payslips.");
        }
        setPayslips((data?.data ?? []) as MyPayslip[]);
      } catch (e) {
        setPayslips([]);
        toast.error(
          e instanceof Error ? e.message : "Unable to load your payslips.",
        );
      } finally {
        setPayslipsLoading(false);
      }
    })();
  }, [tab]);

  // Downloads straight from the tab: no redirect to another page.
  const handleDownload = async (url: string, fallbackName: string) => {
    setDownloadingUrl(url);
    try {
      const token = localStorage.getItem("adminSessionActive");
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.message || "Failed to download the document.");
      }

      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const plain = /filename="?([^";]+)"?/i.exec(disposition);
      const filename = match
        ? decodeURIComponent(match[1])
        : (plain?.[1] ?? fallbackName);

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = objectUrl;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(objectUrl);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to download the document.",
      );
    } finally {
      setDownloadingUrl(null);
    }
  };

  // Performance appraisal: built in the browser from the saved evaluation.
  const handleAppraisalDownload = async (item: DocumentItem) => {
    if (!item.evaluation) return;
    const key = `appraisal-${item.id}`;
    setDownloadingUrl(key);
    try {
      await downloadAppraisalDocx(item.evaluation);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to generate the document.",
      );
    } finally {
      setDownloadingUrl(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="w-full min-w-0 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <Card className="max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {error ??
            "Your account isn't linked to an employee record yet. Please contact HR."}
        </Card>
      </div>
    );
  }

  const e = employee as any;
  const initials =
    `${(e.first_name ?? "").charAt(0)}${(e.last_name ?? "").charAt(0)}`.toUpperCase() ||
    "?";
  const address = [
    e.house_number,
    e.street,
    e.village || e.subdivision,
    e.barangay,
    e.city_municipality,
    e.province,
    e.region,
    e.zip_code,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="w-full min-w-0 space-y-5 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      {/* Header */}
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="flex items-center gap-4 p-5 sm:p-7">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-bold ring-1 ring-white/20 sm:h-16 sm:w-16">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
              {getFullName(employee)}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-blue-100">
              <span>ID Number: {e.id_number}</span>
              {e.position && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" />
                  {e.position}
                </span>
              )}
            </p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {PROFILE_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
              type="button"
              onClick={() => setTab(t.key)}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "profile" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <Section icon={Briefcase} title="Employment">
            <InfoRow label="Department" value={e.department} />
            <InfoRow label="Position" value={e.position} />
            <InfoRow label="Date Hired" value={formatDate(e.date_hired)} />
            <InfoRow
              label="Type"
              value={e.is_regular ? "Regular" : "Probationary"}
            />
            {e.is_regular ? (
              <InfoRow
                label="Date Regularized"
                value={formatDate(e.regularization_date)}
              />
            ) : null}
            <InfoRow label="Status" value={e.status} />
          </Section>

          <Section icon={UserRound} title="Personal Information">
            <InfoRow label="Birthday" value={formatDate(e.birthday)} />
            <InfoRow label="Birthplace" value={e.birthplace} />
            <InfoRow label="Civil Status" value={e.civil_status} />
            <InfoRow label="Gender" value={e.gender} />
          </Section>

          <Section icon={CreditCard} title="Government ID Numbers">
            <InfoRow label="SSS" value={e.sss_number || PENDING_LABEL} />
            <InfoRow
              label="PhilHealth"
              value={e.philhealth_number || PENDING_LABEL}
            />
            <InfoRow
              label="Pag-IBIG"
              value={e.pagibig_number || PENDING_LABEL}
            />
            <InfoRow label="TIN" value={e.tin_number || PENDING_LABEL} />
          </Section>

          <Section icon={Banknote} title="Salary">
            <InfoRow label="Basic Salary" value={formatCurrency(e.salary)} />
            <InfoRow label="De Minimis" value={formatCurrency(e.de_minimis)} />
            {Array.isArray(e.allowances) &&
              e.allowances.map(
                (a: { label: string; amount: unknown }, i: number) => (
                  <InfoRow
                    key={`${a.label}-${i}`}
                    label={a.label}
                    value={formatCurrency(a.amount as string | number)}
                  />
                ),
              )}
          </Section>

          <Section icon={Phone} title="Contact Information">
            <InfoRow
              href={
                e.mobile_number
                  ? `tel:${String(e.mobile_number).replace(/[^\d+]/g, "")}`
                  : undefined
              }
              label="Mobile"
              value={formatMobileNumber(e.mobile_number)}
            />
            <InfoRow label="Email" value={e.email_address} />
            <InfoRow
              label="Emergency Contact"
              value={e.emergency_contact_name}
            />
            <InfoRow
              label="Emergency Mobile"
              value={formatMobileNumber(e.emergency_contact_mobile_number)}
            />
            <div className="col-span-2">
              <InfoRow label="Address" value={address} />
            </div>
          </Section>

          <Section icon={Users} title="Family Information">
            <InfoRow
              label="Mother's Name"
              value={joinName(
                e.m_first_name,
                e.m_middle_name,
                e.m_last_name,
                e.m_suffix,
              )}
            />
            <InfoRow
              label="Father's Name"
              value={joinName(
                e.f_first_name,
                e.f_middle_name,
                e.f_last_name,
                e.f_suffix,
              )}
            />
          </Section>

          <p className="text-center text-xs text-slate-500 lg:col-span-2 2xl:col-span-3">
            This page is view only. To update your information, please contact
            HR.
          </p>
        </div>
      ) : tab === "documents" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {DOCUMENTS.map(
              ({ key, label, icon: Icon, iconClass, emptyText }) => {
                const items = documents?.[key] ?? [];

                return (
                  <Card
                    key={key}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2.5">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {label}
                      </h3>
                    </div>

                    {documentsLoading || documents === null ? (
                      <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                    ) : items.length === 0 ? (
                      <p className="text-xs text-slate-500">{emptyText}</p>
                    ) : (
                      <ul className="space-y-2">
                        {items.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {item.label || `#${item.id}`}
                              </p>
                              {item.date && (
                                <p className="text-xs text-slate-500">
                                  {formatDate(item.date)}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {item.evaluation ? (
                                /* Performance appraisal: generated in the browser */
                                <button
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
                                  disabled={downloadingUrl !== null}
                                  type="button"
                                  onClick={() =>
                                    void handleAppraisalDownload(item)
                                  }
                                >
                                  {downloadingUrl === `appraisal-${item.id}` ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5" />
                                  )}
                                  DOCX
                                </button>
                              ) : item.downloads.length === 0 ? (
                                <span className="text-[11px] text-slate-400">
                                  Ask HR for a copy
                                </span>
                              ) : (
                                item.downloads.map((d) => (
                                  <button
                                    key={d.url}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
                                    disabled={downloadingUrl !== null}
                                    type="button"
                                    onClick={() =>
                                      handleDownload(
                                        d.url,
                                        `${item.label || label}.${d.label === "PDF" ? "pdf" : "docx"}`,
                                      )
                                    }
                                  >
                                    {downloadingUrl === d.url ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Download className="h-3.5 w-3.5" />
                                    )}
                                    {d.label}
                                  </button>
                                ))
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              },
            )}
          </div>

          <p className="text-center text-xs text-slate-500">
            Documents are prepared by HR. If something is missing or needs
            updating, please contact HR.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {payslipsLoading || payslips === null ? (
              <div className="space-y-2 p-4">
                <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
              </div>
            ) : payslips.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">
                No payslips available yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {payslips.map((p) => {
                  const slip = toPayslip(
                    p,
                    String(e.id_number ?? ""),
                    getFullName(employee),
                  );

                  return (
                    <li
                      key={`${p.year}-${p.month}-${p.cutoff}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {MONTHS[p.month - 1]} {periodLabel(p)}, {p.year}
                        </p>
                        <p className="text-xs text-slate-500">
                          Net pay{" "}
                          <span className="font-semibold tabular-nums text-slate-800">
                            {peso(slip.netPay)}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                          type="button"
                          onClick={() => setOpenSlip(slip)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View
                        </button>
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                          type="button"
                          onClick={() => downloadPayslip(slip)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          PNG
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <p className="text-center text-xs text-slate-500">
            Payslips are issued by HR/Accounting. If something looks wrong,
            please contact HR.
          </p>
        </div>
      )}

      {/* Payslip preview */}
      {openSlip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-900">
                  {MONTHS[openSlip.month - 1]} {periodLabel(openSlip)},{" "}
                  {openSlip.year}
                </h2>
                <p className="text-sm text-slate-500">{openSlip.name}</p>
              </div>
              <button
                aria-label="Close"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                type="button"
                onClick={() => setOpenSlip(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Payslip"
                className="mx-auto w-full border border-slate-200 bg-white shadow-sm"
                src={payslipDataUrl(openSlip)}
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                type="button"
                onClick={() => setOpenSlip(null)}
              >
                Close
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-blue-600 to-purple-600 px-3 py-2 text-sm font-medium text-white"
                type="button"
                onClick={() => downloadPayslip(openSlip)}
              >
                <Download className="h-4 w-4" />
                Download PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
