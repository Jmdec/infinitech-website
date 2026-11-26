"use client";

// Applicant Actions menu + Invite / Send job offer / Reject dialogs.
// Place this file next to the admin careers page.tsx.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  Mail,
  Pencil,
  RefreshCw,
  Send,
  UserCheck,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ApplicantApplication = {
  id: number;
  applicant_name: string;
  applicant_email: string;
  applicant_phone?: string;
  position: string;
  status: string;
  application_data: Record<string, string>;
  resume_original_name?: string;
  interview_invitation_sent_at: string | null;
  job_offer_sent_at: string | null;
  rejection_sent_at: string | null;
};

export type ApplicantJob = {
  id: number;
  title: string;
  department: string;
  employment_type: string;
  is_active: boolean;
  description?: string;
  qualifications?: string[];
};

export type ApplicantAction = {
  kind: "invite" | "offer" | "reject";
  application: ApplicantApplication;
};

/* ------------------------------------------------------------------ */
/* Constants (edit these to match your company)                        */
/* ------------------------------------------------------------------ */

const COMPANY = "Infinitech";
const HR_SIGNOFF = "Infinitech HR";
// TODO: replace with the real Makati office address.
const MAKATI_ADDRESS = "Infinitech Office, Makati City, Metro Manila";

const OFFER_EMPLOYMENT_TYPES = [
  "Full-time",
  "Probationary",
  "Part-time",
  "Project-based",
];
const LETTERHEADS = [
  { value: "main", label: "Main letterhead (7001-6157)" },
  { value: "alt", label: "Alternate letterhead (02-8646-1636)" },
];

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 disabled:opacity-60";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const ONES = [
  "",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
];
const TENS = [
  "",
  "",
  "TWENTY",
  "THIRTY",
  "FORTY",
  "FIFTY",
  "SIXTY",
  "SEVENTY",
  "EIGHTY",
  "NINETY",
];
const SCALES = ["", "THOUSAND", "MILLION", "BILLION"];

function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} HUNDRED`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function numberToWords(value: number): string {
  let n = Math.floor(value);
  if (n === 0) return "ZERO";
  const parts: string[] = [];
  let scale = 0;
  while (n > 0 && scale < SCALES.length) {
    const chunk = n % 1000;
    if (chunk)
      parts.unshift(
        `${belowThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`,
      );
    n = Math.floor(n / 1000);
    scale += 1;
  }
  return parts.join(" ");
}

function formatPhp(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// "TWENTY THOUSAND PESOS ONLY (Php20,000.00)"
function salaryInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const pesos = Math.floor(amount);
  const cents = Math.round((amount - pesos) * 100);
  return `${numberToWords(pesos)} PESOS${cents ? ` AND ${cents}/100` : ""} ONLY (Php${formatPhp(amount)})`;
}

function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

// Weekday is computed from the date, so it can never be wrong.
function longDate(iso: string): string {
  const date = parseIsoDate(iso);
  return date
    ? date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
}

function timeLabel(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${match[2]} ${suffix}`;
}

function todayLong(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function postJson(url: string, payload: unknown): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  let result: { message?: string; errors?: Record<string, string[]> } = {};
  try {
    result = await response.json();
  } catch {
    // Non-JSON error body (e.g. a 502 page).
  }
  if (!response.ok) {
    const firstFieldError = result.errors
      ? Object.values(result.errors).flat()[0]
      : undefined;
    throw new Error(
      firstFieldError || result.message || "Request failed. Please try again.",
    );
  }
  return result.message || "Done.";
}

function sentNote(label: string, sentAt: string | null): ReactNode {
  if (!sentAt) return null;
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
      {label} was already sent on {date.toLocaleString()}. Sending again will
      email the applicant again.
    </p>
  );
}

// Email draft that regenerates from the template until the admin edits it.
function useEmailDraft(template: { subject: string; body: string }) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) {
      setSubject(template.subject);
      setBody(template.body);
    }
  }, [template.subject, template.body, touched]);

  return {
    subject,
    body,
    touched,
    setSubject: (value: string) => {
      setTouched(true);
      setSubject(value);
    },
    setBody: (value: string) => {
      setTouched(true);
      setBody(value);
    },
    reset: () => {
      setTouched(false);
      setSubject(template.subject);
      setBody(template.body);
    },
  };
}

function Field({
  label,
  required,
  hint,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`block text-sm font-semibold text-slate-700 ${className}`}
    >
      <span>
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}

