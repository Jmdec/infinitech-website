"use client";

// "My Leave" page content, available to ALL roles (employee, HR, superadmin).
// Place next to the page file: app/admin/my-leave/employee-leave-view.tsx
//
// Users can FILE a request and TRACK their own leaves on a calendar.
// They do not see other people's leaves or any approve/delete controls.
// A new request lands in the admin calendar as "Pending review" and HR is emailed.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* ============================================================================
 * SESSION
 * ========================================================================== */

type SessionLike = Record<string, any>;

const pick = (obj: SessionLike | null, ...paths: string[]) => {
  for (const path of paths) {
    const value = path
      .split(".")
      .reduce<any>((current, key) => current?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

// Finds the first non-empty string/number anywhere in the session whose key
// matches `keyPattern` (handles sessions with unexpected nesting).
function deepFind(
  obj: unknown,
  keyPattern: RegExp,
  depth = 0,
): string | undefined {
  if (!obj || typeof obj !== "object" || depth > 4) return undefined;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (
      keyPattern.test(key) &&
      (typeof value === "string" || typeof value === "number") &&
      String(value) !== ""
    ) {
      return String(value);
    }
  }
  for (const value of Object.values(obj as Record<string, unknown>)) {
    const found = deepFind(value, keyPattern, depth + 1);
    if (found) return found;
  }
  return undefined;
}

const REMEMBER_KEY = "myLeaveEmployee";

export function useSession() {
  const [state, setState] = useState<{
    session: SessionLike | null;
    loading: boolean;
  }>({ session: null, loading: true });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin/session", {
          cache: "no-store",
        });
        const session = await response.json();
        if (!response.ok) throw new Error("session");
        if (active) setState({ session, loading: false });
      } catch {
        if (active) setState({ session: null, loading: false });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return state;
}

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const EARLY_LEAVE = "Early Leave";
const PERSONAL_LEAVE = "Personal Leave";
const PENDING = "Pending review";
const CANCELLED = "Cancelled";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-60";
const textareaClass =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

const GRID_7: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("adminSessionActive")
      : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

const dateValue = (date: Date) => format(date, "yyyy-MM-dd");
const parseDay = (value: string) => new Date(`${value}T00:00:00`);

function formatRange(start: string, end: string) {
  const s = parseDay(start);
  const e = parseDay(end);
  if (start === end) return format(s, "MMM d, yyyy");
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
    return `${format(s, "MMM d")}–${format(e, "d, yyyy")}`;
  return `${format(s, "MMM d, yyyy")} – ${format(e, "MMM d, yyyy")}`;
}

const pluralDays = (count: number) =>
  count === 0.5 ? "0.5 day" : `${count} ${count === 1 ? "day" : "days"}`;

const STATUS_STYLES: Record<string, string> = {
  "Pending review": "bg-amber-50 text-amber-800 ring-amber-600/20",
  "Unapproved absence": "bg-rose-50 text-rose-800 ring-rose-600/20",
  "Approved leave without pay": "bg-sky-50 text-sky-800 ring-sky-600/20",
  "Approved (Leave Credits)":
    "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  Cancelled: "bg-slate-50 text-slate-700 ring-slate-500/20",
};
const STATUS_DOT: Record<string, string> = {
  "Pending review": "bg-amber-500",
  "Unapproved absence": "bg-rose-500",
  "Approved leave without pay": "bg-sky-500",
  "Approved (Leave Credits)": "bg-emerald-500",
  Cancelled: "bg-slate-400",
};

function barStyle(status: string) {
  if (status === PENDING)
    return "border border-dashed border-amber-500 bg-amber-50 text-amber-950";
  if (status === "Approved leave without pay") return "bg-sky-100 text-sky-950";
  if (status === "Unapproved absence") return "bg-rose-100 text-rose-950";
  return "bg-emerald-100 text-emerald-950";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? STATUS_STYLES.Cancelled}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-slate-400"}`}
      />
      {status}
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      {children}
      {hint && (
        <span className="block text-xs font-normal text-slate-500">{hint}</span>
      )}
    </label>
  );
}

type MyLeave = {
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
  approver_name: string | null;
};

