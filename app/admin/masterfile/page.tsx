// File: app/admin/employee-masterfile/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Award,
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FilePlus2,
  FileStack,
  FileText,
  Loader,
  Search,
  Trash2,
  UserPlus,
  Users,
  Pencil,
  SlidersHorizontal,
  Briefcase,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Copy,
  Phone,
  CreditCard,
  PartyPopper,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmployeeForm } from "@/components/admin/employee-form";
import EmployeeMilestones from "@/components/admin/employee-milestones";
import {
  type Employee,
  type EmployeeFormData,
  type EmployeeStatus,
  emptyEmployee,
  emptyAllowancesState,
  allowancesToFormState,
  buildEmployeeAllowances,
  REQUIRED_FIELDS,
  EMPLOYEE_STATUSES,
  STATUS_BADGE_CLASSES,
  getFullName,
} from "@/components/admin/employee-types";
import { CoeForm } from "@/components/admin/coe-form";
import {
  type CoeFormData,
  type EmployeeLookup,
  type CompanyKey,
  emptyCoeForm,
  buildAllowances,
  buildCoeFilename,
  applyMealAllowanceMonthlyTotal,
} from "@/components/admin/coe-types";
import { ClearanceDialog } from "@/components/admin/clearance-dialog";
import { ClearanceCertificateDialog } from "@/components/admin/clearance-certificate-dialog";
import { EmployeeIdDialog } from "@/components/admin/employee-id-dialog";
import {
  EmployeeAvatar,
  EmployeePrivateImage,
} from "@/components/admin/employee-media";

// The two downloadable formats for a generated certificate. "docx" stays the
// default so existing behavior (Word doc with employee's + employer's copy)
// doesn't change unless someone explicitly picks PDF.
type CoeDownloadFormat = "docx" | "pdf";