function EmailEditor({ draft }: { draft: ReturnType<typeof useEmailDraft> }) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Mail size={15} aria-hidden="true" /> Email draft
        </p>
        {draft.touched && (
          <button
            type="button"
            onClick={draft.reset}
            className="text-xs font-semibold text-blue-700 underline hover:text-blue-900"
          >
            Reset to template
          </button>
        )}
      </div>
      <Field label="Subject">
        <input
          className={inputClass}
          value={draft.subject}
          onChange={(event) => draft.setSubject(event.target.value)}
        />
      </Field>
      <Field label="Message">
        <textarea
          className={`${inputClass} resize-y font-mono text-[13px] leading-6`}
          rows={10}
          value={draft.body}
          onChange={(event) => draft.setBody(event.target.value)}
        />
      </Field>
    </div>
  );
}

function DialogFooter({
  onCancel,
  sending,
  disabled,
  sendLabel,
  tone = "navy",
}: {
  onCancel: () => void;
  sending: boolean;
  disabled?: boolean;
  sendLabel: string;
  tone?: "navy" | "rose";
}) {
  return (
    <div className="sticky bottom-0 -mx-1 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white pt-4 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={sending}
        className="min-h-11 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={sending || disabled}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
          tone === "rose"
            ? "bg-rose-700 hover:bg-rose-800"
            : "bg-[#0f1a3d] hover:bg-[#1b2b58]"
        }`}
      >
        {sending ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Send size={16} aria-hidden="true" />
        )}
        {sending ? "Sending…" : sendLabel}
      </button>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
    >
      {message}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Actions dropdown                                                    */
/* ------------------------------------------------------------------ */

export function ApplicantActionsMenu({
  application,
  onView,
  onEditStatus,
  onInvite,
  onOffer,
  onReject,
  onDownload,
  onRetryNotice,
  downloading,
  retrying,
}: {
  application: ApplicantApplication;
  onView: () => void;
  onEditStatus: () => void;
  onInvite: () => void;
  onOffer: () => void;
  onReject: () => void;
  onDownload: () => void;
  onRetryNotice: () => void;
  downloading: boolean;
  retrying: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  }>({ left: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 240;
      const left = Math.max(
        8,
        Math.min(rect.right - width, window.innerWidth - width - 8),
      );
      const openUp = window.innerHeight - rect.bottom < 360 && rect.top > 360;
      setPos(
        openUp
          ? { bottom: window.innerHeight - rect.top + 4, left }
          : { top: rect.bottom + 4, left },
      );
    }
    setOpen(true);
  };

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const itemClass =
    "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="flex justify-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${application.applicant_name}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        Actions
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            width: 240,
          }}
          className="z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(onView)}
          >
            <Eye size={15} aria-hidden="true" /> View details
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(onEditStatus)}
          >
            <Pencil size={15} aria-hidden="true" /> Edit status
          </button>
          <div className="my-1.5 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(onInvite)}
          >
            <Mail size={15} aria-hidden="true" />
            <span className="flex-1">Invite for initial</span>
            {application.interview_invitation_sent_at && (
              <span className="text-[11px] text-sky-700">sent</span>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(onOffer)}
          >
            <FileText size={15} aria-hidden="true" />
            <span className="flex-1">Send job offer</span>
            {application.job_offer_sent_at && (
              <span className="text-[11px] text-emerald-700">sent</span>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${itemClass} text-rose-700 hover:bg-rose-50`}
            onClick={run(onReject)}
          >
            <XCircle size={15} aria-hidden="true" />
            <span className="flex-1">Reject</span>
            {application.rejection_sent_at && (
              <span className="text-[11px]">sent</span>
            )}
          </button>
          <div className="my-1.5 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(onDownload)}
            disabled={downloading}
          >
            {downloading ? (
              <LoaderCircle
                size={15}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Download size={15} aria-hidden="true" />
            )}
            Download resume
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(onRetryNotice)}
            disabled={retrying}
          >
            {retrying ? (
              <LoaderCircle
                size={15}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw size={15} aria-hidden="true" />
            )}
            Retry admin notification
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invite for initial                                                  */
/* ------------------------------------------------------------------ */

