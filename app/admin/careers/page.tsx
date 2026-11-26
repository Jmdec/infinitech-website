//admin career page

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  Eye,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UsersRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApplicantActionDialogs,
  ApplicantActionsMenu,
  type ApplicantAction,
} from "./CareerApplicantActions";

type JobListing = {
  id: number;
  title: string;
  department: string;
  employment_type: string;
  description: string;
  qualifications: string[];
  is_active: boolean;
};

type Application = {
  id: number;
  reference: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string;
  position: string;
  status: string;
  application_data: Record<string, string>;
  resume_original_name: string;
  attachments: { original_name: string }[];
  admin_notified_at: string | null;
  interview_invitation_sent_at: string | null;
  job_offer_sent_at: string | null;
  rejection_sent_at: string | null;
  created_at: string;
};

type ListingForm = {
  title: string;
  department: string;
  employment_type: string;
  description: string;
  qualifications: string;
  is_active: boolean;
};

type ApiResult = {
  message?: string;
  data?: unknown;
  notifications_pending?: boolean;
};

type TabKey = "postings" | "applicants";
type ApplicationStatus =
  | "new"
  | "reviewing"
  | "interview"
  | "offered"
  | "hired"
  | "rejected";

const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "interview", label: "Invited for Initial" },
  { value: "offered", label: "Job Offered" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" },
];

// Keep these in sync with the options on the public careers application form.
const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Internship",
  "Project-based",
];

const emptyListing: ListingForm = {
  title: "",
  department: "",
  employment_type: "Full-time",
  description: "",
  qualifications: "",
  is_active: true,
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10";
const SKELETON_ROWS = [0, 1, 2, 3, 4];

// Parse a JSON body without throwing on HTML or empty error responses (e.g. a 502 page).
async function readJson(response: Response): Promise<ApiResult> {
  try {
    return (await response.json()) as ApiResult;
  } catch {
    return {};
  }
}

// Applicants control these URLs, so only allow http(s) links. This blocks javascript: links.
function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Keeps a saved value selectable even if it is no longer in the standard options.
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current)
    ? [...options, current]
    : options;
}

function display(value: unknown): string {
  if (typeof value === "string") return value.trim() || "—";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string | number =>
        typeof item === "string" ||
        (typeof item === "number" && Number.isFinite(item)),
    );
    return items.map(String).join(", ") || "—";
  }
  return "—";
}

function formatApplicationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function statusLabel(status: string): string {
  return (
    APPLICATION_STATUSES.find((item) => item.value === status)?.label ?? status
  );
}

function isApplicationStatus(status: string): status is ApplicationStatus {
  return APPLICATION_STATUSES.some((item) => item.value === status);
}

function normalizeJob(job: JobListing): JobListing {
  return {
    ...job,
    qualifications: Array.isArray(job.qualifications) ? job.qualifications : [],
  };
}

function normalizeApplication(application: Application): Application {
  return {
    ...application,
    application_data:
      application.application_data &&
      typeof application.application_data === "object"
        ? application.application_data
        : {},
    attachments: Array.isArray(application.attachments)
      ? application.attachments
      : [],
    job_offer_sent_at: application.job_offer_sent_at ?? null,
    rejection_sent_at: application.rejection_sent_at ?? null,
  };
}

function ExternalLink({ label, href }: { label: string; href: string }) {
  const safe = safeHttpUrl(href);
  return (
    <>
      {label}:{" "}
      {safe ? (
        <a
          className="text-blue-800 underline"
          href={safe}
          target="_blank"
          rel="noreferrer noopener"
        >
          {href}
        </a>
      ) : (
        <span>{href}</span>
      )}{" "}
    </>
  );
}