const ITEMS_PER_PAGE = 10;
const todayYMD = () => new Date().toLocaleDateString("en-CA");
const formatDate = (dateString?: string | null) => {
  if (!dateString) return "—";
  const date = new Date(dateString);

  if (isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatMobileNumber = (value?: string | null) => {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const nationalNumber = digits.startsWith("09")
    ? `63${digits.slice(1)}`
    : digits.startsWith("9") && digits.length === 10
      ? `63${digits}`
      : digits;

  if (nationalNumber.startsWith("63") && nationalNumber.length === 12) {
    return `+${nationalNumber.slice(0, 5)} ${nationalNumber.slice(5, 8)} ${nationalNumber.slice(8)}`;
  }

  return value;
};

// Short display name for the table row only — full first name, middle name
// collapsed to just its initial, full last name. Keeps getFullName() (used
// in dialogs/toasts) untouched.
const getShortName = (employee: Employee) => {
  const parts = [
    (employee as any).first_name,
    (employee as any).middle_name
      ? `${(employee as any).middle_name.trim().charAt(0).toUpperCase()}.`
      : null,
    (employee as any).last_name,
    (employee as any).suffix,
  ].filter(Boolean);

  return parts.join(" ") || getFullName(employee);
};
const formatCurrency = (value?: string | null) => {
  if (!value) return "—";
  const num = Number(value);

  if (isNaN(num)) return "—";

  return `₱${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// ── Gov ID pending marker ──
const GOV_ID_FIELDS = [
  { key: "sss_number", label: "SSS" },
  { key: "philhealth_number", label: "PhilHealth" },
  { key: "pagibig_number", label: "Pag-IBIG" },
  { key: "tin_number", label: "TIN" },
] as const;

const PENDING_LABEL = "! Pending";

// Returns labels of gov IDs that are still empty, e.g. ["SSS", "TIN"]
const getMissingGovIds = (employee: Employee): string[] =>
  GOV_ID_FIELDS.filter(
    ({ key }) => !String((employee as any)[key] ?? "").trim(),
  ).map(({ label }) => label);
const isActiveEmployee = (employee: Employee) =>
  String(employee.status).trim().toLowerCase() === "active";
// Compares month/day from the raw "YYYY-MM-DD" string so timezone shifts
// don't push the birthday to the wrong day.
const isBirthdayToday = (birthday?: string | null) => {
  if (!birthday) return false;
  const match = birthday.match(/^\d{4}-(\d{2})-(\d{2})/);

  if (!match) return false;
  const now = new Date();

  return (
    Number(match[1]) === now.getMonth() + 1 &&
    Number(match[2]) === now.getDate()
  );
};

// Age they're turning today, from the raw "YYYY-MM-DD" string.
const getTurningAge = (birthday?: string | null) => {
  const match = birthday?.match(/^(\d{4})-/);

  if (!match) return null;
  const age = new Date().getFullYear() - Number(match[1]);

  return age > 0 && age < 120 ? age : null;
};

// ── Work anniversary (base sa date_hired, "YYYY-MM-DD") ──
const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

// Ilang taon na siya kung ngayon ang anniversary; null kung hindi.
const getAnniversaryYears = (dateHired?: string | null): number | null => {
  const match = dateHired?.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) return null;
  const now = new Date();
  const years = now.getFullYear() - Number(match[1]);

  if (years < 1) return null;

  const month = Number(match[2]);
  // Feb 29 hires: Feb 28 ang anniversary kapag hindi leap year
  const day =
    month === 2 && Number(match[3]) === 29 && !isLeapYear(now.getFullYear())
      ? 28
      : Number(match[3]);

  return month === now.getMonth() + 1 && day === now.getDate() ? years : null;
};

const isAnniversaryToday = (dateHired?: string | null) =>
  getAnniversaryYears(dateHired) !== null;

const formatYears = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

// Small notice shown under the phone number in the table row on an
// employee's work anniversary (Active employees only).
function AnniversaryNotice({ employee }: { employee: Employee }) {
  if (!isActiveEmployee(employee)) return null;

  const years = getAnniversaryYears(employee.date_hired);

  if (years === null) return null;

  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
      Happy {formatYears(years)} with us!
    </span>
  );
}

// Avatar with the party hat shown on the employee's birthday, and a medal
// on their work anniversary.
function AvatarWithBirthdayHat({
  employee,
  className,
}: {
  employee: Employee;
  className?: string;
}) {
  return (
    <div className="relative shrink-0">
      <EmployeeAvatar className={className ?? ""} employee={employee} />

      {isBirthdayToday(employee.birthday) && (
        <span
          className="pointer-events-none absolute -right-2 -top-3 rotate-12 text-lg leading-none"
          title="Happy Birthday!"
        >
          🥳
        </span>
      )}

      {isAnniversaryToday(employee.date_hired) && (
        <span
          className="pointer-events-none absolute -bottom-1 -right-2 text-base leading-none"
          title="Work anniversary!"
        >
          🏅
        </span>
      )}
    </div>
  );
}

// ── Birthday popup visuals (pure CSS, no extra libraries) ──
const BIRTHDAY_CSS = `
@keyframes bday-flicker {
  0% { transform: scale(1, 1) rotate(-4deg); }
  100% { transform: scale(0.85, 1.2) rotate(4deg); }
}
@keyframes bday-burst {
  0% { transform: translate(0, 0) rotate(0deg) scale(0.3); opacity: 1; }
  25% { transform: translate(var(--x), var(--up)) rotate(var(--r)) scale(1); opacity: 1; }
  100% { transform: translate(calc(var(--x) * 1.3), 380px) rotate(calc(var(--r) * 3)) scale(1); opacity: 0; }
}
@keyframes bday-pop {
  0% { transform: scale(0) rotate(-30deg); opacity: 0; }
  60% { transform: scale(1.4) rotate(10deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
.bday-flame {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: bday-flicker 0.6s ease-in-out infinite alternate;
}
`;

const CONFETTI_COLORS = [
  "#f43f5e",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#facc15",
];

// Popper-style burst: pieces shoot out from the cake area, then fall.
function ConfettiBurst() {
  const pieces = Array.from({ length: 48 }, (_, i) => {
    const angle = (i / 48) * Math.PI * 2;
    const spread = 90 + ((i * 37) % 130);

    return {
      id: i,
      x: Math.round(Math.cos(angle) * spread),
      up: -(50 + ((i * 53) % 110)),
      r: (i * 47) % 360,
      delay: (i % 8) * 0.05,
      size: 6 + (i % 3) * 3,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      round: i % 2 === 0,
    };
  });

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl"
    >
      <span
        className="absolute left-3 top-3 text-3xl"
        style={{ animation: "bday-pop 0.7s ease-out both" }}
      >
        🎉
      </span>
      <span
        className="absolute right-3 top-3 text-3xl"
        style={{ animation: "bday-pop 0.7s ease-out 0.15s both" }}
      >
        🎊
      </span>

      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-24 block"
          style={
            {
              width: p.size,
              height: p.round ? p.size : p.size * 0.5,
              backgroundColor: p.color,
              borderRadius: p.round ? "9999px" : "2px",
              opacity: 0,
              "--x": `${p.x}px`,
              "--up": `${p.up}px`,
              "--r": `${p.r}deg`,
              animation: `bday-burst 2.2s ease-out ${p.delay}s 2 forwards`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// Slot-machine countdown: every digit is a reel that counts DOWN (9, 8, 7...)
// at high speed, then brakes and lands on the real digit. Reels stop one after
// the other (left to right), like a jackpot reveal.
const REEL_ITEM_PX = 28; // must match h-7 below
const REEL_LOOPS = 3; // full 9→0 cycles before landing

function AnimatedAge({ age }: { age: number }) {
  const [spinning, setSpinning] = useState(true);
  const [go, setGo] = useState(false);
  const digits = String(age).split("").map(Number);

  // strip = REEL_LOOPS+1 cycles of 9,8,...,0
  const strip = Array.from(
    { length: (REEL_LOOPS + 1) * 10 },
    (_, i) => 9 - (i % 10),
  );

  const durationFor = (i: number) => 1.8 + i * 0.7;

  useEffect(() => {
    const start = setTimeout(() => setGo(true), 250);
    const totalMs = 250 + (durationFor(digits.length - 1) + 0.1) * 1000;
    const end = setTimeout(() => setSpinning(false), totalMs);

    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [age]);

  return (
    <div
      className="flex shrink-0 flex-col items-center"
      title={`Turning ${age} today`}
    >
      <div className="rounded-2xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-purple-600 p-[3px] shadow-md">
        <div className="flex items-center gap-1 rounded-[13px] bg-slate-900 px-2 py-1">
          {digits.map((digit, i) => {
            // land on the digit inside the LAST cycle of the strip
            const targetIndex = REEL_LOOPS * 10 + (9 - digit);

            return (
              <div
                key={i}
                className="h-7 w-5 overflow-hidden rounded-md bg-white text-center text-xl font-extrabold leading-7 text-purple-700"
              >
                <div
                  style={{
                    transform: `translateY(-${go ? targetIndex * REEL_ITEM_PX : 0}px)`,
                    transition: go
                      ? `transform ${durationFor(i)}s cubic-bezier(0.12, 0.75, 0.2, 1)`
                      : "none",
                    filter: spinning ? "blur(0.6px)" : "none",
                  }}
                >
                  {strip.map((n, k) => (
                    <div key={k} className="h-7">
                      {n}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
        years old
      </span>
    </div>
  );
}

// Gold badge showing years of service on the anniversary popup.
function AnniversaryBadge({ years }: { years: number }) {
  return (
    <div
      className="flex shrink-0 flex-col items-center"
      title={`${formatYears(years)} with the company`}
    >
      <div className="flex h-12 w-12 flex-col items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md ring-2 ring-white">
        <span className="text-lg font-extrabold leading-none">{years}</span>
        <span className="text-[8px] font-bold uppercase tracking-wider">
          {years === 1 ? "year" : "years"}
        </span>
      </div>
    </div>
  );
}

// Cake with three lit candles (flames flicker via .bday-flame).
function BirthdayCake() {
  const candleColors = ["#60a5fa", "#f472b6", "#a78bfa"];

  return (
    <svg aria-hidden className="mx-auto h-24 w-24" viewBox="0 0 120 110">
      {[42, 60, 78].map((x, i) => (
        <g key={x}>
          <rect
            fill={candleColors[i]}
            height={18}
            rx={1}
            width={4}
            x={x - 2}
            y={34}
          />
          <ellipse
            className="bday-flame"
            cx={x}
            cy={28}
            fill="#fbbf24"
            rx={3.5}
            ry={6}
            style={{ animationDelay: `${i * 0.15}s` }}
          />
          <ellipse
            className="bday-flame"
            cx={x}
            cy={29.5}
            fill="#fff7ed"
            rx={1.6}
            ry={3.5}
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        </g>
      ))}
      <ellipse cx={60} cy={96} fill="#e2e8f0" rx={50} ry={6} />
      <rect fill="#f9a8d4" height={26} rx={5} width={76} x={22} y={68} />
      <rect fill="#c4b5fd" height={20} rx={5} width={60} x={30} y={50} />
      <path
        d="M30 56 q5 8 10 0 q5 8 10 0 q5 8 10 0 q5 8 10 0 q5 8 10 0 q5 8 10 0"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth={4}
      />
      <path
        d="M22 74 q6 9 12 0 q6 9 12 0 q6 9 12 0 q6 9 12 0 q6 9 12 0 q6 9 12 0"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth={4}
      />
    </svg>
  );
}

// The clearance FORM's Section B/C template is saved per department (IT,
// Multimedia, Studio, Admin — see the Clearance Form Template page). An
// employee's masterfile "department" free-text field has to match one of
// those four keys for clearance generation to find the right template, so
// this normalizes it and flags anything that doesn't map cleanly.
const CLEARANCE_DEPARTMENT_LABELS: Record<string, string> = {
  it: "IT",
  multimedia: "Multimedia",
  studio: "Studio",
  admin: "Admin",
  sales: "Sales",
  management: "Management",
  marketing: "Marketing",
};

const normalizeClearanceDepartment = (
  department?: string | null,
): string | null => {
  if (!department) return null;
  const key = department.trim().toLowerCase();

  return key in CLEARANCE_DEPARTMENT_LABELS ? key : null;
};

// Tells the admin layout (sidebar dots) to re-fetch right away.
const notifyMasterfileChanged = () =>
  window.dispatchEvent(new Event("masterfile:changed"));

export default function EmployeeMasterfilePage() {
  const router = useRouter();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  // Left-side status filter — "All" plus one tab per EMPLOYEE_STATUSES entry.
  const DEFAULT_STATUS_FILTER: EmployeeStatus | "All" = "Active";

  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "All">(
    DEFAULT_STATUS_FILTER,
  );

  // Show only employees with at least one missing gov ID.
  const [pendingOnly, setPendingOnly] = useState(false);

  const [viewRecord, setViewRecord] = useState<Employee | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>(emptyEmployee());
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof EmployeeFormData, boolean>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [profileImageRemoved, setProfileImageRemoved] = useState(false);
  const [signatureRemoved, setSignatureRemoved] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Row ids currently mid-flight on the quick status dropdown, so we can
  // disable just that row's select instead of the whole table.
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);

  // ── COE generation (per-employee, launched from the masterfile) ──
  const [coeDialogOpen, setCoeDialogOpen] = useState(false);
  const [coeTargetEmployee, setCoeTargetEmployee] = useState<Employee | null>(
    null,
  );
  const [coeFormData, setCoeFormData] = useState<CoeFormData>(emptyCoeForm());
  const [coeFormErrors, setCoeFormErrors] = useState<
    Partial<Record<keyof CoeFormData, boolean>>
  >({});

  // Which file type to hand back after generating — chosen in the dialog,
  // right next to the Generate & Download button.
  const [coeDownloadFormat, setCoeDownloadFormat] =
    useState<CoeDownloadFormat>("docx");

  const [coeLookupStatus, setCoeLookupStatus] = useState<
    "idle" | "loading" | "found" | "not_found"
  >("idle");
  const [coeSubmitting, setCoeSubmitting] = useState(false);
  const [coeDownloading, setCoeDownloading] = useState(false);

  // ── Clearance FORM generation (per-employee, same launch points as COE) ──
  // All the form state lives inside <ClearanceDialog />, the page only tracks
  // which employee it's open for.
  const [clearanceDialogOpen, setClearanceDialogOpen] = useState(false);
  const [clearanceTargetEmployee, setClearanceTargetEmployee] =
    useState<Employee | null>(null);

  // ── Employee Clearance CERTIFICATE generation (the final "cleared" document) ──
  // Same idea: the dialog owns its form state, the page tracks the employee.
  const [certDialogOpen, setCertDialogOpen] = useState(false);
  const [certTargetEmployee, setCertTargetEmployee] = useState<Employee | null>(
    null,
  );

  const [employeeIdDialogOpen, setEmployeeIdDialogOpen] = useState(false);
  const [employeeIdTarget, setEmployeeIdTarget] = useState<Employee | null>(
    null,
  );

  // Auth only. The debounced search effect below does the first fetch.
  useEffect(() => {
    const token = localStorage.getItem("adminSessionActive");

    if (!token) {
      router.push("/admin/login");
    }
  }, [router]);

  const fetchEmployees = async (search?: string) => {
    const requestId = ++requestIdRef.current;

    setLoading(true);
    try {
      const token = localStorage.getItem("adminSessionActive");
      const url = search
        ? `/api/employee-masterfile?search=${encodeURIComponent(search)}`
        : "/api/employee-masterfile";
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json();

      // ignore responses from outdated requests
      if (requestId !== requestIdRef.current) return;
      setEmployees(data?.data ?? []);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      toast.error("Failed to load employee records");
      setEmployees([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  };

  // The ONLY list fetch effect: immediate on mount / when cleared,
  // 350ms debounce while typing.
  useEffect(() => {
    if (!localStorage.getItem("adminSessionActive")) return;

    const timeout = setTimeout(
      () => {
        fetchEmployees(searchQuery.trim() || undefined);
        setCurrentPage(1);
      },
      searchQuery.trim() ? 350 : 0,
    );

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // ── Status filter tabs (client-side, over whatever the search already narrowed down) ──
  const statusCounts = EMPLOYEE_STATUSES.reduce<Record<string, number>>(
    (acc, s) => {
      acc[s] = employees.filter((e) => e.status === s).length;

      return acc;
    },
    {},
  );

  // How many ACTIVE employees still have at least one missing gov ID.
  const pendingCount = employees.filter(
    (e) => isActiveEmployee(e) && getMissingGovIds(e).length > 0,
  ).length;

  const baseEmployees =
    statusFilter === "All"
      ? employees
      : employees.filter((e) => e.status === statusFilter);

  const filteredEmployees = (
    pendingOnly
      ? baseEmployees.filter(
          (e) => isActiveEmployee(e) && getMissingGovIds(e).length > 0,
        )
      : baseEmployees
  )
    .slice()
    .sort((a, b) =>
      String(a.id_number ?? "").localeCompare(
        String(b.id_number ?? ""),
        undefined,
        { numeric: true, sensitivity: "base" },
      ),
    );
  const handleStatusFilterChange = (status: EmployeeStatus | "All") => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const openAddDialog = () => {
    setEditingId(null);
    setFormData(emptyEmployee());
    setFormErrors({});
    setProfileImageFile(null);
    setSignatureFile(null);
    setProfileImageRemoved(false);
    setSignatureRemoved(false);
    setFormOpen(true);
  };
  // Galing sa Overview na "Add Employee" link (?add=1): buksan agad ang add form.
  const addFromLinkRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("add") !== "1") return;

    addFromLinkRef.current = true;
    openAddDialog();

    // Alisin ang ?add=1 para hindi na bumukas ulit kapag nag-refresh.
    params.delete("add");
    const qs = params.toString();

    router.replace(
      qs ? `/admin/employee-masterfile?${qs}` : "/admin/employee-masterfile",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openEmployeeIdDialog = (employee: Employee) => {
    setEmployeeIdTarget(employee);
    setEmployeeIdDialogOpen(true);
  };

  const openEditDialog = async (employee: Employee) => {
    setEditingId(employee.id);
    setProfileImageFile(null);
    setSignatureFile(null);
    setProfileImageRemoved(false);
    setSignatureRemoved(false);
    const token = localStorage.getItem("adminSessionActive");
    const { id, created_at, updated_at, allowances, ...rest } = employee;

    let positionHistory: EmployeeFormData["position_history"] = [];

    try {
      const response = await fetch(
        `/api/employee-masterfile/${employee.id}/position-history`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load employee position history.");
      }

      const data = await response.json();

      if (Array.isArray(data?.data)) {
        positionHistory = data.data.map(
          (entry: {
            action?: string;
            old_position?: string | null;
            new_position?: string | null;
            effective_date?: string | null;
          }) => ({
            action: entry.action === "Demote" ? "Demote" : "Promote",
            old_position: entry.old_position ?? "",
            new_position: entry.new_position ?? "",
            effective_date: entry.effective_date ?? "",
          }),
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load employee position history.",
      );
      positionHistory = [];
    }

    const regDate = rest.regularization_date?.slice(0, 10) ?? "";

    setFormData({
      ...rest,
      position_action: rest.position_action ?? "",
      new_position: rest.new_position ?? "",
      position_effective_date: rest.position_effective_date ?? "",
      position_history: positionHistory,
      allowances: allowancesToFormState(allowances),
      de_minimis: rest.de_minimis ?? "",
      // Already regular, OR the scheduled date has been reached
      is_regular:
        Boolean(rest.is_regular) || (!!regDate && regDate <= todayYMD()),
      regularization_date: regDate,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const handleFieldChange = (
    field: keyof EmployeeFormData,
    value:
      | string
      | boolean
      | {
          action: "Promote" | "Demote";
          new_position: string;
          effective_date: string;
        }[],
  ) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };

      // Date reached (today or earlier) -> mark as Regular automatically
      if (
        field === "regularization_date" &&
        typeof value === "string" &&
        value &&
        value <= todayYMD()
      ) {
        next.is_regular = true;
      }

      return next;
    });
    if (formErrors[field])
      setFormErrors((prev) => ({ ...prev, [field]: false }));
  };

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied to clipboard.");
    } catch {
      toast.error("Unable to copy email.");
    }
  };

  const handleAllowanceChange = (
    key: string,
    patch: Partial<{ checked: boolean; amount: string }>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      allowances: {
        ...prev.allowances,
        [key]: { ...prev.allowances[key], ...patch },
      },
    }));
  };

  const handleProfileImageChange = (file: File | null) => {
    setProfileImageFile(file);
    if (file) setProfileImageRemoved(false);
  };

  const handleSignatureChange = (file: File | null) => {
    setSignatureFile(file);
    if (file) setSignatureRemoved(false);
  };

  const removeProfileImage = () => {
    setProfileImageFile(null);
    setProfileImageRemoved(Boolean(formData.profile_image_path));
  };

  const removeSignature = () => {
    setSignatureFile(null);
    setSignatureRemoved(Boolean(formData.signature_path));
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof EmployeeFormData, boolean>> = {};

    for (const field of REQUIRED_FIELDS) {
      if (!formData[field] || String(formData[field]).trim() === "")
        errors[field] = true;
    }
    if (formData.is_regular && !formData.regularization_date) {
      errors.regularization_date = true;
    }
    setFormErrors(errors);

    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (submitLockRef.current) return;
    if (!validate()) {
      toast.error("Please fill in the highlighted fields.");

      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const token = localStorage.getItem("adminSessionActive");
      const url = editingId
        ? `/api/employee-masterfile/${editingId}`
        : "/api/employee-masterfile";
      const hasFileChanges = Boolean(
        profileImageFile ||
          signatureFile ||
          profileImageRemoved ||
          signatureRemoved,
      );
      const method = editingId && !hasFileChanges ? "PUT" : "POST";

      // The API expects allowances as EmployeeAllowance[], not the
      // checkbox/amount map the form uses internally — convert on the way out.
      const effectivePosition =
        formData.new_position && formData.new_position.trim()
          ? formData.new_position.trim()
          : formData.position;

      const pendingHistoryEntry =
        formData.new_position?.trim() && formData.position_effective_date
          ? {
              action:
                formData.position_action === "Demote" ? "Demote" : "Promote",
              new_position: formData.new_position.trim(),
              effective_date: formData.position_effective_date,
            }
          : null;

      const nextPositionHistory = pendingHistoryEntry
        ? [
            ...(formData.position_history ?? []).filter(
              (item) =>
                !(
                  item.new_position === pendingHistoryEntry.new_position &&
                  item.effective_date === pendingHistoryEntry.effective_date
                ),
            ),
            pendingHistoryEntry,
          ]
        : (formData.position_history ?? []);

      const payload = {
        ...formData,
        position: effectivePosition,
        position_action: formData.position_action || undefined,
        new_position: formData.new_position || undefined,
        position_effective_date: formData.position_effective_date || undefined,
        position_history: nextPositionHistory.length
          ? nextPositionHistory
          : undefined,
        allowances: buildEmployeeAllowances(formData.allowances),
        is_regular: formData.is_regular,
        // Keep a scheduled date even if not regular yet
        regularization_date: formData.regularization_date || null,
      };

      let body: BodyInit;
      const headers: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      if (hasFileChanges) {
        const multipart = new FormData();

        if (editingId) multipart.append("_method", "PUT");

        Object.entries(payload).forEach(([key, value]) => {
          if (key === "regularization_date" && value === null) {
            multipart.append(key, ""); // clears the date on the backend
            return;
          }
          if (value === undefined || value === null) return;
          multipart.append(
            key,
            typeof value === "boolean"
              ? value
                ? "1"
                : "0"
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value),
          );
        });

        if (profileImageFile)
          multipart.append("profile_image", profileImageFile);
        if (signatureFile) multipart.append("signature", signatureFile);
        if (profileImageRemoved) multipart.append("remove_profile_image", "1");
        if (signatureRemoved) multipart.append("remove_signature", "1");
        body = multipart;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(payload);
      }

      const response = await fetch(url, {
        method,
        headers,
        body,
      });
      const data = await response.json();

      if (!response.ok || data?.success === false) {
        const validationMessage = Object.values(data?.errors ?? {}).flat()[0];

        throw new Error(
          data?.message ||
            (typeof validationMessage === "string"
              ? validationMessage
              : null) ||
            "Failed to save employee record",
        );
      }

      toast.success(editingId ? "Employee record updated!" : "Employee added!");
      setFormOpen(false);
      fetchEmployees(searchQuery.trim() || undefined);
      notifyMasterfileChanged();
    } catch (error: any) {
      toast.error(error.message || "Failed to save employee record");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  // Quick status change straight from the table row — no need to open the
  // full edit dialog just to flip Active -> On Leave etc. Optimistic update
  // with rollback if the PUT fails.
  const handleQuickStatusChange = async (
    employee: Employee,
    status: EmployeeStatus,
  ) => {
    if (status === employee.status) return;
    const previousStatus = employee.status;
    const token = localStorage.getItem("adminSessionActive");

    setStatusUpdatingId(employee.id);
    setEmployees((prev) =>
      prev.map((e) => (e.id === employee.id ? { ...e, status } : e)),
    );

    try {
      const { id, created_at, updated_at, ...rest } = employee;
      const payload = { ...rest, status };

      const response = await fetch(`/api/employee-masterfile/${employee.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || "Failed to update status");
      }

      toast.success(`${getFullName(employee)} is now ${status}.`);
      notifyMasterfileChanged();
    } catch (error: any) {
      // roll back the optimistic update
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === employee.id ? { ...e, status: previousStatus } : e,
        ),
      );
      toast.error(error.message || "Failed to update status");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDelete = async () => {
    if (!recordToDelete) return;
    const token = localStorage.getItem("adminSessionActive");

    setDeleting(true);
    try {
      const response = await fetch(
        `/api/employee-masterfile/${recordToDelete.id}`,
        {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );

      if (!response.ok) throw new Error();
      toast.success(
        `${getFullName(recordToDelete)} removed from the masterfile`,
      );
      setEmployees((prev) => prev.filter((e) => e.id !== recordToDelete.id));
      setDeleteDialogOpen(false);
      setRecordToDelete(null);
      notifyMasterfileChanged();
    } catch {
      toast.error("Failed to delete employee record");
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteDialog = (employee: Employee) => {
    setRecordToDelete(employee);
    setDeleteDialogOpen(true);
  };

  // ── COE generation helpers ──

  const openCoeDialog = (employee: Employee) => {
    setCoeTargetEmployee(employee);
    setCoeFormData({ ...emptyCoeForm(), id_number: employee.id_number });
    setCoeFormErrors({});
    setCoeLookupStatus("idle");
    setCoeDownloadFormat("docx");
    setCoeDialogOpen(true);
  };

  // ── Clearance FORM generation helper ──

  const openClearanceDialog = (employee: Employee) => {
    const deptKey = normalizeClearanceDepartment(employee.department);

    if (!deptKey) {
      toast.error(
        `No clearance form template for "${employee.department || "—"}". Set this employee's department to IT, Multimedia, Studio, or Admin first.`,
      );

      return;
    }
    setClearanceTargetEmployee(employee);
    setClearanceDialogOpen(true);
  };

  // ── Clearance CERTIFICATE generation helper ──

  const openCertDialog = (employee: Employee) => {
    setCertTargetEmployee(employee);
    setCertDialogOpen(true);
  };

  const handleCoeFieldChange = <K extends keyof CoeFormData>(
    field: K,
    value: CoeFormData[K],
  ) => {
    setCoeFormData((prev) => ({ ...prev, [field]: value }));
    if (coeFormErrors[field])
      setCoeFormErrors((prev) => ({ ...prev, [field]: false }));
  };

  // Mirrors handleAllowanceChange on the masterfile form.
  const handleCoeAllowanceChange = (
    key: string,
    patch: Partial<{ checked: boolean; amount: string }>,
  ) => {
    setCoeFormData((prev) => ({
      ...prev,
      allowances: {
        ...prev.allowances,
        [key]: { ...prev.allowances[key], ...patch },
      },
    }));
  };

  useEffect(() => {
    if (!coeDialogOpen || !coeFormData.id_number) {
      return;
    }
    setCoeLookupStatus("loading");
    const t = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/admin/employees/lookup?id_number=${encodeURIComponent(coeFormData.id_number)}`,
        );

        if (!response.ok) {
          setCoeLookupStatus("not_found");
          setCoeFormData((prev) => ({
            ...prev,
            employee_id: null,
            employee_name: "",
            department: "",
            position: "",
            date_hired: null,
            period_from: "",
            salary: "",
            allowances: emptyAllowancesState(),
          }));

          return;
        }
        const { data }: { data: EmployeeLookup } = await response.json();
        const dateHiredFormatted = data.date_hired
          ? data.date_hired.slice(0, 10)
          : null;

        setCoeLookupStatus("found");
        setCoeFormData((prev) => ({
          ...prev,
          employee_id: data.id,
          employee_name: data.full_name,
          department: data.department,
          position: data.position,
          date_hired: dateHiredFormatted,
          period_from: dateHiredFormatted || "",
          salary: data.salary ?? "",
          allowances: applyMealAllowanceMonthlyTotal(
            allowancesToFormState(data.allowances),
          ),
        }));
      } catch {
        setCoeLookupStatus("not_found");
      }
    }, 400);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coeDialogOpen, coeFormData.id_number]);

  const validateCoe = (): boolean => {
    const errors: Partial<Record<keyof CoeFormData, boolean>> = {};

    if (!coeFormData.employee_id) errors.employee_id = true;
    if (!coeFormData.salary) errors.salary = true;
    if (!coeFormData.period_from) errors.period_from = true;
    if (!coeFormData.period_to) errors.period_to = true;
    if (!coeFormData.issued_at) errors.issued_at = true;
    if (!coeFormData.signatory_name) errors.signatory_name = true;
    if (!coeFormData.signatory_title) errors.signatory_title = true;
    setCoeFormErrors(errors);

    return Object.keys(errors).length === 0;
  };

  // `format` decides whether the download route hands back the .docx (with
  // both copies) or the .pdf twin — see app/api/admin/coe/[id]/download.
  const downloadCoe = async (
    id: number,
    filename: string,
    company: CompanyKey,
    format: CoeDownloadFormat,
  ) => {
    setCoeDownloading(true);
    try {
      const response = await fetch(
        `/api/admin/coe/${id}/download?company=${encodeURIComponent(company)}&format=${format}`,
      );

      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download =
        format === "pdf" ? filename.replace(/\.docx$/i, ".pdf") : filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download the certificate");
    } finally {
      setCoeDownloading(false);
    }
  };

  const handleCoeSubmit = async () => {
    if (!validateCoe()) {
      toast.error("Please fill in the highlighted fields.");

      return;
    }
    setCoeSubmitting(true);
    try {
      const response = await fetch("/api/admin/coe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employee_id: coeFormData.employee_id,
          salary: coeFormData.salary,
          allowances: buildAllowances(coeFormData),
          period_from: coeFormData.period_from,
          period_to: coeFormData.period_to,
          issued_at: coeFormData.issued_at,
          signatory_name: coeFormData.signatory_name,
          signatory_title: coeFormData.signatory_title,
        }),
      });
      const data = await response.json();

      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || "Failed to create certificate");
      }

      toast.success(
        `${data.data.certificate_no} generated for ${data.data.employee_name}.`,
      );
      setCoeDialogOpen(false);
      downloadCoe(
        data.data.id,
        buildCoeFilename(data.data),
        coeFormData.company,
        coeDownloadFormat,
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to create certificate");
    } finally {
      setCoeSubmitting(false);
    }
  };

  type EmployeeSortKey =
    | "employee"
    | "id_number"
    | "department"
    | "position"
    | "date_hired"
    | "status";

  const [sortKey, setSortKey] = useState<EmployeeSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleSort = (key: EmployeeSortKey) => {
    if (sortKey !== key) {
      // First click: ascending
      setSortKey(key);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      // Second click: descending
      setSortDirection("desc");
    } else {
      // Third click: reset to normal order
      setSortKey(null);
      setSortDirection("asc");
    }

    setCurrentPage(1);
  };

  const SortIcon = ({ column }: { column: EmployeeSortKey }) => {
    if (sortKey !== column) {
      return <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 opacity-50" />;
    }

    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1.5 h-3.5 w-3.5 text-blue-600" />
    ) : (
      <ArrowDown className="ml-1.5 h-3.5 w-3.5 text-blue-600" />
    );
  };

  const sortedEmployees = sortKey
    ? [...filteredEmployees].sort((a, b) => {
        let comparison = 0;

        if (sortKey === "employee") {
          comparison = getFullName(a).localeCompare(getFullName(b), undefined, {
            sensitivity: "base",
            numeric: true,
          });
        } else if (sortKey === "date_hired") {
          const dateA = a.date_hired
            ? new Date(a.date_hired).getTime()
            : Number.NaN;
          const dateB = b.date_hired
            ? new Date(b.date_hired).getTime()
            : Number.NaN;

          const validA = Number.isFinite(dateA);
          const validB = Number.isFinite(dateB);

          if (!validA && !validB) return 0;
          if (!validA) return 1;
          if (!validB) return -1;

          comparison = dateA - dateB;
        } else {
          const valueA = String(a[sortKey] ?? "");
          const valueB = String(b[sortKey] ?? "");

          comparison = valueA.localeCompare(valueB, undefined, {
            sensitivity: "base",
            numeric: true,
          });
        }

        return sortDirection === "asc" ? comparison : -comparison;
      })
    : filteredEmployees;

  const sortHeadButton =
    "-ml-2 h-8 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-200/60 hover:text-slate-900";

  const sortableHead = (
    column: EmployeeSortKey,
    label: string,
    className = "",
  ) => (
    <TableHead className={`h-11 whitespace-nowrap px-4 ${className}`}>
      <Button
        className={sortHeadButton}
        variant="ghost"
        onClick={() => handleSort(column)}
      >
        {label} <SortIcon column={column} />
      </Button>
    </TableHead>
  );

  const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  const paginated = sortedEmployees.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  useEffect(() => {
    const last = Math.max(totalPages, 1);

    if (currentPage > last) setCurrentPage(last);
  }, [currentPage, totalPages]);

  // ── Birthday + work anniversary popups (once, on first load of the page) ──
  // Birthday popup shows first; if there are also anniversaries, that popup
  // opens right after the birthday one is closed.
  const [birthdayPopupOpen, setBirthdayPopupOpen] = useState(false);
  const [anniversaryPopupOpen, setAnniversaryPopupOpen] = useState(false);
  const birthdayCheckedRef = useRef(false);
  const anniversaryShownRef = useRef(false);

  const birthdayCelebrants = employees.filter(
    (employee) =>
      // Active employees only (resigned / on leave etc. are skipped)
      String(employee.status).trim().toLowerCase() === "active" &&
      isBirthdayToday(employee.birthday),
  );

  // Pinakamatagal na sa company ang nasa taas
  const anniversaryCelebrants = employees
    .filter(
      (employee) =>
        String(employee.status).trim().toLowerCase() === "active" &&
        isAnniversaryToday(employee.date_hired),
    )
    .sort(
      (a, b) =>
        (getAnniversaryYears(b.date_hired) ?? 0) -
        (getAnniversaryYears(a.date_hired) ?? 0),
    );

  useEffect(() => {
    if (initialLoading || birthdayCheckedRef.current) return;
    birthdayCheckedRef.current = true;
    if (addFromLinkRef.current) return; // <-- bagong line
    if (birthdayCelebrants.length > 0) {
      setBirthdayPopupOpen(true);
    } else if (anniversaryCelebrants.length > 0) {
      anniversaryShownRef.current = true;
      setAnniversaryPopupOpen(true);
    }
  }, [initialLoading]);

  // Kapag may birthday AT anniversary: birthday muna, tapos anniversary
  const handleBirthdayPopupChange = (open: boolean) => {
    setBirthdayPopupOpen(open);
    if (
      !open &&
      !anniversaryShownRef.current &&
      anniversaryCelebrants.length > 0
    ) {
      anniversaryShownRef.current = true;
      setTimeout(() => setAnniversaryPopupOpen(true), 250);
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg">
        <div className="mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            {/* Title and Record Summary */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
                  <Users className="h-6 w-6 text-white sm:h-7 sm:w-7" />
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
                    Employee Masterfile
                  </h1>
                  <p className="mt-1 text-sm text-blue-100">
                    Manage and maintain employee records
                  </p>
                </div>
              </div>

              {/* Record Summary */}
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="text-blue-100">
                  {initialLoading ? (
                    "Loading records..."
                  ) : (
                    <>
                      Showing{" "}
                      <span className="font-semibold text-white">
                        {filteredEmployees.length === 0 ? 0 : startIndex + 1}–
                        {Math.min(
                          startIndex + ITEMS_PER_PAGE,
                          filteredEmployees.length,
                        )}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-white">
                        {filteredEmployees.length}
                      </span>{" "}
                      records
                    </>
                  )}
                </span>

                {!initialLoading && (
                  <>
                    <span className="hidden h-4 w-px bg-white/30 sm:block" />

                    <span className="inline-flex items-center gap-2 text-blue-100">
                      <span className="h-2 w-2 rounded-full bg-emerald-300" />
                      <span>
                        <span className="font-semibold text-white">
                          {employees.length}
                        </span>{" "}
                        total employees
                      </span>
                    </span>
                  </>
                )}

                {pendingCount > 0 && (
                  <>
                    <span className="hidden h-4 w-px bg-white/30 sm:block" />

                    <button
                      className="inline-flex items-center gap-2 text-blue-100 hover:text-white"
                      title="Show employees with missing government IDs"
                      type="button"
                      onClick={() => {
                        setPendingOnly(true);
                        setCurrentPage(1);
                      }}
                    >
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      <span>
                        <span className="font-semibold text-white">
                          {pendingCount}
                        </span>{" "}
                        with pending gov IDs
                      </span>
                    </button>
                  </>
                )}

                {anniversaryCelebrants.length > 0 && (
                  <>
                    <span className="hidden h-4 w-px bg-white/30 sm:block" />

                    <button
                      className="inline-flex items-center gap-2 text-blue-100 hover:text-white"
                      title="Show today's work anniversaries"
                      type="button"
                      onClick={() => setAnniversaryPopupOpen(true)}
                    >
                      <span className="h-2 w-2 rounded-full bg-amber-300" />
                      <span>
                        <span className="font-semibold text-white">
                          {anniversaryCelebrants.length}
                        </span>{" "}
                        work anniversar
                        {anniversaryCelebrants.length === 1 ? "y" : "ies"} today
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Add Employee Action */}
            <div className="flex w-full shrink-0 sm:w-auto">
              <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogTrigger asChild>
                  <Button
                    className="h-11 w-full bg-white px-5 font-semibold text-blue-700 shadow-md transition-colors hover:bg-blue-50 sm:w-auto"
                    onClick={openAddDialog}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Employee
                  </Button>
                </DialogTrigger>

                <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-2xl">
                      <UserPlus className="h-6 w-6 text-blue-600" />
                      {editingId ? "Edit Employee" : "Add New Employee"}
                    </DialogTitle>

                    <DialogDescription>
                      Fields marked <span className="text-red-500">*</span> are
                      required. Government ID numbers, family information, and
                      contact information are optional.
                    </DialogDescription>
                  </DialogHeader>

                  <EmployeeForm
                    data={formData}
                    employeeId={editingId}
                    errors={formErrors}
                    profileImageFile={profileImageFile}
                    profileImageRemoved={profileImageRemoved}
                    showPositionChangeSection={!!editingId}
                    signatureFile={signatureFile}
                    signatureRemoved={signatureRemoved}
                    uploadingFiles={
                      submitting && Boolean(profileImageFile || signatureFile)
                    }
                    onAllowanceChange={handleAllowanceChange}
                    onChange={handleFieldChange}
                    onProfileImageChange={handleProfileImageChange}
                    onRemoveProfileImage={removeProfileImage}
                    onRemoveSignature={removeSignature}
                    onRestoreProfileImage={() => setProfileImageRemoved(false)}
                    onRestoreSignature={() => setSignatureRemoved(false)}
                    onSignatureChange={handleSignatureChange}
                  />

                  <DialogFooter className="mt-4 gap-2">
                    <Button
                      disabled={submitting}
                      type="button"
                      variant="outline"
                      onClick={() => setFormOpen(false)}
                    >
                      Cancel
                    </Button>

                    <Button
                      className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                      disabled={submitting}
                      type="button"
                      onClick={handleSubmit}
                    >
                      {submitting ? (
                        <>
                          <Loader className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Employee"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 space-y-5 py-5 sm:py-8">
        {/* Employee Records Card */}
        <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
            {/* Search and Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Search Input */}
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  aria-label="Search employee records"
                  className="pl-9"
                  placeholder="Search by name, ID, department, or position"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              {/* Status Filter Dropdown */}
              <div className="flex shrink-0 items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label="Filter employees by status"
                      className="relative gap-2"
                      variant="outline"
                    >
                      {pendingCount > 0 && (
                        <span
                          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                          title={`${pendingCount} with pending gov IDs`}
                        />
                      )}
                      <SlidersHorizontal className="h-4 w-4" />
                      Filters
                      {(statusFilter !== DEFAULT_STATUS_FILTER ||
                        pendingOnly) && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-700 px-1.5 text-xs font-semibold text-white">
                          {(statusFilter !== DEFAULT_STATUS_FILTER ? 1 : 0) +
                            (pendingOnly ? 1 : 0)}
                        </span>
                      )}
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="end"
                    className="z-[999] w-64 border border-gray-200 bg-white text-gray-900 shadow-xl opacity-100"
                  >
                    <DropdownMenuRadioGroup
                      value={statusFilter}
                      onValueChange={(value) => {
                        handleStatusFilterChange(
                          value as EmployeeStatus | "All",
                        );
                        setCurrentPage(1);
                      }}
                    >
                      <DropdownMenuRadioItem value="All">
                        <div className="flex w-full items-center justify-between gap-4">
                          <span>All Employees</span>
                          <span className="text-xs text-muted-foreground">
                            {employees.length}
                          </span>
                        </div>
                      </DropdownMenuRadioItem>

                      {EMPLOYEE_STATUSES.map((status) => (
                        <DropdownMenuRadioItem key={status} value={status}>
                          <div className="flex w-full items-center justify-between gap-4">
                            <span>{status}</span>
                            <span className="text-xs text-muted-foreground">
                              {statusCounts[status] ?? 0}
                            </span>
                          </div>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setPendingOnly((v) => !v);
                        setCurrentPage(1);
                      }}
                    >
                      <span className="flex w-full items-center justify-between gap-4">
                        <span>{pendingOnly ? "✓ " : ""}Incomplete Gov IDs</span>
                        <span className="text-xs font-semibold text-red-600">
                          {pendingCount}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {(statusFilter !== DEFAULT_STATUS_FILTER ||
                  pendingOnly ||
                  searchQuery.trim() !== "") && (
                  <Button
                    className="shrink-0"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSearchQuery("");
                      handleStatusFilterChange(DEFAULT_STATUS_FILTER);
                      setPendingOnly(false);
                      setCurrentPage(1);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Employee Table */}
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                    {sortableHead("id_number", "ID Number")}
                    {sortableHead("employee", "Employee")}
                    {sortableHead(
                      "department",
                      "Department",
                      "hidden md:table-cell",
                    )}
                    {sortableHead(
                      "position",
                      "Position",
                      "hidden lg:table-cell",
                    )}
                    {sortableHead(
                      "date_hired",
                      "Date Hired",
                      "hidden lg:table-cell",
                    )}
                    {sortableHead("status", "Status")}
                    <TableHead className="h-11 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <div className="flex items-center justify-center">
                        Actions
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {initialLoading && employees.length === 0 ? (
                    Array.from({ length: 6 }, (_, i) => (
                      <TableRow
                        key={`skeleton-${i}`}
                        className="border-b border-slate-100"
                      >
                        <TableCell className="px-6 py-3.5">
                          <div className="h-4 w-14 animate-pulse rounded bg-slate-200" />
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-200" />
                            <div className="space-y-2">
                              <div className="h-3.5 w-36 animate-pulse rounded bg-slate-200" />
                              <div className="h-3 w-44 animate-pulse rounded bg-slate-100" />
                              <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                        </TableCell>

                        <TableCell className="hidden lg:table-cell">
                          <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
                        </TableCell>

                        <TableCell className="hidden lg:table-cell">
                          <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
                        </TableCell>

                        <TableCell>
                          <div className="h-8 w-[110px] animate-pulse rounded-full bg-slate-200" />
                        </TableCell>

                        <TableCell>
                          <div className="mx-auto h-9 w-24 animate-pulse rounded-lg bg-slate-200" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : paginated.length === 0 ? (
                    <TableRow>
                      <TableCell className="h-64 text-center" colSpan={7}>
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50">
                            <Users className="h-6 w-6 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">
                              No employee records found
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              Try adjusting your search or status filter.
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((employee) => {
                      const missingGovIds = isActiveEmployee(employee)
                        ? getMissingGovIds(employee)
                        : [];

                      return (
                        <TableRow
                          key={employee.id}
                          className="border-b border-slate-100 transition-colors hover:bg-blue-50/40"
                        >
                          {/* ID */}
                          <TableCell className="min-w-[50px] px-6 py-3.5 font-mono text-sm text-slate-600">
                            {employee.id_number}
                          </TableCell>

                          {/* Employee Identity */}
                          <TableCell className="min-w-[200px]">
                            <div className="flex items-center gap-3">
                              <AvatarWithBirthdayHat
                                className="flex h-10 w-10 shrink-0 items-center justify-center bg-blue-100 text-sm font-bold text-blue-700 ring-2 ring-white"
                                employee={employee}
                              />

                              <div className="min-w-0 justify-center items-center">
                                <p className="max-w-[220px] truncate text-sm font-semibold text-slate-900">
                                  {getShortName(employee)}
                                </p>

                                {/* Email */}
                                <div className="group/email mt-0.5 flex max-w-[220px] items-center gap-1">
                                  <p className="min-w-0 flex-1 truncate text-xs text-slate-500">
                                    {employee.email_address ||
                                      "No email provided"}
                                  </p>

                                  {employee.email_address && (
                                    <Button
                                      aria-label={`Copy email ${employee.email_address}`}
                                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full p-0 text-slate-500 opacity-0 transition-opacity group-hover/email:opacity-100 focus-visible:opacity-100 hover:text-cyan-700"
                                      size="icon"
                                      title="Copy email"
                                      type="button"
                                      variant="ghost"
                                      onClick={() =>
                                        handleCopyEmail(employee.email_address!)
                                      }
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>

                                {/* Phone */}
                                <div className="group/phone mt-0.5 flex max-w-[190px] items-center gap-1">
                                  <p className="min-w-0 flex-1 truncate text-xs text-slate-500">
                                    {employee.mobile_number
                                      ? formatMobileNumber(
                                          employee.mobile_number,
                                        )
                                      : "No phone number provided"}
                                  </p>

                                  {employee.mobile_number && (
                                    <a
                                      aria-label={`Call ${employee.mobile_number}`}
                                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-500 opacity-0 transition-opacity group-hover/phone:opacity-100 hover:text-cyan-700 focus-visible:opacity-100"
                                      href={`tel:${employee.mobile_number.replace(/[^\d+]/g, "")}`}
                                      title={`Call ${employee.mobile_number}`}
                                    >
                                      <Phone className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                </div>

                                {/* Work anniversary notice */}
                                <AnniversaryNotice employee={employee} />
                              </div>
                            </div>
                          </TableCell>

                          {/* Department */}
                          <TableCell className="hidden max-w-[180px] md:table-cell">
                            <span className="block truncate text-sm text-slate-600">
                              {employee.department || "—"}
                            </span>
                          </TableCell>

                          {/* Position */}
                          <TableCell className="hidden lg:table-cell">
                            <div className="flex max-w-[190px] items-center gap-2">
                              <Briefcase className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className="truncate text-sm text-slate-600">
                                {employee.position || "—"}
                              </span>
                              {employee.is_regular ? (
                                <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                  Regular
                                </span>
                              ) : null}
                            </div>
                          </TableCell>

                          {/* Date Hired */}
                          <TableCell className="hidden whitespace-nowrap text-sm text-slate-500 lg:table-cell">
                            {formatDate(employee.date_hired)}
                          </TableCell>

                          {/* Status */}
                          <TableCell className="whitespace-nowrap">
                            <div className="flex flex-col items-start gap-1">
                              <Select
                                disabled={statusUpdatingId === employee.id}
                                value={employee.status}
                                onValueChange={(v) =>
                                  handleQuickStatusChange(
                                    employee,
                                    v as EmployeeStatus,
                                  )
                                }
                              >
                                <SelectTrigger
                                  className={`h-8 w-[110px] rounded-full px-2 py-1 text-xs font-semibold shadow-none focus:ring-0 focus:ring-offset-0 ${STATUS_BADGE_CLASSES[employee.status]}`}
                                >
                                  <span className="inline-flex items-center gap-1.5">
                                    {statusUpdatingId === employee.id && (
                                      <Loader className="h-3 w-3 animate-spin" />
                                    )}
                                    <SelectValue />
                                  </span>
                                </SelectTrigger>

                                <SelectContent
                                  className="z-[999] border border-slate-200 bg-white text-slate-900 shadow-xl"
                                  position="popper"
                                >
                                  {EMPLOYEE_STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {s}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              {missingGovIds.length > 0 && (
                                <div
                                  className="flex max-w-[150px] flex-wrap items-center gap-1"
                                  title={`Pending gov ID: ${missingGovIds.join(", ")}`}
                                >
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                                    !
                                  </span>
                                  {missingGovIds.map((label) => (
                                    <span
                                      key={label}
                                      className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-inset ring-red-200"
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="whitespace-nowrap pr-5">
                            {/* Generate Dropdown Menu */}
                            <div className="flex items-center justify-center py-2">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    className="h-9 gap-1.5 rounded-lg border-slate-200 px-2.5 shadow-none hover:bg-slate-50"
                                    size="sm"
                                    variant="outline"
                                  >
                                    <FileStack className="h-4 w-4" />
                                    Files
                                    <ChevronDown className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>

                                <DropdownMenuContent
                                  align="end"
                                  className="z-[999] w-60 border border-slate-200 bg-white shadow-xl"
                                >
                                  <DropdownMenuItem
                                    onClick={() =>
                                      openEmployeeIdDialog(employee)
                                    }
                                  >
                                    <CreditCard className="mr-2 h-4 w-4 text-indigo-600" />
                                    Issue Employee ID
                                  </DropdownMenuItem>

                                  <DropdownMenuSeparator />

                                  <DropdownMenuItem
                                    onClick={() => openCoeDialog(employee)}
                                  >
                                    <FileText className="mr-2 h-4 w-4 text-blue-600" />
                                    Generate COE
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    onClick={() =>
                                      openClearanceDialog(employee)
                                    }
                                  >
                                    <ClipboardCheck className="mr-2 h-4 w-4 text-pink-600" />
                                    Generate Clearance Form
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    onClick={() => openCertDialog(employee)}
                                  >
                                    <BadgeCheck className="mr-2 h-4 w-4 text-emerald-600" />
                                    Generate Clearance Certificate
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                aria-label={`View ${getFullName(employee)}`}
                                className="h-9 w-9 rounded-lg border-slate-200 text-slate-600 shadow-none hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                size="icon"
                                title="View employee"
                                variant="outline"
                                onClick={() => setViewRecord(employee)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              <Button
                                aria-label={`Edit ${getFullName(employee)}`}
                                className="h-9 w-9 rounded-lg border-slate-200 text-slate-600 shadow-none hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                                size="icon"
                                title="Edit employee"
                                variant="outline"
                                onClick={() => openEditDialog(employee)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>

                              {/* Opens the single shared delete dialog below */}
                              <Button
                                aria-label={`Delete ${getFullName(employee)}`}
                                className="h-9 w-9 rounded-lg border-slate-200 text-slate-500 shadow-none hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                size="icon"
                                title="Delete employee"
                                variant="outline"
                                onClick={() => openDeleteDialog(employee)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-slate-500">
                Page {currentPage} of {Math.max(totalPages, 1)}
                <span className="mx-2">·</span>
                {filteredEmployees.length} matching records
              </p>

              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    className="h-9 rounded-lg px-3"
                    disabled={currentPage === 1}
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>

                  <Button
                    className="h-9 rounded-lg px-3"
                    disabled={currentPage === totalPages}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(p + 1, totalPages))
                    }
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Single shared delete dialog (replaces one-per-row) ── */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setRecordToDelete(null);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete Employee Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-900">
                {recordToDelete ? getFullName(recordToDelete) : "this employee"}
              </span>
              &apos;s record? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              disabled={deleting}
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setRecordToDelete(null);
              }}
            >
              Cancel
            </Button>

            <Button
              disabled={deleting}
              variant="destructive"
              onClick={handleDelete}
            >
              {deleting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Delete Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Birthday popup (celebrants whose birthday is TODAY only) ── */}
      <Dialog open={birthdayPopupOpen} onOpenChange={handleBirthdayPopupChange}>
        <DialogContent className="flex max-h-[88vh] w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl">
          <style>{BIRTHDAY_CSS}</style>

          {/* Poppers + confetti */}
          {birthdayCelebrants.length > 0 && <ConfettiBurst />}

          <DialogHeader>
            {birthdayCelebrants.length > 0 && <BirthdayCake />}

            <DialogTitle className="flex items-center justify-center gap-2 text-xl sm:justify-start">
              <PartyPopper className="h-6 w-6 text-pink-500" />
              {birthdayCelebrants.length === 1
                ? `Happy Birthday, ${(birthdayCelebrants[0] as any).first_name ?? "there"}!`
                : "Happy Birthday!"}
            </DialogTitle>

            <DialogDescription>
              {birthdayCelebrants.length === 1
                ? "Don't forget to greet them today! 🎂"
                : `${birthdayCelebrants.length} teammates are celebrating today. Don't forget to greet them! 🎂`}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1">
            {birthdayCelebrants.map((e) => {
              const age = getTurningAge(e.birthday);

              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-xl border border-pink-200 bg-pink-50 p-3"
                >
                  <AvatarWithBirthdayHat
                    className="flex h-11 w-11 shrink-0 items-center justify-center bg-blue-100 text-sm font-bold text-blue-700 ring-2 ring-white"
                    employee={e}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {getShortName(e)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[e.position, e.department].filter(Boolean).join(" · ") ||
                        "—"}
                    </p>
                  </div>

                  {age ? <AnimatedAge age={age} /> : null}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white"
              onClick={() => handleBirthdayPopupChange(false)}
            >
              Got it 🎉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Work anniversary popup (date_hired is TODAY, 1+ year) ── */}
      <Dialog
        open={anniversaryPopupOpen}
        onOpenChange={setAnniversaryPopupOpen}
      >
        <DialogContent className="flex max-h-[88vh] w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl">
          <style>{BIRTHDAY_CSS}</style>

          {anniversaryCelebrants.length > 0 && <ConfettiBurst />}

          <DialogHeader>
            <div
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 shadow-lg"
              style={{ animation: "bday-pop 0.7s ease-out both" }}
            >
              <Award className="h-10 w-10 text-white" />
            </div>

            <DialogTitle className="flex items-center justify-center gap-2 text-xl sm:justify-start">
              {anniversaryCelebrants.length === 1
                ? `Happy ${formatYears(
                    getAnniversaryYears(anniversaryCelebrants[0].date_hired) ??
                      1,
                  )}, ${(anniversaryCelebrants[0] as any).first_name ?? "there"}!`
                : "Happy Work Anniversary!"}
            </DialogTitle>

            <DialogDescription>
              {anniversaryCelebrants.length === 1
                ? "Salamat sa serbisyo! Don't forget to congratulate them today! 🎉"
                : `${anniversaryCelebrants.length} teammates are celebrating their work anniversary today. 🎉`}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1">
            {anniversaryCelebrants.map((e) => {
              const years = getAnniversaryYears(e.date_hired);

              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
                >
                  <AvatarWithBirthdayHat
                    className="flex h-11 w-11 shrink-0 items-center justify-center bg-blue-100 text-sm font-bold text-blue-700 ring-2 ring-white"
                    employee={e}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {getShortName(e)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[e.position, e.department].filter(Boolean).join(" · ") ||
                        "—"}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      Hired {formatDate(e.date_hired)}
                    </p>
                  </div>

                  {years ? <AnniversaryBadge years={years} /> : null}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-white"
              onClick={() => setAnniversaryPopupOpen(false)}
            >
              Congrats! 🏅
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Employee Dialog */}
      <Dialog
        open={!!viewRecord}
        onOpenChange={(open) => {
          if (!open) setViewRecord(null);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:w-full">
          {viewRecord && (
            <>
              <div className="relative shrink-0 border-b border-slate-200 px-5 py-5 pr-14 sm:px-7">
                <div className="flex min-w-0 items-center gap-3">
                  <AvatarWithBirthdayHat
                    className="flex h-12 w-12 shrink-0 items-center justify-center bg-blue-100 text-lg font-bold text-blue-700"
                    employee={viewRecord}
                  />

                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                      {getFullName(viewRecord)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      ID Number: {viewRecord.id_number}
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
                <div className="space-y-4">
                  <div className="border-b border-slate-200 pb-3">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Employment
                    </p>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      <InfoRow
                        label="Department"
                        value={viewRecord.department}
                      />
                      <InfoRow label="Position" value={viewRecord.position} />
                      <InfoRow
                        label="Date Hired"
                        value={formatDate(viewRecord.date_hired)}
                      />
                      <InfoRow
                        label="Employment Type"
                        value={
                          viewRecord.is_regular ? "Regular" : "Probationary"
                        }
                      />
                      {viewRecord.is_regular ? (
                        <InfoRow
                          label="Date Regularized"
                          value={formatDate(viewRecord.regularization_date)}
                        />
                      ) : null}

                      <InfoRow label="Status" value={viewRecord.status} />
                    </div>
                  </div>

                  <EmployeeMilestones
                    employeeId={viewRecord.id}
                    key={viewRecord.id}
                  />

                  <div className="border-b border-slate-200 pb-3">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Personal Information
                    </p>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      <InfoRow
                        label="Birthday"
                        value={formatDate(viewRecord.birthday)}
                      />
                      <InfoRow
                        label="Birthplace"
                        value={viewRecord.birthplace}
                      />
                      <InfoRow
                        label="Civil Status"
                        value={viewRecord.civil_status}
                      />
                      <InfoRow label="Gender" value={viewRecord.gender} />
                    </div>
                  </div>

                  <div className="border-b border-slate-200 pb-3">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Government ID Numbers
                    </p>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      <InfoRow
                        label="SSS"
                        value={viewRecord.sss_number || PENDING_LABEL}
                      />
                      <InfoRow
                        label="PhilHealth"
                        value={viewRecord.philhealth_number || PENDING_LABEL}
                      />
                      <InfoRow
                        label="Pag-IBIG"
                        value={viewRecord.pagibig_number || PENDING_LABEL}
                      />
                      <InfoRow
                        label="TIN"
                        value={viewRecord.tin_number || PENDING_LABEL}
                      />
                    </div>
                  </div>

                  <div className="border-b border-slate-200 pb-3">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Family Information
                    </p>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      <InfoRow
                        label="Mother's Name"
                        value={[
                          viewRecord.m_first_name,
                          viewRecord.m_middle_name,
                          viewRecord.m_last_name,
                          viewRecord.m_suffix,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      />
                      <InfoRow
                        label="Father's Name"
                        value={[
                          viewRecord.f_first_name,
                          viewRecord.f_middle_name,
                          viewRecord.f_last_name,
                          viewRecord.f_suffix,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      />
                    </div>
                  </div>

                  <div className="border-b border-slate-200 pb-3">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Contact Information
                    </p>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      <InfoRow
                        href={
                          viewRecord.mobile_number
                            ? `tel:${viewRecord.mobile_number.replace(/[^\d+]/g, "")}`
                            : undefined
                        }
                        label="Mobile"
                        value={formatMobileNumber(viewRecord.mobile_number)}
                      />
                      <InfoRow label="Email" value={viewRecord.email_address} />
                      <InfoRow
                        label="Emergency Contact Person"
                        value={viewRecord.emergency_contact_name}
                      />
                      <InfoRow
                        label="Emergency Contact Mobile"
                        value={formatMobileNumber(
                          viewRecord.emergency_contact_mobile_number,
                        )}
                      />
                      <div className="sm:col-span-2">
                        <InfoRow
                          label="Address"
                          value={[
                            viewRecord.house_number,
                            viewRecord.street,
                            viewRecord.village || viewRecord.subdivision,
                            viewRecord.barangay,
                            viewRecord.city_municipality,
                            viewRecord.province,
                            viewRecord.region,
                            viewRecord.zip_code,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    {/* LEFT: Salary + Allowances */}
                    <div className="min-w-0 space-y-4">
                      <div className="border-b border-slate-200 pb-3">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Salary
                        </p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                          <InfoRow
                            label="Basic Salary"
                            value={formatCurrency(viewRecord.salary)}
                          />
                          <InfoRow
                            label="De Minimis"
                            value={formatCurrency(viewRecord.de_minimis)}
                          />
                        </div>
                      </div>

                      {viewRecord.allowances &&
                        viewRecord.allowances.length > 0 && (
                          <div className="pb-3">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Allowances
                            </p>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                              {viewRecord.allowances.map((a, i) => (
                                <InfoRow
                                  key={`${a.label}-${i}`}
                                  label={a.label}
                                  value={formatCurrency(String(a.amount))}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                    </div>

                    {/* RIGHT: Employee Signature */}
                    <div className="min-w-0 pb-3 border-t border-slate-200 pt-6 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Employee Signature
                      </p>

                      {viewRecord.signature_path ? (
                        <EmployeePrivateImage
                          alt={`${getFullName(viewRecord)} signature`}
                          className="max-h-24 max-w-full object-contain"
                          employeeId={viewRecord.id}
                          fallback={
                            <p className="text-sm text-slate-500">
                              No signature uploaded
                            </p>
                          }
                          fileType="signature"
                          storagePath={viewRecord.signature_path}
                        />
                      ) : (
                        <p className="text-sm text-slate-500">
                          No signature uploaded
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: "Employee ID",
                      icon: CreditCard,
                      action: openEmployeeIdDialog,
                      className:
                        "from-indigo-600 to-blue-700 hover:from-indigo-700 hover:to-blue-800",
                    },
                    {
                      label: "COE",
                      icon: FilePlus2,
                      action: openCoeDialog,
                      className:
                        "from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800",
                    },
                    {
                      label: "Clearance Form",
                      icon: ClipboardCheck,
                      action: openClearanceDialog,
                      className:
                        "from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700",
                    },
                    {
                      label: "Clearance Cert",
                      icon: BadgeCheck,
                      action: openCertDialog,
                      className:
                        "from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600",
                    },
                  ].map(({ label, icon: Icon, action, className }) => (
                    <Button
                      key={label}
                      className={`h-auto min-h-11 min-w-0 whitespace-normal rounded-xl bg-gradient-to-r px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors sm:text-sm ${className}`}
                      title={label}
                      type="button"
                      onClick={() => {
                        const employee = viewRecord;

                        if (!employee) return;
                        setViewRecord(null);
                        action(employee);
                      }}
                    >
                      <span className="flex items-center justify-center gap-2 text-center">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{label}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <EmployeeIdDialog
        employee={employeeIdTarget}
        open={employeeIdDialogOpen}
        onEditEmployee={(employee) => {
          setEmployeeIdDialogOpen(false);
          openEditDialog(employee);
        }}
        onOpenChange={setEmployeeIdDialogOpen}
      />

      {/* ── Generate COE dialog, launched from a row's Eye view or its own icon ── */}
      <Dialog open={coeDialogOpen} onOpenChange={setCoeDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <FilePlus2 className="h-6 w-6 text-blue-600" />
              Generate COE
              {coeTargetEmployee ? ` — ${getFullName(coeTargetEmployee)}` : ""}
            </DialogTitle>
            <DialogDescription>
              Name, department, position, and period start are pulled from this
              employee&apos;s masterfile record. Salary, allowances, coverage
              end date, and signatory still need to be filled in. Choose Word or
              PDF below before generating.
            </DialogDescription>
          </DialogHeader>

          <CoeForm
            lockIdNumber
            data={coeFormData}
            errors={coeFormErrors}
            lookupStatus={coeLookupStatus}
            onAllowanceChange={handleCoeAllowanceChange}
            onChange={handleCoeFieldChange}
          />

          <DialogFooter className="mt-4 flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex items-center gap-2 mr-auto">
              <span className="text-sm text-muted-foreground">Download as</span>
              <Select
                disabled={coeSubmitting || coeDownloading}
                value={coeDownloadFormat}
                onValueChange={(v) =>
                  setCoeDownloadFormat(v as CoeDownloadFormat)
                }
              >
                <SelectTrigger className="h-9 w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docx">Word (.docx)</SelectItem>
                  <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={coeSubmitting || coeDownloading}
              variant="outline"
              onClick={() => setCoeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-blue-600 to-purple-600"
              disabled={coeSubmitting || coeDownloading}
              onClick={handleCoeSubmit}
            >
              {coeSubmitting || coeDownloading ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  {coeSubmitting ? "Generating..." : "Downloading..."}
                </>
              ) : (
                "Generate & Download"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Generate Clearance FORM dialog, same launch points as the COE one ── */}
      <ClearanceDialog
        employee={clearanceTargetEmployee}
        open={clearanceDialogOpen}
        onOpenChange={setClearanceDialogOpen}
      />

      {/* ── Generate Clearance (certificate) dialog, launched beside the form's buttons ── */}
      <ClearanceCertificateDialog
        employee={certTargetEmployee}
        open={certDialogOpen}
        onOpenChange={setCertDialogOpen}
      />
    </div>
  );
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
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {href && content !== "—" ? (
        <a
          className="inline-flex items-center gap-1.5 font-medium text-slate-700 transition-colors hover:text-cyan-700"
          href={href}
        >
          <span>{content}</span>
          <Phone className="h-3.5 w-3.5" />
        </a>
      ) : (
        <p className={`font-medium ${isPending ? "text-red-600" : ""}`}>
          {content}
        </p>
      )}
    </div>
  );
}