const leaveTypeLabel = (
  leave: Pick<MyLeave, "leave_type" | "other_leave_type">,
) =>
  leave.other_leave_type
    ? `${leave.leave_type} — ${leave.other_leave_type}`
    : leave.leave_type;

function leaveDurationLabel(
  leave: Pick<
    MyLeave,
    "number_of_days" | "half_day_period" | "early_leave_time"
  >,
) {
  if (leave.early_leave_time) {
    const [h, m] = leave.early_leave_time.split(":").map(Number);
    return `Early leave (${format(new Date(2000, 0, 1, h, m), "h:mm a")})`;
  }
  return leave.half_day_period
    ? `Half day (${leave.half_day_period})`
    : pluralDays(leave.number_of_days);
}

// Lays leave bars out on one calendar week (same idea as the admin calendar).
function layoutWeek(weekDays: Date[], records: MyLeave[]) {
  const first = dateValue(weekDays[0]);
  const last = dateValue(weekDays[6]);
  const laneEnds: number[] = [];
  const segments = records
    .filter((leave) => leave.start_date <= last && leave.end_date >= first)
    .sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) ||
        b.end_date.localeCompare(a.end_date),
    )
    .map((leave) => {
      const clipStart = leave.start_date < first;
      const clipEnd = leave.end_date > last;
      const startCol = differenceInCalendarDays(
        parseDay(clipStart ? first : leave.start_date),
        weekDays[0],
      );
      const endCol = differenceInCalendarDays(
        parseDay(clipEnd ? last : leave.end_date),
        weekDays[0],
      );
      let lane = laneEnds.findIndex((end) => end < startCol);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = endCol;
      return { leave, startCol, endCol, lane, clipStart, clipEnd };
    });
  return { segments, rows: laneEnds.length };
}

type Me = { id: number; number: string; name: string };

type Form = {
  leave_type: string;
  other_leave_type: string;
  start_date: string;
  end_date: string;
  half_day_period: "AM" | "PM" | "";
  early_leave_time: string;
  reason: string;
  proof: File | null;
};

const EMPTY_FORM: Form = {
  leave_type: "",
  other_leave_type: "",
  start_date: "",
  end_date: "",
  half_day_period: "",
  early_leave_time: "",
  reason: "",
  proof: null,
};

/* ============================================================================
 * MY LEAVE VIEW
 * ========================================================================== */