function InviteForm({
  application,
  onClose,
  onSent,
}: {
  application: ApplicantApplication;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [mode, setMode] = useState<"in_person" | "call">("in_person");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const location = mode === "in_person" ? MAKATI_ADDRESS : "";

  const template = useMemo(() => {
    const when = date ? longDate(date) : "[date]";
    const at = time ? timeLabel(time) : "[time]";
    const where =
      mode === "in_person"
        ? `The interview will be held in person at:\n${MAKATI_ADDRESS}`
        : `The interview will be conducted through a call. We will contact you at ${
            application.applicant_phone || "your registered contact number"
          } at the scheduled time.`;
    return {
      subject: `Initial Interview Invitation – ${application.position}`,
      body: `Dear ${application.applicant_name},\n\nThank you for applying for the ${application.position} position at ${COMPANY}. We would like to invite you to an initial interview.\n\nDate: ${when}\nTime: ${at}\nMode: ${mode === "in_person" ? "In person" : "Through call"}\n\n${where}\n\nPlease reply to this email to confirm your attendance.\n\nBest regards,\n${HR_SIGNOFF}`,
    };
  }, [application, date, time, mode]);

  const draft = useEmailDraft(template);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    if (!date || !time) {
      setError("Choose the interview date and time.");
      return;
    }
    setError("");
    setSending(true);
    try {
      const message = await postJson(
        `/api/admin/careers/applications/${application.id}/interview-invitation`,
        {
          mode,
          date,
          time,
          location,
          subject: draft.subject,
          body: draft.body,
        },
      );
      onSent(
        message === "Done."
          ? `Interview invitation sent to ${application.applicant_name}.`
          : message,
      );
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not send the invitation.",
      );
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {sentNote(
        "An interview invitation",
        application.interview_invitation_sent_at,
      )}
      <ErrorBox message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" required hint={date ? longDate(date) : undefined}>
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Time" required hint={time ? timeLabel(time) : undefined}>
          <input
            type="time"
            className={inputClass}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">Mode</p>
        <div className="mt-1.5 inline-flex rounded-xl border border-slate-300 bg-white p-1">
          {(
            [
              ["in_person", "In person"],
              ["call", "Through call"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
                mode === value
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "in_person" && (
          <p className="mt-2 text-xs text-slate-500">
            Location added automatically: {MAKATI_ADDRESS}
          </p>
        )}
      </div>
      <EmailEditor draft={draft} />
      <DialogFooter
        onCancel={onClose}
        sending={sending}
        sendLabel="Send invitation"
      />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Send job offer                                                      */
/* ------------------------------------------------------------------ */

function OfferForm({
  application,
  jobs,
  onClose,
  onSent,
}: {
  application: ApplicantApplication;
  jobs: ApplicantJob[];
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const positionOptions = useMemo(() => {
    const titles = jobs.map((job) => job.title);
    return application.position && !titles.includes(application.position)
      ? [application.position, ...titles]
      : titles;
  }, [jobs, application.position]);

  const [letterDate, setLetterDate] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
  const [salutation, setSalutation] = useState<"" | "Mr." | "Ms.">("");
  const [position, setPosition] = useState(
    application.position || positionOptions[0] || "",
  );
  const [employmentType, setEmploymentType] = useState("Full-time");
  const [salary, setSalary] = useState("");
  const [startDate, setStartDate] = useState("");
  const [meal, setMeal] = useState(false);
  const [mealText, setMealText] = useState("60php per worked day");
  const [load, setLoad] = useState(false);
  const [loadText, setLoadText] = useState("");
  const [accommodation, setAccommodation] = useState(false);
  const [commission, setCommission] = useState("");
  const [letterhead, setLetterhead] = useState("main");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const salaryNumber = Number(salary);
  const words = salary && salaryNumber > 0 ? salaryInWords(salaryNumber) : "";
  const startLong = startDate ? longDate(startDate) : "";
  const letterLong = letterDate ? longDate(letterDate) : todayLong();
  const address = application.application_data.address?.trim() || "";

  const benefits = useMemo(() => {
    const list = [
      "Paid Government Compensation",
      "13th Month Pay (pro-rated)",
      "Leave Credits",
    ];
    if (meal)
      list.push(
        `Meal Allowance (${mealText.trim() || "60php per worked day"})`,
      );
    if (load)
      list.push(
        `Load Allowance${loadText.trim() ? ` (${loadText.trim()})` : " (per month)"}`,
      );
    if (accommodation) list.push("Free Accommodation");
    if (commission.trim()) list.push(`Commission (${commission.trim()}%)`);
    return list;
  }, [meal, mealText, load, loadText, accommodation, commission]);

  const template = useMemo(
    () => ({
      subject: `Job Offer – ${position || "Position"} at ${COMPANY}`,
      body: `Dear ${salutation ? `${salutation} ` : ""}${application.applicant_name},\n\nCongratulations! We are pleased to offer you the position of ${position || "[position]"} at ${COMPANY}.\n\nPlease find your job offer letter and the job description (Annex A) attached to this email. Kindly review the terms, sign the offer letter, and send a copy back to us.\n\nWe look forward to welcoming you to the team${startLong ? ` on ${startLong}` : ""}.\n\nBest regards,\n${HR_SIGNOFF}`,
    }),
    [salutation, application.applicant_name, position, startLong],
  );
  const draft = useEmailDraft(template);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    if (!position) return setError("Choose the position.");
    if (!salutation) return setError("Choose Mr. or Ms.");
    if (!(salaryNumber > 0)) return setError("Enter the starting salary.");
    if (!startDate) return setError("Choose the starting date.");
    setError("");
    setSending(true);
    try {
      const selectedJob = jobs.find((job) => job.title === position);
      // reporting_to and signatory are NOT sent: the server resolves them
      // (department head of the selected job, and the saved signatory).
      const message = await postJson(
        `/api/admin/careers/applications/${application.id}/job-offer`,
        {
          applicant_name: application.applicant_name,
          applicant_email: application.applicant_email,
          letter_date_long: letterLong,
          salutation,
          address,
          position,
          employment_type: employmentType,
          salary: salaryNumber,
          salary_words: words,
          start_date_long: startLong,
          benefits, // string[] from the useMemo above
          letterhead,
          subject: draft.subject,
          body: draft.body,
          job: selectedJob
            ? {
                title: selectedJob.title,
                department: selectedJob.department,
                description: selectedJob.description,
                qualifications: selectedJob.qualifications,
              }
            : null,
        },
      );
      onSent(
        message === "Done."
          ? `Job offer sent to ${application.applicant_name}.`
          : message,
      );
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not send the job offer.",
      );
      setSending(false);
    }
  };

  const check =
    "flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700";

  return (
    <form onSubmit={submit} className="space-y-5">
      {sentNote("A job offer", application.job_offer_sent_at)}
      <ErrorBox message={error} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Letter date"
              hint={letterDate ? longDate(letterDate) : undefined}
            >
              <input
                type="date"
                className={inputClass}
                value={letterDate}
                onChange={(e) => setLetterDate(e.target.value)}
              />
            </Field>
            <Field label="Mr. / Ms." required>
              <select
                className={inputClass}
                value={salutation}
                onChange={(e) =>
                  setSalutation(e.target.value as "" | "Mr." | "Ms.")
                }
              >
                <option value="">Select…</option>
                <option>Mr.</option>
                <option>Ms.</option>
              </select>
            </Field>
            <Field label="Position" required className="sm:col-span-2">
              <select
                className={inputClass}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              >
                {positionOptions.map((title) => (
                  <option key={title}>{title}</option>
                ))}
              </select>
            </Field>
            <Field label="Employment type">
              <select
                className={inputClass}
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
              >
                {OFFER_EMPLOYMENT_TYPES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Starting date" required hint={startLong || undefined}>
              <input
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field
              label="Starting salary (PHP)"
              required
              hint={words || "Numbers only, e.g. 20000"}
              className="sm:col-span-2"
            >
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className={inputClass}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
            </Field>
          </div>

          <fieldset className="space-y-2.5">
            <legend className="text-sm font-semibold text-slate-700">
              Benefits
            </legend>
            <p className="text-xs text-slate-500">
              Always included: Paid Government Compensation, 13th Month
              pro-rated, Leave Credits.
            </p>
            <label className={check}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-amber-600"
                checked={meal}
                onChange={(e) => setMeal(e.target.checked)}
              />
              <span className="flex-1">
                Meal Allowance
                {meal && (
                  <input
                    className={`${inputClass} mt-2`}
                    value={mealText}
                    onChange={(e) => setMealText(e.target.value)}
                    aria-label="Meal allowance amount"
                  />
                )}
              </span>
            </label>
            <label className={check}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-amber-600"
                checked={load}
                onChange={(e) => setLoad(e.target.checked)}
              />
              <span className="flex-1">
                Load Allowance{" "}
                <span className="text-xs text-slate-500">(per month)</span>
                {load && (
                  <input
                    className={`${inputClass} mt-2`}
                    placeholder="e.g. 300php per month"
                    value={loadText}
                    onChange={(e) => setLoadText(e.target.value)}
                    aria-label="Load allowance amount"
                  />
                )}
              </span>
            </label>
            <label className={check}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-amber-600"
                checked={accommodation}
                onChange={(e) => setAccommodation(e.target.checked)}
              />
              Free Accommodation
            </label>
            <Field label="Commission % (optional)">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                className={inputClass}
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </Field>
          </fieldset>

          <Field
            label="Letterhead"
            hint="Reporting-to (department head) and signatory are filled in automatically."
          >
            <select
              className={inputClass}
              value={letterhead}
              onChange={(e) => setLetterhead(e.target.value)}
            >
              {LETTERHEADS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <aside className="h-fit space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 lg:sticky lg:top-0">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <UserCheck size={15} aria-hidden="true" /> Offer summary
          </p>
          <dl className="space-y-2 text-[13px]">
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-500">
                Date
              </dt>
              <dd>{letterLong}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-500">
                To
              </dt>
              <dd>
                {salutation ? `${salutation} ` : ""}
                {application.applicant_name}
                {address && (
                  <span className="block text-slate-500">{address}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-500">
                Position
              </dt>
              <dd>
                {position || "—"} ({employmentType})
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-500">
                Salary
              </dt>
              <dd>{words || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-500">
                Starts
              </dt>
              <dd>{startLong || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-500">
                Benefits
              </dt>
              <dd>
                <ul className="list-disc pl-4">
                  {benefits.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          <p className="border-t border-slate-200 pt-2 text-xs text-slate-500">
            Attached: offer letter (Word) + Annex A, Job Description.
          </p>
        </aside>
      </div>

      <EmailEditor draft={draft} />
      <DialogFooter
        onCancel={onClose}
        sending={sending}
        sendLabel="Send job offer"
      />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Reject                                                              */
/* ------------------------------------------------------------------ */

function RejectForm({
  application,
  onClose,
  onSent,
}: {
  application: ApplicantApplication;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const template = useMemo(
    () => ({
      subject: `Update on your application – ${application.position}`,
      body: `Dear ${application.applicant_name},\n\nThank you for your interest in the ${application.position} position at ${COMPANY} and for the time you spent applying.\n\nAfter careful consideration, we have decided not to move forward with your application at this time. This was not an easy decision, and we truly appreciate your effort.\n\nWe will keep your details on file and wish you all the best in your job search.\n\nBest regards,\n${HR_SIGNOFF}`,
    }),
    [application],
  );
  const draft = useEmailDraft(template);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setError("");
    setSending(true);
    try {
      const message = await postJson(
        `/api/admin/careers/applications/${application.id}/reject`,
        {
          subject: draft.subject,
          body: draft.body,
        },
      );
      onSent(
        message === "Done."
          ? `Rejection email sent to ${application.applicant_name}.`
          : message,
      );
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not send the rejection.",
      );
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {sentNote("A rejection email", application.rejection_sent_at)}
      <ErrorBox message={error} />
      <p className="text-sm text-slate-600">
        This emails the applicant and sets their status to Rejected.
      </p>
      <EmailEditor draft={draft} />
      <DialogFooter
        onCancel={onClose}
        sending={sending}
        sendLabel="Send rejection"
        tone="rose"
      />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog wrapper                                                      */
/* ------------------------------------------------------------------ */

const TITLES: Record<ApplicantAction["kind"], string> = {
  invite: "Invite for initial interview",
  offer: "Send job offer",
  reject: "Reject application",
};

export function ApplicantActionDialogs({
  action,
  jobs,
  onClose,
  onSent,
}: {
  action: ApplicantAction | null;
  jobs: ApplicantJob[];
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const application = action?.application ?? null;
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={`max-h-[92vh] overflow-y-auto border-slate-200 bg-white text-slate-900 sm:rounded-2xl ${
          action?.kind === "offer" ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
        <DialogHeader>
          <DialogTitle className="font-bold text-[#0f1a3d]">
            {action ? TITLES[action.kind] : "Applicant action"}
          </DialogTitle>
          <DialogDescription>
            {application
              ? `${application.applicant_name} · ${application.position} · ${application.applicant_email}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {action && application && action.kind === "invite" && (
          <InviteForm
            key={`invite-${application.id}`}
            application={application}
            onClose={onClose}
            onSent={onSent}
          />
        )}
        {action && application && action.kind === "offer" && (
          <OfferForm
            key={`offer-${application.id}`}
            application={application}
            jobs={jobs}
            onClose={onClose}
            onSent={onSent}
          />
        )}
        {action && application && action.kind === "reject" && (
          <RejectForm
            key={`reject-${application.id}`}
            application={application}
            onClose={onClose}
            onSent={onSent}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