function Detail({
  label,
  children,
  wide = false,
  block = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  block?: boolean;
}) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-sm text-slate-800 ${
          block
            ? "whitespace-pre-wrap rounded-xl bg-slate-50 p-3 leading-6 text-slate-700"
            : ""
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

// Small "sent" badges shown under the status pill.
function SentBadges({ application }: { application: Application }) {
  const badges: { label: string; sentAt: string | null; tone: string }[] = [
    {
      label: "Invite sent",
      sentAt: application.interview_invitation_sent_at,
      tone: "bg-sky-50 text-sky-800",
    },
    {
      label: "Offer sent",
      sentAt: application.job_offer_sent_at,
      tone: "bg-emerald-50 text-emerald-800",
    },
    {
      label: "Rejection sent",
      sentAt: application.rejection_sent_at,
      tone: "bg-rose-50 text-rose-800",
    },
  ];
  const visible = badges.filter((badge) => badge.sentAt);
  if (visible.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {visible.map((badge) => (
        <span
          key={badge.label}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}
          title={`Sent ${new Date(badge.sentAt as string).toLocaleString()}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

export default function CareersAdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("postings");
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  // Applicants tab filter: "All" or an exact position title.
  const [positionFilter, setPositionFilter] = useState("All");
  const [form, setForm] = useState<ListingForm>(emptyListing);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [listingDialogOpen, setListingDialogOpen] = useState(false);
  const [viewingJob, setViewingJob] = useState<JobListing | null>(null);
  const [viewingApplication, setViewingApplication] =
    useState<Application | null>(null);
  const [editingApplication, setEditingApplication] =
    useState<Application | null>(null);
  const [applicationStatusDraft, setApplicationStatusDraft] =
    useState<ApplicationStatus>("new");
  const [savingApplicationStatus, setSavingApplicationStatus] = useState(false);
  const [applicationStatusError, setApplicationStatusError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [retryingNotificationsId, setRetryingNotificationsId] = useState<
    number | null
  >(null);
  // Invite for initial / Reject / Send job offer dialogs (see CareerApplicantActions.tsx).
  const [actionDialog, setActionDialog] = useState<ApplicantAction | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    postings: null,
    applicants: null,
  });

  const setField = <K extends keyof ListingForm>(
    key: K,
    value: ListingForm[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  // showSpinner is false for refreshes after a save or delete, so the lists don't flash.
  const loadData = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setError("");
      try {
        const [jobsResponse, applicationsResponse] = await Promise.all([
          fetch("/api/admin/careers/jobs", { cache: "no-store" }),
          fetch("/api/admin/careers/applications", { cache: "no-store" }),
        ]);
        const responses = [jobsResponse, applicationsResponse];
        if (responses.some((response) => response.status === 401)) {
          router.replace("/admin/login");
          return;
        }
        if (responses.some((response) => response.status === 403)) {
          throw new Error(
            "You need Careers & Applications permission to access this page.",
          );
        }
        const [jobsResult, applicationsResult] = await Promise.all([
          readJson(jobsResponse),
          readJson(applicationsResponse),
        ]);
        if (responses.some((response) => !response.ok)) {
          throw new Error(
            jobsResult.message ||
              applicationsResult.message ||
              "Could not load career listings and applications.",
          );
        }
        setJobs(
          Array.isArray(jobsResult.data)
            ? (jobsResult.data as JobListing[]).map(normalizeJob)
            : [],
        );
        setApplications(
          Array.isArray(applicationsResult.data)
            ? (applicationsResult.data as Application[]).map(
                normalizeApplication,
              )
            : [],
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load career listings and applications.",
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetForm = () => {
    setForm(emptyListing);
    setEditingId(null);
    setListingDialogOpen(false);
    setError("");
  };

  const saveListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    setNotice("");

    const qualifications = form.qualifications
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const title = form.title.trim();
    const department = form.department.trim();
    const description = form.description.trim();

    // `required` accepts whitespace-only text, so check the trimmed values too.
    if (!title || !department || !description) {
      setError("Title, department, and description can't be blank.");
      return;
    }
    if (qualifications.length === 0) {
      setError("Add at least one skill or qualification.");
      return;
    }
    setSaving(true);
    const wasEditing = editingId !== null;
    const body = {
      ...form,
      title,
      department,
      description,
      qualifications,
    };
    try {
      const response = await fetch(
        editingId
          ? `/api/admin/careers/jobs/${editingId}`
          : "/api/admin/careers/jobs",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await readJson(response);
      if (!response.ok) {
        throw new Error(result.message || "Could not save this job listing.");
      }
      resetForm();
      setNotice(wasEditing ? "Job listing updated." : "Job listing created.");
      await loadData(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this job listing.",
      );
    } finally {
      setSaving(false);
    }
  };

  const editListing = (job: JobListing) => {
    setError("");
    setNotice("");
    setEditingId(job.id);
    setForm({
      title: job.title,
      department: job.department,
      employment_type: job.employment_type,
      description: job.description,
      qualifications: job.qualifications.join("\n"),
      is_active: job.is_active,
    });
    setListingDialogOpen(true);
  };

  const editApplicationStatus = (application: Application) => {
    setError("");
    setNotice("");
    setApplicationStatusError("");
    setApplicationStatusDraft(
      isApplicationStatus(application.status) ? application.status : "new",
    );
    setEditingApplication(application);
  };

  const saveApplicationStatus = async () => {
    if (!editingApplication || savingApplicationStatus) return;
    setApplicationStatusError("");
    setNotice("");
    setSavingApplicationStatus(true);
    try {
      const response = await fetch(
        `/api/admin/careers/applications/${editingApplication.id}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: applicationStatusDraft }),
        },
      );
      const result = await readJson(response);
      if (!response.ok) {
        throw new Error(
          result.message || "Could not update the application status.",
        );
      }
      setApplications((current) =>
        current.map((application) =>
          application.id === editingApplication.id
            ? { ...application, status: applicationStatusDraft }
            : application,
        ),
      );
      setNotice(
        `Application status updated to ${statusLabel(applicationStatusDraft)}.`,
      );
      setEditingApplication(null);
    } catch (saveError) {
      setApplicationStatusError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update the application status.",
      );
    } finally {
      setSavingApplicationStatus(false);
    }
  };

  const deleteListing = async (job: JobListing) => {
    if (deletingId !== null) return;
    if (!window.confirm(`Delete the ${job.title} listing?`)) return;
    setError("");
    setNotice("");
    setDeletingId(job.id);
    try {
      const response = await fetch(`/api/admin/careers/jobs/${job.id}`, {
        method: "DELETE",
      });
      const result = await readJson(response);
      if (!response.ok) {
        throw new Error(result.message || "Could not delete this listing.");
      }
      // Don't leave a deleted listing in the editor, or the next save would fail.
      if (editingId === job.id) resetForm();
      setNotice("Job listing deleted.");
      await loadData(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete this listing.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const downloadResume = async (application: Application) => {
    if (downloadingId !== null) return;
    setError("");
    setDownloadingId(application.id);
    try {
      const response = await fetch(
        `/api/admin/careers/applications/${application.id}/download`,
      );
      if (!response.ok) {
        const result = await readJson(response);
        throw new Error(result.message || "Could not download this resume.");
      }
      const file = await response.blob();
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        application.resume_original_name || `resume-${application.reference}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Could not download this resume.",
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const retryNotifications = async (application: Application) => {
    if (retryingNotificationsId !== null) return;
    setError("");
    setNotice("");
    setRetryingNotificationsId(application.id);
    try {
      const response = await fetch(
        `/api/admin/careers/applications/${application.id}/notifications`,
        { method: "PUT" },
      );
      const result = await readJson(response);
      if (!response.ok) {
        throw new Error(
          result.message || "Could not retry application emails.",
        );
      }
      setNotice(
        result.notifications_pending
          ? `The admin notification is still pending for ${application.applicant_name}. Check mail delivery and Career Directory access, then retry.`
          : `New application notification sent to eligible admins for ${application.applicant_name}.`,
      );
      await loadData(false);
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "Could not retry application emails.",
      );
    } finally {
      setRetryingNotificationsId(null);
    }
  };

  // Builds the Actions menu for one applicant. Used by both the table and the mobile cards.
  const renderActionsMenu = (application: Application) => (
    <ApplicantActionsMenu
      application={application}
      onView={() => setViewingApplication(application)}
      onEditStatus={() => editApplicationStatus(application)}
      onInvite={() => {
        setNotice("");
        setActionDialog({ kind: "invite", application });
      }}
      onOffer={() => {
        setNotice("");
        setActionDialog({ kind: "offer", application });
      }}
      onReject={() => {
        setNotice("");
        setActionDialog({ kind: "reject", application });
      }}
      onDownload={() => void downloadResume(application)}
      onRetryNotice={() => void retryNotifications(application)}
      downloading={downloadingId === application.id}
      retrying={retryingNotificationsId === application.id}
    />
  );

  const pendingEmailCount = applications.filter(
    (application) => !application.admin_notified_at,
  ).length;

  const activeJobCount = jobs.filter((job) => job.is_active).length;

  // Applicants grouped by the position text saved on each application.
  const positionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const application of applications) {
      counts.set(
        application.position,
        (counts.get(application.position) ?? 0) + 1,
      );
    }
    return Array.from(counts, ([position, count]) => ({
      position,
      count,
    })).sort((a, b) => a.position.localeCompare(b.position));
  }, [applications]);

  // Falls back to "All" if the chosen position no longer has applicants.
  const activePosition = positionOptions.some(
    (option) => option.position === positionFilter,
  )
    ? positionFilter
    : "All";

  const visibleApplications = useMemo(
    () =>
      activePosition === "All"
        ? applications
        : applications.filter(
            (application) => application.position === activePosition,
          ),
    [applications, activePosition],
  );

  // Jump from a job posting to its applicants.
  const viewApplicants = (position: string) => {
    setPositionFilter(position);
    setActiveTab("applicants");
  };

  const applicantCountButton = (title: string) => {
    const count =
      positionOptions.find((option) => option.position === title)?.count ?? 0;
    return count > 0 ? (
      <button
        type="button"
        onClick={() => viewApplicants(title)}
        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
      >
        <UsersRound size={12} aria-hidden="true" />
        {count} applicant{count === 1 ? "" : "s"}
      </button>
    ) : (
      <span className="text-xs text-slate-400">No applicants</span>
    );
  };

  // Live subtitle in the banner; follows the active tab.
  const subtitle = loading
    ? "Loading…"
    : activeTab === "postings"
      ? `${jobs.length} job posting${jobs.length === 1 ? "" : "s"} · ${activeJobCount} active`
      : `${visibleApplications.length} applicant${visibleApplications.length === 1 ? "" : "s"}${activePosition !== "All" ? ` for ${activePosition}` : ""} · ${pendingEmailCount} pending admin notification${pendingEmailCount === 1 ? "" : "s"}`;

  const startNewListing = () => {
    setActiveTab("postings");
    resetForm();
    setError("");
    setNotice("");
    setListingDialogOpen(true);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "postings", label: "Job postings" },
    { key: "applicants", label: "Applicants" },
  ];

  // Arrow keys, Home and End move between tabs, as in a standard tab list.
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.key === activeTab);
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextKey = tabs[nextIndex].key;
    setActiveTab(nextKey);
    tabRefs.current[nextKey]?.focus();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full">
        {/* Pill tabs */}
        <div
          role="tablist"
          aria-label="Careers sections"
          onKeyDown={onTabKeyDown}
          className="mb-4 flex flex-wrap gap-2"
        >
          {tabs.map(({ key, label }) => {
            const selected = activeTab === key;
            return (
              <button
                key={key}
                ref={(node) => {
                  tabRefs.current[key] = node;
                }}
                type="button"
                role="tab"
                id={`careers-tab-${key}`}
                aria-selected={selected}
                aria-controls={`careers-panel-${key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(key)}
                className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60 ${
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {label}
                {key === "applicants" && pendingEmailCount > 0 && (
                  <span
                    className="h-2 w-2 rounded-full bg-amber-400"
                    role="img"
                    aria-label={`${pendingEmailCount} with pending admin notifications`}
                    title={`${pendingEmailCount} with pending admin notifications`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Gradient banner */}
        <section className="mb-6 flex flex-wrap items-center justify-between gap-5 rounded-3xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-6 py-7 text-white shadow-lg sm:px-10">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              {activeTab === "postings" ? (
                <BriefcaseBusiness size={28} aria-hidden="true" />
              ) : (
                <UsersRound size={28} aria-hidden="true" />
              )}
            </span>
            <div>
              <h1 className="text-3xl font-bold leading-tight">
                Careers &amp; Applications
              </h1>
              <p className="mt-0.5 text-sm text-white/80">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startNewListing}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-sky-800 shadow-sm hover:bg-sky-50"
            >
              <Plus size={16} aria-hidden="true" />
              Add position
            </button>
            <a
              href="/careers"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20"
            >
              <BriefcaseBusiness size={16} aria-hidden="true" />
              View careers page
            </a>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                aria-hidden="true"
                className={loading ? "animate-spin" : undefined}
              />
              Refresh
            </button>
          </div>
        </section>

        {error && !listingDialogOpen && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            {notice}
          </div>
        )}

        {/* Job postings */}
        <div
          role="tabpanel"
          id="careers-panel-postings"
          aria-labelledby="careers-tab-postings"
          hidden={activeTab !== "postings"}
        >
          <div className="space-y-6">
            {/* Add / edit dialog */}
            <Dialog
              open={listingDialogOpen}
              onOpenChange={(open) => {
                if (open) setListingDialogOpen(true);
                else if (!saving) resetForm();
              }}
            >
              <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-200 bg-white p-0 text-slate-900 sm:rounded-2xl">
                <div className="p-5 sm:p-6">
                  <DialogHeader className="mb-5 flex-row items-center gap-3 space-y-0 text-left">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
                      {editingId ? <Pencil size={19} /> : <Plus size={20} />}
                    </span>
                    <div>
                      <DialogTitle className="font-bold text-[#0f1a3d]">
                        {editingId ? "Edit position" : "Add a position"}
                      </DialogTitle>
                      <DialogDescription className="text-sm text-slate-500">
                        Manage active job listings
                      </DialogDescription>
                    </div>
                  </DialogHeader>

                  {error && listingDialogOpen && (
                    <div
                      role="alert"
                      className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                    >
                      {error}
                    </div>
                  )}

                  <form onSubmit={saveListing} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                        Position title
                        <input
                          className={inputClass}
                          required
                          maxLength={160}
                          value={form.title}
                          onChange={(event) =>
                            setField("title", event.target.value)
                          }
                        />
                      </label>
                      <label className="block text-sm font-semibold text-slate-700">
                        Department
                        <input
                          className={inputClass}
                          required
                          maxLength={120}
                          value={form.department}
                          onChange={(event) =>
                            setField("department", event.target.value)
                          }
                        />
                      </label>
                      <label className="block text-sm font-semibold text-slate-700">
                        Employment type
                        <select
                          className={inputClass}
                          value={form.employment_type}
                          onChange={(event) =>
                            setField("employment_type", event.target.value)
                          }
                        >
                          {withCurrent(
                            EMPLOYMENT_TYPES,
                            form.employment_type,
                          ).map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="block text-sm font-semibold text-slate-700">
                      Short description
                      <textarea
                        className={`${inputClass} resize-y`}
                        required
                        maxLength={3000}
                        rows={4}
                        value={form.description}
                        onChange={(event) =>
                          setField("description", event.target.value)
                        }
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                      Skills or qualifications
                      <textarea
                        className={`${inputClass} resize-y`}
                        required
                        rows={4}
                        value={form.qualifications}
                        onChange={(event) =>
                          setField("qualifications", event.target.value)
                        }
                        placeholder="Enter one qualification per line"
                      />
                    </label>

                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-amber-600"
                        checked={form.is_active}
                        onChange={(event) =>
                          setField("is_active", event.target.checked)
                        }
                      />
                      Show this position on the careers page
                    </label>

                    <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6">
                      <button
                        type="button"
                        onClick={resetForm}
                        disabled={saving}
                        className="min-h-11 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        style={{
                          backgroundColor: "#0f1a3d",
                          color: "#ffffff",
                          borderColor: "transparent",
                        }}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                      >
                        {saving ? (
                          <LoaderCircle size={16} className="animate-spin" />
                        ) : editingId ? (
                          <Pencil size={16} />
                        ) : (
                          <Plus size={16} />
                        )}
                        {saving
                          ? "Saving…"
                          : editingId
                            ? "Save changes"
                            : "Create listing"}
                      </button>
                    </div>
                  </form>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog
              open={viewingJob !== null}
              onOpenChange={(open) => {
                if (!open) setViewingJob(null);
              }}
            >
              <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-200 bg-white text-slate-900 sm:rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="font-bold text-[#0f1a3d]">
                    {viewingJob?.title ?? "Job listing"}
                  </DialogTitle>
                  <DialogDescription>Job listing details</DialogDescription>
                </DialogHeader>
                {viewingJob && (
                  <div className="space-y-5">
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <Detail label="Department">
                        {viewingJob.department}
                      </Detail>
                      <Detail label="Employment type">
                        {viewingJob.employment_type}
                      </Detail>
                      <Detail label="Visibility">
                        {viewingJob.is_active ? "Active" : "Hidden"}
                      </Detail>
                      <Detail label="Qualifications" wide>
                        {viewingJob.qualifications.length
                          ? viewingJob.qualifications.join(", ")
                          : "—"}
                      </Detail>
                      <Detail label="Description" wide block>
                        {viewingJob.description}
                      </Detail>
                    </dl>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setViewingJob(null)}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const job = viewingJob;
                          setViewingJob(null);
                          editListing(job);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#0f1a3d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b2b58]"
                      >
                        <Pencil size={15} aria-hidden="true" />
                        Edit listing
                      </button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Job listings */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <div
                  role="status"
                  aria-label="Loading job listings"
                  aria-busy="true"
                >
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-[760px]">
                      <thead>
                        <tr className="border-b border-slate-200">
                          {["w-40", "w-32", "w-28", "w-20", "w-24"].map(
                            (width, index) => (
                              <th key={index} className="px-4 py-3">
                                <div
                                  className={`h-3 ${width} animate-pulse rounded bg-slate-200`}
                                />
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {SKELETON_ROWS.map((row) => (
                          <tr key={row}>
                            <td className="px-4 py-5">
                              <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
                            </td>
                            <td className="px-4 py-5">
                              <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
                            </td>
                            <td className="px-4 py-5">
                              <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                            </td>
                            <td className="px-4 py-5">
                              <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
                            </td>
                            <td className="px-4 py-5">
                              <div className="ml-auto h-8 w-36 animate-pulse rounded-lg bg-slate-100" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="grid gap-3 lg:hidden">
                    {SKELETON_ROWS.slice(0, 3).map((row) => (
                      <li
                        key={row}
                        className="animate-pulse space-y-4 rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="h-4 w-2/3 rounded bg-slate-200" />
                          <div className="h-6 w-16 rounded-full bg-slate-100" />
                        </div>
                        <div className="h-3 w-1/3 rounded bg-slate-100" />
                        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                          <div className="h-8 w-16 rounded-lg bg-slate-100" />
                          <div className="h-8 w-16 rounded-lg bg-slate-100" />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : jobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                    <BriefcaseBusiness size={22} aria-hidden="true" />
                  </span>
                  <p className="mt-4 font-semibold text-[#0f1a3d]">
                    No job listings yet
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
                    New positions will appear on the public careers page once
                    you add them.
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead>
                        <tr>
                          <th className="h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Position
                          </th>
                          <th className="h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Department
                          </th>
                          <th className="h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Employment type
                          </th>
                          <th className="h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Status
                          </th>
                          <th className="h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((job) => (
                          <tr
                            key={job.id}
                            className="border-b border-slate-100 text-slate-700 transition-colors hover:bg-blue-50/40 last:border-0"
                          >
                            <td className="px-4 py-3.5 font-semibold text-slate-900">
                              <span className="block">{job.title}</span>
                              <span className="mt-1 block font-normal">
                                {applicantCountButton(job.title)}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-slate-600">
                              {job.department}
                            </td>
                            <td className="px-4 py-3.5 text-slate-600">
                              {job.employment_type}
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${job.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                              >
                                {job.is_active ? "Active" : "Hidden"}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setViewingJob(job)}
                                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 shadow-none hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                  title="View job listing"
                                >
                                  <Eye size={14} aria-hidden="true" />
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => editListing(job)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 shadow-none hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                                  aria-label={`Edit ${job.title}`}
                                  title="Edit job listing"
                                >
                                  <Pencil size={16} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteListing(job)}
                                  disabled={deletingId !== null}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 shadow-none hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                  aria-label={`Delete ${job.title}`}
                                  title="Delete job listing"
                                >
                                  {deletingId === job.id ? (
                                    <LoaderCircle
                                      size={15}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Trash2 size={16} />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="grid gap-3 lg:hidden">
                    {jobs.map((job) => (
                      <li
                        key={job.id}
                        className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-amber-300"
                      >
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 break-words font-semibold text-[#0f1a3d]">
                              {job.title}
                            </p>
                            <span
                              className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                job.is_active
                                  ? "bg-emerald-50 text-emerald-800"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {job.is_active ? "Active" : "Hidden"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {job.department}
                          </p>
                          <div className="mt-2">
                            {applicantCountButton(job.title)}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1">
                              {job.employment_type}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setViewingJob(job)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            aria-label={`View ${job.title}`}
                          >
                            <Eye size={14} aria-hidden="true" />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => editListing(job)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-400 hover:bg-amber-50"
                            aria-label={`Edit ${job.title}`}
                          >
                            <Pencil size={14} aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteListing(job)}
                            disabled={deletingId !== null}
                            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                            aria-label={`Delete ${job.title}`}
                          >
                            {deletingId === job.id ? (
                              <LoaderCircle
                                size={15}
                                className="animate-spin"
                              />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </div>

        {/* Applicants */}
        <div
          role="tabpanel"
          id="careers-panel-applicants"
          aria-labelledby="careers-tab-applicants"
          hidden={activeTab !== "applicants"}
        >
          {/* Filter by position */}
          {applications.length > 0 && (
            <div
              className="mb-4 flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Filter applicants by position"
            >
              {[
                { position: "All", count: applications.length },
                ...positionOptions,
              ].map(({ position, count }) => {
                const on = activePosition === position;
                return (
                  <button
                    key={position}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPositionFilter(position)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60 ${
                      on
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {position === "All" ? "All positions" : position}
                    <span
                      className={`tabular-nums ${on ? "text-blue-100" : "text-slate-400"}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div
                role="status"
                aria-label="Loading applications"
                aria-busy="true"
              >
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[980px]">
                    <thead>
                      <tr className="border-b border-slate-200">
                        {["w-40", "w-28", "w-20", "w-20", "w-24", "w-24"].map(
                          (width, index) => (
                            <th key={index} className="px-4 py-3">
                              <div
                                className={`h-3 ${width} animate-pulse rounded bg-slate-200`}
                              />
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {SKELETON_ROWS.map((row) => (
                        <tr key={row}>
                          <td className="px-4 py-5">
                            <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
                            <div className="mt-2 h-3 w-44 animate-pulse rounded bg-slate-100" />
                          </td>
                          <td className="px-4 py-5">
                            <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
                          </td>
                          <td className="px-4 py-5">
                            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
                          </td>
                          <td className="px-4 py-5">
                            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                          </td>
                          <td className="px-4 py-5">
                            <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
                          </td>
                          <td className="px-4 py-5">
                            <div className="ml-auto h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="grid items-start gap-4 lg:hidden">
                  {SKELETON_ROWS.slice(0, 3).map((row) => (
                    <li
                      key={row}
                      className="animate-pulse space-y-4 rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-full bg-slate-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-2/3 rounded bg-slate-200" />
                          <div className="h-3 w-4/5 rounded bg-slate-100" />
                        </div>
                      </div>
                      <div className="h-3 w-1/2 rounded bg-slate-100" />
                      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                        <div className="h-4 rounded bg-slate-100" />
                        <div className="h-4 rounded bg-slate-100" />
                        <div className="h-12 rounded bg-slate-100" />
                        <div className="h-12 rounded bg-slate-100" />
                      </div>
                      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                        <div className="h-8 w-16 rounded-lg bg-slate-100" />
                        <div className="h-8 w-24 rounded-lg bg-slate-100" />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : applications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-800">
                  <UsersRound size={22} aria-hidden="true" />
                </span>
                <p className="mt-4 font-semibold text-[#0f1a3d]">
                  No applications yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
                  New applications will show up here as soon as they are
                  submitted.
                </p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead>
                      <tr>
                        <th className="h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Applicant
                        </th>
                        <th className="h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Position
                        </th>
                        <th className="h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Status
                        </th>
                        <th className="h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Applied
                        </th>
                        <th className="h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleApplications.map((application) => {
                        const createdAt = new Date(application.created_at);
                        return (
                          <tr
                            key={application.id}
                            className="border-b border-slate-100 text-slate-700 transition-colors hover:bg-blue-50/40 last:border-0"
                          >
                            <td className="min-w-[220px] px-4 py-3.5">
                              <p className="font-semibold text-slate-900">
                                {application.applicant_name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {application.applicant_email}
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-slate-600">
                              {application.position}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                                  {statusLabel(application.status)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    editApplicationStatus(application)
                                  }
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                                  aria-label={`Edit status for ${application.applicant_name}`}
                                  title="Edit application status"
                                >
                                  <Pencil size={14} aria-hidden="true" />
                                </button>
                              </div>
                              <SentBadges application={application} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                              {Number.isNaN(createdAt.getTime())
                                ? "—"
                                : createdAt.toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })}
                            </td>
                            <td className="px-4 py-3.5">
                              {renderActionsMenu(application)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <ul className="grid items-start gap-4 lg:hidden">
                  {visibleApplications.map((application) => {
                    const details = application.application_data;
                    const createdAt = new Date(application.created_at);
                    const initials =
                      application.applicant_name
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase() || "?";
                    return (
                      <li
                        key={application.id}
                        className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm"
                      >
                        {/* Header */}
                        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
                          <span
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0f1a3d] text-sm font-bold text-amber-300"
                            aria-hidden="true"
                          >
                            {initials}
                          </span>

                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold text-[#0f1a3d]">
                              {application.applicant_name}
                            </h3>
                            <p className="truncate text-xs text-slate-500">
                              {application.applicant_email}
                            </p>
                          </div>

                          <div className="flex min-w-0 flex-col sm:items-end sm:text-right">
                            <p className="text-sm font-medium text-blue-900">
                              {application.position}
                            </p>
                            <div className="mt-1 flex items-center gap-1">
                              <span className="inline-flex w-fit rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                                {statusLabel(application.status)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  editApplicationStatus(application)
                                }
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                                aria-label={`Edit status for ${application.applicant_name}`}
                                title="Edit application status"
                              >
                                <Pencil size={14} aria-hidden="true" />
                              </button>
                            </div>
                            <SentBadges application={application} />
                            <p className="mt-1 text-xs text-slate-500">
                              {Number.isNaN(createdAt.getTime())
                                ? "—"
                                : createdAt.toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })}
                            </p>
                          </div>
                        </div>

                        {/* Details */}
                        <dl className="grid gap-x-6 gap-y-4 border-t border-slate-100 px-4 py-4 sm:grid-cols-2 sm:px-5">
                          <Detail label="Contact">
                            {application.applicant_phone}
                          </Detail>
                          <Detail label="City">
                            {display(details.cityProvince)}
                          </Detail>
                          <Detail label="Experience">
                            {display(details.yearsExperience)}
                          </Detail>
                          <Detail label="Skills" wide>
                            {display(details.skills)}
                          </Detail>
                          <Detail label="Introduction" wide block>
                            {display(details.introduction)}
                          </Detail>
                          <Detail label="Why Infinitech" wide block>
                            {display(details.whyInfinitech)}
                          </Detail>
                          {(details.portfolioUrl || details.linkedinUrl) && (
                            <Detail label="Links" wide>
                              <div className="space-y-1 break-all">
                                {details.portfolioUrl && (
                                  <p>
                                    <ExternalLink
                                      label="Portfolio"
                                      href={details.portfolioUrl}
                                    />
                                  </p>
                                )}
                                {details.linkedinUrl && (
                                  <p>
                                    <ExternalLink
                                      label="LinkedIn"
                                      href={details.linkedinUrl}
                                    />
                                  </p>
                                )}
                              </div>
                            </Detail>
                          )}
                          {application.attachments.length > 0 && (
                            <Detail label="Supporting files" wide>
                              {application.attachments
                                .map((file) => file.original_name)
                                .join(", ")}
                            </Detail>
                          )}
                        </dl>

                        {/* Actions */}
                        <div className="mt-auto flex justify-end rounded-b-2xl border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
                          {renderActionsMenu(application)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
      <Dialog
        open={viewingApplication !== null}
        onOpenChange={(open) => {
          if (!open) setViewingApplication(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-slate-200 bg-white text-slate-900 sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold text-[#0f1a3d]">
              {viewingApplication?.applicant_name ?? "Application"}
            </DialogTitle>
            <DialogDescription>
              {viewingApplication
                ? `${viewingApplication.reference} · ${viewingApplication.position} · Applied ${formatApplicationDate(viewingApplication.created_at)}`
                : "Application details"}
            </DialogDescription>
          </DialogHeader>
          {viewingApplication && (
            <>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail label="Email">
                  {viewingApplication.applicant_email}
                </Detail>
                <Detail label="Contact">
                  {viewingApplication.applicant_phone}
                </Detail>
                <Detail label="Address">
                  {display(viewingApplication.application_data.address)}
                </Detail>
                <Detail label="City / Province">
                  {display(viewingApplication.application_data.cityProvince)}
                </Detail>
                <Detail label="Application status">
                  {statusLabel(viewingApplication.status)}
                </Detail>
                <Detail label="Employment type">
                  {display(viewingApplication.application_data.employmentType)}
                </Detail>
                <Detail label="Expected salary">
                  {display(viewingApplication.application_data.expectedSalary)}
                </Detail>
                <Detail label="Education">
                  {display(viewingApplication.application_data.education)}
                </Detail>
                <Detail label="School / University">
                  {display(viewingApplication.application_data.school)}
                </Detail>
                <Detail label="Course / Degree">
                  {display(viewingApplication.application_data.course)}
                </Detail>
                <Detail label="Graduation year">
                  {display(viewingApplication.application_data.graduationYear)}
                </Detail>
                <Detail label="Employment status">
                  {display(
                    viewingApplication.application_data.employmentStatus,
                  )}
                </Detail>
                <Detail label="Reason for unemployment">
                  {display(
                    viewingApplication.application_data.unemploymentReason,
                  )}
                </Detail>
                <Detail label="Experience">
                  {display(viewingApplication.application_data.yearsExperience)}
                </Detail>
                <Detail label="Previous company">
                  {display(viewingApplication.application_data.previousCompany)}
                </Detail>
                <Detail label="Skills" wide>
                  {display(viewingApplication.application_data.skills)}
                </Detail>
                <Detail label="Introduction" wide block>
                  {display(viewingApplication.application_data.introduction)}
                </Detail>
                <Detail label="Why Infinitech" wide block>
                  {display(viewingApplication.application_data.whyInfinitech)}
                </Detail>
                {(viewingApplication.application_data.portfolioUrl ||
                  viewingApplication.application_data.linkedinUrl) && (
                  <Detail label="Links" wide>
                    <div className="space-y-1 break-all">
                      {viewingApplication.application_data.portfolioUrl && (
                        <p>
                          <ExternalLink
                            label="Portfolio"
                            href={
                              viewingApplication.application_data.portfolioUrl
                            }
                          />
                        </p>
                      )}
                      {viewingApplication.application_data.linkedinUrl && (
                        <p>
                          <ExternalLink
                            label="LinkedIn"
                            href={
                              viewingApplication.application_data.linkedinUrl
                            }
                          />
                        </p>
                      )}
                    </div>
                  </Detail>
                )}
                <Detail label="Resume" wide>
                  {viewingApplication.resume_original_name}
                </Detail>
                {viewingApplication.attachments.length > 0 && (
                  <Detail label="Supporting files" wide>
                    {viewingApplication.attachments
                      .map((file) => file.original_name)
                      .join(", ")}
                  </Detail>
                )}
              </dl>
              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setViewingApplication(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const application = viewingApplication;
                    setViewingApplication(null);
                    editApplicationStatus(application);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0f1a3d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b2b58]"
                >
                  <Pencil size={15} aria-hidden="true" />
                  Edit status
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={editingApplication !== null}
        onOpenChange={(open) => {
          if (!open && !savingApplicationStatus) setEditingApplication(null);
        }}
      >
        <DialogContent className="max-w-lg border-slate-200 bg-white text-slate-900 sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold text-[#0f1a3d]">
              Edit application status
            </DialogTitle>
            <DialogDescription>
              {editingApplication?.applicant_name}
              {editingApplication ? ` · ${editingApplication.position}` : ""}
            </DialogDescription>
          </DialogHeader>
          {editingApplication && (
            <div className="space-y-5">
              {applicationStatusError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                >
                  {applicationStatusError}
                </div>
              )}
              <label className="block text-sm font-semibold text-slate-700">
                Status
                <select
                  className={inputClass}
                  value={applicationStatusDraft}
                  onChange={(event) =>
                    setApplicationStatusDraft(
                      event.target.value as ApplicationStatus,
                    )
                  }
                  disabled={savingApplicationStatus}
                >
                  {APPLICATION_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingApplication(null)}
                  disabled={savingApplicationStatus}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveApplicationStatus()}
                  disabled={savingApplicationStatus}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0f1a3d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b2b58] disabled:opacity-60"
                >
                  {savingApplicationStatus && (
                    <LoaderCircle
                      size={15}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {savingApplicationStatus ? "Saving…" : "Save status"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invite for initial / Reject / Send job offer */}
      <ApplicantActionDialogs
        action={actionDialog}
        jobs={jobs}
        onClose={() => setActionDialog(null)}
        onSent={(message) => {
          setActionDialog(null);
          setNotice(message);
          void loadData(false);
        }}
      />
    </div>
  );
}