export default function EmployeeLeaveRequestView({
  session,
}: {
  session: SessionLike | null;
}) {
  const [leaveTypes, setLeaveTypes] = useState<string[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [resolving, setResolving] = useState(true);
  const [pickMode, setPickMode] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState<
    { id: number; employee_id: string; name: string }[]
  >([]);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  const [mine, setMine] = useState<MyLeave[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const today = new Date();

  // Leave types
  useEffect(() => {
    void (async () => {
      try {
        const data = await readJson<{ data: string[] }>(
          await adminFetch("/api/admin/leave-requests?resource=types", {
            cache: "no-store",
          }),
        );
        setLeaveTypes(data.data);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load leave types.",
        );
      }
    })();
  }, []);

  // Who is logged in -> which employee record the request is filed under.
  const resolveMe = useCallback(async () => {
    setPickMode(false);
    const numericId = pick(
      session,
      "employee_id",
      "employee.id",
      "user.employee_id",
    );
    const number = pick(
      session,
      "employee.id_number",
      "employee_number",
      "employee.employee_id",
      "user.employee.id_number",
    );
    const name = String(
      pick(session, "employee.name", "name", "user.name") ?? "Employee",
    );

    if (numericId && Number.isFinite(Number(numericId))) {
      setMe({ id: Number(numericId), number: String(number ?? ""), name });
      return;
    }

    const lookup =
      number ??
      pick(session, "employee_id", "user.employee_id") ??
      deepFind(session, /^(employee_?(number|no)|id_number|employee_id)$/i);

    if (lookup) {
      try {
        const data = await readJson<{
          data: { id: number; employee_id: string; name: string }[];
        }>(
          await adminFetch(
            `/api/admin/leave-requests?resource=employees&search=${encodeURIComponent(String(lookup))}`,
            { cache: "no-store" },
          ),
        );
        const match = data.data.find(
          (employee) => employee.employee_id === String(lookup),
        );
        if (match) {
          setMe({ id: match.id, number: match.employee_id, name: match.name });
          return;
        }
      } catch {
        /* fall through to the error below */
      }
    }

    // Last resort: match the account name to ONE employee record.
    // Word-based, so "Justin Mangubat De Castro" also matches
    // "De Castro, Justin Mangubat". Only links when exactly one match is found.
    if (name && name !== "Employee") {
      const tokens = name
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((token) => token.length > 1);
      const longest = [...tokens].sort((a, b) => b.length - a.length)[0];
      for (const query of [name, longest].filter(Boolean)) {
        try {
          const data = await readJson<{
            data: { id: number; employee_id: string; name: string }[];
          }>(
            await adminFetch(
              `/api/admin/leave-requests?resource=employees&search=${encodeURIComponent(query)}`,
              { cache: "no-store" },
            ),
          );
          const matches = data.data.filter((employee) =>
            tokens.every((token) =>
              employee.name.toLowerCase().includes(token),
            ),
          );
          if (matches.length === 1) {
            const match = matches[0];
            setMe({
              id: match.id,
              number: match.employee_id,
              name: match.name,
            });
            return;
          }
        } catch {
          /* try the next query, then fall through to the picker */
        }
      }
    }

    // A previously picked employee (e.g. a superadmin without a linked record).
    try {
      const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
      if (saved?.id) {
        setMe({
          id: Number(saved.id),
          number: String(saved.number ?? ""),
          name: String(saved.name ?? "Employee"),
        });
        return;
      }
    } catch {
      /* ignore */
    }

    console.warn(
      "[my-leave] Could not link account to an employee. Session keys:",
      session ? Object.keys(session) : session,
    );

    // Can't link automatically: let the user pick their Employee ID.
    setPickMode(true);
  }, [session]);

  useEffect(() => {
    setResolving(true);
    void resolveMe().finally(() => setResolving(false));
  }, [resolveMe]);

  // When the account can't be linked automatically, load employees to pick from.
  useEffect(() => {
    if (!pickMode) return;
    void (async () => {
      try {
        const data = await readJson<{
          data: { id: number; employee_id: string; name: string }[];
        }>(
          await adminFetch("/api/admin/leave-requests?resource=employees", {
            cache: "no-store",
          }),
        );
        setEmployeeOptions(data.data);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to load employees.",
        );
      }
    })();
  }, [pickMode]);

  // The user's own leaves, for the tracking calendar.
  // NOTE: the API returns every employee's leaves, so this is filtered here.
  // Better: add a server-side `?mine=true` filter.
  const loadMine = useCallback(async () => {
    if (!me) return;
    setLoadingMine(true);
    try {
      const data = await readJson<{ data: MyLeave[] }>(
        await adminFetch("/api/admin/leave-requests", { cache: "no-store" }),
      );
      setMine(
        data.data.filter(
          (leave) =>
            leave.employee_id === me.id ||
            (!!me.number && leave.employee_number === me.number),
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load your leaves.",
      );
    } finally {
      setLoadingMine(false);
    }
  }, [me]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const dayCount = form.half_day_period
    ? 0.5
    : form.start_date && form.end_date && form.start_date <= form.end_date
      ? differenceInCalendarDays(
          parseDay(form.end_date),
          parseDay(form.start_date),
        ) + 1
      : 0;

  const typeLabel =
    form.leave_type === PERSONAL_LEAVE && form.other_leave_type.trim()
      ? `${form.leave_type} — ${form.other_leave_type.trim()}`
      : form.leave_type;

  const durationLabel = () => {
    if (form.leave_type === EARLY_LEAVE && form.early_leave_time) {
      const [h, m] = form.early_leave_time.split(":").map(Number);
      return `Early leave (${format(new Date(2000, 0, 1, h, m), "h:mm a")})`;
    }
    return form.half_day_period
      ? `Half day (${form.half_day_period})`
      : pluralDays(dayCount);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!me) return;

    if (
      !form.leave_type ||
      (form.leave_type === PERSONAL_LEAVE && !form.other_leave_type.trim()) ||
      !form.start_date ||
      !form.end_date ||
      !form.reason.trim()
    ) {
      toast.error("Complete all required fields.");
      return;
    }
    if (form.start_date > form.end_date) {
      toast.error("End date cannot be before start date.");
      return;
    }
    if (form.half_day_period && form.start_date !== form.end_date) {
      toast.error("Half-day leave must be requested for a single date.");
      return;
    }
    if (form.leave_type === EARLY_LEAVE) {
      if (!form.early_leave_time) {
        toast.error("Enter the time of departure.");
        return;
      }
      if (form.start_date !== form.end_date) {
        toast.error("Early leave must be requested for a single date.");
        return;
      }
    }

    const body = new FormData();
    body.set("employee_id", String(me.id));
    body.set("leave_type", form.leave_type);
    body.set(
      "other_leave_type",
      form.leave_type === PERSONAL_LEAVE ? form.other_leave_type.trim() : "",
    );
    body.set("start_date", form.start_date);
    body.set("end_date", form.end_date);
    body.set("half_day_period", form.half_day_period);
    body.set(
      "early_leave_time",
      form.leave_type === EARLY_LEAVE ? form.early_leave_time : "",
    );
    body.set("reason", form.reason.trim());
    body.set("approved_by", ""); // HR assigns the approver
    if (form.proof) body.set("proof", form.proof);

    setSaving(true);
    try {
      await readJson(
        await adminFetch("/api/admin/leave-requests", {
          method: "POST",
          body,
        }),
      );

      // Email HR. The request is already saved, so a mail failure only warns.
      try {
        await readJson(
          await adminFetch("/api/admin/leave-requests/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employee_id: me.id,
              leave_type: typeLabel,

              start_date: form.start_date,
              end_date: form.end_date,
              duration: durationLabel(),
              reason: form.reason.trim(),
              has_proof: Boolean(form.proof),
              employee_name: me.name,
              employee_number: me.number,
            }),
          }),
        );
      } catch {
        toast("Request saved, but the email to HR could not be sent.", {
          icon: "⚠️",
        });
      }

      toast.success("Leave request sent for review.");
      const filedMonth = startOfMonth(parseDay(form.start_date));
      setForm(EMPTY_FORM);
      setFileKey((value) => value + 1);
      setMonth(filedMonth);
      await loadMine();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to submit the leave request.",
      );
    } finally {
      setSaving(false);
    }
  };

  /* ── calendar data ── */

  const calendarLeaves = useMemo(
    () => mine.filter((leave) => leave.status !== CANCELLED),
    [mine],
  );

  const weeks = useMemo(() => {
    const rangeStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const rangeEnd = addDays(
      startOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      6,
    );
    const days: Date[] = [];
    for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) days.push(d);
    const result: ({ days: Date[] } & ReturnType<typeof layoutWeek>)[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const weekDays = days.slice(i, i + 7);
      result.push({ days: weekDays, ...layoutWeek(weekDays, calendarLeaves) });
    }
    return result;
  }, [month, calendarLeaves]);

  const myRequests = useMemo(
    () =>
      [...mine].sort(
        (a, b) => b.start_date.localeCompare(a.start_date) || b.id - a.id,
      ),
    [mine],
  );

  return (
    <section className="mx-auto max-w-[1400px] space-y-5 p-1 sm:p-2">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="flex items-center gap-3 p-5 sm:p-7">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
            <CalendarRange className="h-6 w-6 text-white sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              My leave
            </h1>
            <p className="mt-1 text-sm text-blue-100">
              Request a leave and track the status of your requests.
              {me
                ? ` Filing as ${me.name}${me.number ? ` (${me.number})` : ""}.`
                : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── Request form (first on mobile, right on desktop) ── */}
        <Card className="order-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:order-2 xl:sticky xl:top-4">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Request a leave
          </h2>

          {resolving && !me ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your
              account…
            </div>
          ) : !me && pickMode ? (
            <div className="space-y-3">
              <p
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                role="status"
              >
                Your account isn&rsquo;t linked to an employee record yet.
                Select your Employee ID to file under.
              </p>
              <Field label="Employee ID">
                <Input
                  list="my-leave-employees"
                  value={pickQuery}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPickQuery(value);
                    const match = employeeOptions.find(
                      (option) => option.employee_id === value,
                    );
                    if (match) {
                      const chosen = {
                        id: match.id,
                        number: match.employee_id,
                        name: match.name,
                      };
                      setMe(chosen);
                      try {
                        localStorage.setItem(
                          REMEMBER_KEY,
                          JSON.stringify(chosen),
                        );
                      } catch {
                        /* ignore */
                      }
                    }
                  }}
                  placeholder="Search or select an Employee ID"
                />
                <datalist id="my-leave-employees">
                  {employeeOptions.map((option) => (
                    <option key={option.id} value={option.employee_id}>
                      {option.name}
                    </option>
                  ))}
                </datalist>
              </Field>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Leave type">
                <select
                  value={form.leave_type}
                  onChange={(event) => {
                    const leaveType = event.target.value;
                    const isEarly = leaveType === EARLY_LEAVE;
                    setForm({
                      ...form,
                      leave_type: leaveType,
                      other_leave_type:
                        leaveType === PERSONAL_LEAVE
                          ? form.other_leave_type
                          : "",
                      early_leave_time: isEarly ? form.early_leave_time : "",
                      half_day_period: isEarly ? "" : form.half_day_period,
                      end_date: isEarly ? form.start_date : form.end_date,
                    });
                  }}
                  required
                  className={selectClass}
                >
                  <option value="">Select leave type</option>
                  {leaveTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </Field>

              {form.leave_type === PERSONAL_LEAVE && (
                <Field label="Specify leave type">
                  <Input
                    value={form.other_leave_type}
                    onChange={(event) =>
                      setForm({ ...form, other_leave_type: event.target.value })
                    }
                    placeholder="Enter the specific leave type"
                    maxLength={150}
                    required
                  />
                </Field>
              )}

              {form.leave_type === EARLY_LEAVE && (
                <Field label="Time of departure">
                  <Input
                    type="time"
                    value={form.early_leave_time}
                    onChange={(event) =>
                      setForm({ ...form, early_leave_time: event.target.value })
                    }
                    required
                  />
                </Field>
              )}

              {form.leave_type !== EARLY_LEAVE && (
                <Field label="Leave duration">
                  <select
                    value={form.half_day_period}
                    onChange={(event) => {
                      const period = event.target.value as "AM" | "PM" | "";
                      setForm({
                        ...form,
                        half_day_period: period,
                        end_date: period ? form.start_date : form.end_date,
                      });
                    }}
                    className={selectClass}
                  >
                    <option value="">Full day</option>
                    <option value="AM">Half day — AM</option>
                    <option value="PM">Half day — PM</option>
                  </select>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date">
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(event) => {
                      const startDate = event.target.value;
                      setForm({
                        ...form,
                        start_date: startDate,
                        end_date:
                          form.half_day_period ||
                          form.leave_type === EARLY_LEAVE
                            ? startDate
                            : form.end_date,
                      });
                    }}
                    required
                  />
                </Field>
                <Field
                  label="End date"
                  hint={
                    form.leave_type === EARLY_LEAVE
                      ? "Early leave"
                      : dayCount
                        ? form.half_day_period
                          ? `Half day (${form.half_day_period})`
                          : pluralDays(dayCount)
                        : undefined
                  }
                >
                  <Input
                    type="date"
                    min={form.start_date || undefined}
                    value={form.end_date}
                    disabled={
                      !!form.half_day_period || form.leave_type === EARLY_LEAVE
                    }
                    onChange={(event) =>
                      setForm({ ...form, end_date: event.target.value })
                    }
                    required
                  />
                </Field>
              </div>

              <Field label="Reason">
                <textarea
                  value={form.reason}
                  onChange={(event) =>
                    setForm({ ...form, reason: event.target.value })
                  }
                  required
                  maxLength={5000}
                  rows={3}
                  className={textareaClass}
                  placeholder="Briefly explain why you need this leave"
                />
              </Field>

              <Field
                label="Proof (optional)"
                hint="PDF, JPG or PNG, e.g. a medical certificate."
              >
                <Input
                  key={fileKey}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) =>
                    setForm({ ...form, proof: event.target.files?.[0] || null })
                  }
                />
              </Field>

              <Button
                type="submit"
                disabled={saving || !me}
                className="h-11 w-full bg-gradient-to-r from-blue-600 to-purple-600 font-semibold text-white hover:from-blue-700 hover:to-purple-700"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {saving ? "Sending…" : "Send request"}
              </Button>
              <p className="text-center text-xs text-slate-500">
                HR is emailed right away and will review your request.
              </p>
            </form>
          )}
        </Card>

        {/* ── My calendar + my requests ── */}
        <div className="order-2 min-w-0 space-y-5 xl:order-1">
          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <h2 className="text-lg font-semibold text-slate-900">
                  {format(month, "MMMM yyyy")}
                </h2>
                <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Approved
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Pending review
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Unapproved
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMonth(startOfMonth(new Date()))}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous month"
                  onClick={() => setMonth((value) => subMonths(value, 1))}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next month"
                  onClick={() => setMonth((value) => addMonths(value, 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div
                  style={GRID_7}
                  className="border-b border-slate-200 bg-slate-50/70"
                >
                  {WEEKDAYS.map((day) => (
                    <div
                      key={day}
                      className="py-2 text-center text-xs font-medium text-slate-500"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="divide-y divide-slate-200">
                  {weeks.map(({ days, segments, rows }, weekIndex) => {
                    const height = Math.max(96, 40 + rows * 26 + 8);
                    return (
                      <div
                        key={weekIndex}
                        className="relative"
                        style={{ minHeight: height }}
                      >
                        <div style={{ ...GRID_7, minHeight: height }}>
                          {days.map((day) => {
                            const inMonth = isSameMonth(day, month);
                            const isToday = isSameDay(day, today);
                            return (
                              <div
                                key={dateValue(day)}
                                className={`border-r border-slate-100 p-1.5 last:border-r-0 ${inMonth ? "" : "bg-slate-50/70"}`}
                              >
                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums ${isToday ? "bg-cyan-700 font-semibold text-white" : inMonth ? "text-slate-800" : "text-slate-400"}`}
                                >
                                  {format(day, "d")}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div
                          style={{
                            ...GRID_7,
                            position: "absolute",
                            top: 38,
                            left: 0,
                            right: 0,
                            gridAutoRows: "22px",
                            rowGap: 4,
                            alignContent: "start",
                            pointerEvents: "none",
                          }}
                        >
                          {segments.map((segment) => (
                            <div
                              key={`${segment.leave.id}-${segment.startCol}`}
                              title={`${leaveTypeLabel(segment.leave)} (${leaveDurationLabel(segment.leave)}; ${segment.leave.status})`}
                              style={{
                                gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
                                gridRow: segment.lane + 1,
                                display: "flex",
                                alignItems: "center",
                                minWidth: 0,
                                pointerEvents: "auto",
                                marginLeft: segment.clipStart ? 0 : 4,
                                marginRight: segment.clipEnd ? 0 : 4,
                              }}
                              className={`px-2 text-xs ${barStyle(segment.leave.status)} ${segment.clipStart ? "rounded-l-none" : "rounded-l"} ${segment.clipEnd ? "rounded-r-none" : "rounded-r"}`}
                            >
                              {!segment.clipStart && (
                                <span className="truncate font-medium">
                                  {leaveTypeLabel(segment.leave)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {loadingMine && (
              <div className="flex items-center justify-center gap-2 border-t border-slate-100 p-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your leaves
              </div>
            )}
          </Card>

          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold text-slate-900">
                My requests{" "}
                <span className="font-normal text-slate-500">
                  ({myRequests.length})
                </span>
              </h2>
            </div>
            {myRequests.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                {loadingMine
                  ? "Loading…"
                  : "You have no leave requests yet. Use the form to send one."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {myRequests.map((leave) => (
                  <li
                    key={leave.id}
                    className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {leaveTypeLabel(leave)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatRange(leave.start_date, leave.end_date)} ·{" "}
                        {leaveDurationLabel(leave)}
                      </p>
                      <p
                        className="mt-0.5 max-w-xl truncate text-xs text-slate-400"
                        title={leave.reason}
                      >
                        {leave.reason}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={leave.status} />
                      {leave.approver_name && (
                        <span className="text-xs text-slate-500">
                          Approver: {leave.approver_name}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}
