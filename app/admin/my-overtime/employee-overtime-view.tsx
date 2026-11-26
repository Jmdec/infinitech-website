"use client";

// "My Overtime" page content, available to ALL roles (employee, HR, superadmin).
// Place next to page.tsx: app/admin/my-overtime/employee-overtime-view.tsx
//
// Employees FILE an overtime (date, duration, reason, optional proof) and TRACK
// the status of their own requests. A new request is "Pending review" until HR
// approves it in the Timekeeping page, which fetches it automatically.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, startOfMonth } from "date-fns";
import {
  AlertCircle,
  Clock,
  FileText,
  Loader2,
  Send,
  Upload,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* ───────────────────────── constants & types ───────────────────────── */

// GET  ?mine=1            -> my own requests
// POST (FormData)         -> file a request
// PATCH /<id> {status}    -> employee may only set "Cancelled" on a pending one
const OT_URL = "/api/admin/overtime-requests";
const MAX_PROOF_MB = 5;
const MAX_OT_MINS = 24 * 60;
const REMEMBER_KEY = "myLeaveEmployee"; // same key as My Leave, so the pick is shared

const PENDING = "Pending review";
const APPROVED = "Approved";
const REJECTED = "Rejected";
const CANCELLED = "Cancelled";

const QUICK_PICKS = [
  { label: "30 mins", minutes: 30 },
  { label: "1 hr", minutes: 60 },
  { label: "2 hrs", minutes: 120 },
  { label: "3 hrs", minutes: 180 },
];

type SessionLike = Record<string, any>;
type Me = { id: number; number: string; name: string };
type EmployeeOption = { id: number; employee_id: string; name: string };

type MyOvertime = {
  id: number;
  employee_id?: number;
  employee_number: string;
  date: string;
  minutes: number | string;
  note: string | null;
  proof_name: string | null;
  status: string;
  reviewed_by?: string | null;
  created_at?: string;
};

/* ───────────────────────── helpers ───────────────────────── */

const selectInputClass =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

const parseDay = (v: string) => new Date(`${v}T00:00:00`);
const dateOnly = (v: string) => String(v ?? "").slice(0, 10);
const toNum = (v: unknown) => Number(v) || 0;

// 90 -> "1h 30m", 120 -> "2h", 45 -> "45m"
const fmtDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};
// 90 -> "1.5 hrs", 60 -> "1 hr", 45 -> "0.75 hr"
const fmtHours = (mins: number) => {
  const h = Math.round((mins / 60) * 100) / 100;
  return `${h} ${h === 1 || h < 1 ? "hr" : "hrs"}`;
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

const pick = (obj: SessionLike | null, ...paths: string[]) => {
  for (const path of paths) {
    const value = path
      .split(".")
      .reduce<any>((current, key) => current?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const STATUS_STYLES: Record<string, string> = {
  [PENDING]: "bg-amber-50 text-amber-800 ring-amber-600/20",
  [APPROVED]: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  [REJECTED]: "bg-rose-50 text-rose-800 ring-rose-600/20",
  [CANCELLED]: "bg-slate-50 text-slate-700 ring-slate-500/20",
};
const STATUS_DOT: Record<string, string> = {
  [PENDING]: "bg-amber-500",
  [APPROVED]: "bg-emerald-500",
  [REJECTED]: "bg-rose-500",
  [CANCELLED]: "bg-slate-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? STATUS_STYLES[CANCELLED]}`}
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

/* ───────────────────────── view ───────────────────────── */

export default function EmployeeOvertimeView({
  session,
}: {
  session: SessionLike | null;
}) {
  const today = useMemo(() => new Date(), []);
  const todayValue = format(today, "yyyy-MM-dd");

  /* who is filing */
  const [me, setMe] = useState<Me | null>(null);
  const [resolving, setResolving] = useState(true);
  const [pickMode, setPickMode] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);

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

    // Look the employee up by number, then by name (only if exactly one match).
    const queries = [number, name !== "Employee" ? name : undefined].filter(
      Boolean,
    ) as string[];

    for (const query of queries) {
      try {
        const data = await readJson<{ data: EmployeeOption[] }>(
          await adminFetch(
            `/api/admin/leave-requests?resource=employees&search=${encodeURIComponent(query)}`,
            { cache: "no-store" },
          ),
        );
        const tokens = query
          .toLowerCase()
          .split(/[\s,]+/)
          .filter((t) => t.length > 1);
        const matches = data.data.filter(
          (e) =>
            e.employee_id === query ||
            tokens.every((t) => e.name.toLowerCase().includes(t)),
        );
        if (matches.length === 1) {
          const m = matches[0];
          setMe({ id: m.id, number: m.employee_id, name: m.name });
          return;
        }
      } catch {
        /* try the next query, then the picker */
      }
    }

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

    setPickMode(true);
  }, [session]);

  useEffect(() => {
    setResolving(true);
    void resolveMe().finally(() => setResolving(false));
  }, [resolveMe]);

  useEffect(() => {
    if (!pickMode) return;
    void (async () => {
      try {
        const data = await readJson<{ data: EmployeeOption[] }>(
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

  /* my requests */
  const [mine, setMine] = useState<MyOvertime[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  const loadMine = useCallback(async () => {
    if (!me) return;
    setLoadingMine(true);
    try {
      const data = await readJson<{ data: MyOvertime[] }>(
        await adminFetch(`${OT_URL}?mine=1`, { cache: "no-store" }),
      );
      // Safety net: the API should already scope this to the logged-in user.
      setMine(
        data.data.filter(
          (r) =>
            (r.employee_id !== undefined && r.employee_id === me.id) ||
            (!!me.number && r.employee_number === me.number) ||
            (r.employee_id === undefined && !me.number),
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load your overtime requests.",
      );
    } finally {
      setLoadingMine(false);
    }
  }, [me]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  /* form */
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("0");
  const [mins, setMins] = useState("0");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const proofInput = useRef<HTMLInputElement>(null);
  const total = (() => {
    const m = hours
      .trim()
      .replace(",", ".")
      .match(/^(\d{1,2})\.(\d{1,2})$/);
    let h = Number(hours) || 0;
    let extra = 0;
    if (m) {
      h = Number(m[1]);
      extra =
        m[2].length === 2 && Number(m[2]) < 60
          ? Number(m[2])
          : Math.round(Number(`0.${m[2]}`) * 60);
    }
    return h * 60 + extra + (Number(mins) || 0);
  })();
  // Hours box accepts "1.30" (= 1h 30m) or "1.5" (= 1.5 hrs = 1h 30m).
  // Runs on blur so it won't interfere while the user is still typing.
  const normalizeHours = () => {
    const m = hours
      .trim()
      .replace(",", ".")
      .match(/^(\d{1,2})\.(\d{1,2})$/);
    if (!m) return;
    const [, h, frac] = m;

    if (frac.length === 2 && Number(frac) < 60) {
      // 1.30 -> 1h 30m
      setHours(h);
      setMins(String((Number(mins) || 0) + Number(frac)));
    } else {
      // 1.5 -> 1h 30m (decimal hours)
      const extra = Math.round(Number(`0.${frac}`) * 60);
      setHours(h);
      setMins(String((Number(mins) || 0) + extra));
    }
  };
  useEffect(() => {
    if (!proof || !proof.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(proof);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proof]);

  const setTotal = (minutes: number) => {
    setHours(String(Math.floor(minutes / 60)));
    setMins(String(minutes % 60));
    setError("");
  };

  const pickProof = (file: File | undefined) => {
    if (proofInput.current) proofInput.current.value = "";
    if (!file) return;
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      setError("Proof must be an image (JPG, PNG) or a PDF.");
      return;
    }
    if (file.size > MAX_PROOF_MB * 1024 * 1024) {
      setError(`Proof is too large. Maximum is ${MAX_PROOF_MB} MB.`);
      return;
    }
    setProof(file);
    setError("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!me) return;

    if (!date) return setError("Choose the date you rendered overtime.");
    if (date > todayValue)
      return setError("You cannot file overtime for a future date.");
    if (total <= 0)
      return setError(
        "Enter how long the overtime was (hours and/or minutes).",
      );
    if (total > MAX_OT_MINS)
      return setError("Overtime cannot be more than 24 hours.");

    const duplicate = mine.some(
      (r) =>
        dateOnly(r.date) === date &&
        (r.status === PENDING || r.status === APPROVED),
    );
    if (duplicate)
      return setError(
        "You already filed overtime for that date. Cancel it first to file a new one.",
      );

    const body = new FormData();
    body.set("employee_id", String(me.id));
    body.set("date", date);
    body.set("minutes", String(total));
    body.set("note", note.trim());
    if (proof) body.set("proof", proof);

    setSaving(true);
    setError("");
    try {
      await readJson(await adminFetch(OT_URL, { method: "POST", body }));

      // Email HR. The request is already saved, so a mail failure only warns.
      try {
        await readJson(
          await adminFetch(`${OT_URL}/notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employee_id: me.id,
              date,
              minutes: total,
              note: note.trim(),
              has_proof: Boolean(proof),
              employee_name: me.name,
              employee_number: me.number,
            }),
          }),
        );
      } catch {
        toast("Overtime saved, but the email to HR could not be sent.", {
          icon: "⚠️",
        });
      }

      toast.success("Overtime sent for review.");
      setDate("");
      setTotal(0);
      setNote("");
      setProof(null);
      await loadMine();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to submit the overtime.",
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelRequest = async (id: number) => {
    try {
      await readJson(
        await adminFetch(`${OT_URL}/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ status: CANCELLED }),
        }),
      );
      toast.success("Overtime request cancelled.");
      await loadMine();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to cancel.");
    }
  };

  const requests = useMemo(
    () =>
      [...mine].sort(
        (a, b) =>
          dateOnly(b.date).localeCompare(dateOnly(a.date)) || b.id - a.id,
      ),
    [mine],
  );

  const monthKey = format(startOfMonth(today), "yyyy-MM");
  const approvedThisMonth = useMemo(
    () =>
      mine
        .filter(
          (r) => r.status === APPROVED && dateOnly(r.date).startsWith(monthKey),
        )
        .reduce((n, r) => n + toNum(r.minutes), 0),
    [mine, monthKey],
  );
  const pendingCount = mine.filter((r) => r.status === PENDING).length;

  return (
    <section className="mx-auto max-w-[1400px] space-y-5 p-1 sm:p-2">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="flex items-center gap-3 p-5 sm:p-7">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
            <Clock className="h-6 w-6 text-white sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              My overtime
            </h1>
            <p className="mt-1 text-sm text-blue-100">
              File your overtime and track its approval.
              {me
                ? ` Filing as ${me.name}${me.number ? ` (${me.number})` : ""}.`
                : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── Form (first on mobile, right on desktop) ── */}
        <Card className="order-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:order-2 xl:sticky xl:top-4">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            File overtime
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
                  list="my-overtime-employees"
                  value={pickQuery}
                  placeholder="Search or select an Employee ID"
                  onChange={(event) => {
                    const value = event.target.value;
                    setPickQuery(value);
                    const match = employeeOptions.find(
                      (o) => o.employee_id === value,
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
                />
                <datalist id="my-overtime-employees">
                  {employeeOptions.map((o) => (
                    <option key={o.id} value={o.employee_id}>
                      {o.name}
                    </option>
                  ))}
                </datalist>
              </Field>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Overtime date">
                <Input
                  type="date"
                  max={todayValue}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setError("");
                  }}
                  required
                />
              </Field>

              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-800">
                  How long was the overtime?
                </p>
                <div className="flex items-end gap-3">
                  <label className="w-24 space-y-1 text-xs text-slate-500">
                    Hours
                    <Input
                      inputMode="decimal"
                      type="text"
                      value={hours}
                      onBlur={normalizeHours}
                      onChange={(e) => {
                        setHours(e.target.value.replace(/[^\d.,]/g, ""));
                        setError("");
                      }}
                    />
                  </label>
                  <label className="w-24 space-y-1 text-xs text-slate-500">
                    Minutes
                    <Input
                      inputMode="numeric"
                      type="number"
                      min={0}
                      max={59}
                      value={mins}
                      onChange={(e) => {
                        setMins(e.target.value);
                        setError("");
                      }}
                    />
                  </label>
                  <div className="pb-2 text-sm font-semibold text-cyan-800">
                    ={" "}
                    {total > 0
                      ? `${fmtDuration(total)} (${fmtHours(total)})`
                      : "0m"}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {QUICK_PICKS.map((q) => (
                    <button
                      key={q.minutes}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        total === q.minutes
                          ? "bg-cyan-700 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                      onClick={() => setTotal(q.minutes)}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Reason / task (optional)">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className={selectInputClass}
                  placeholder="e.g. Month-end report, event coverage"
                />
              </Field>

              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-800">
                  Proof of overtime{" "}
                  <span className="font-normal text-slate-500">(optional)</span>
                </p>
                <input
                  ref={proofInput}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => pickProof(e.target.files?.[0])}
                />
                {proof ? (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt="Overtime proof preview"
                        src={preview}
                        className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-red-50">
                        <FileText className="h-6 w-6 text-red-600" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {proof.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(proof.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => proofInput.current?.click()}
                    >
                      Change
                    </Button>
                    <button
                      type="button"
                      aria-label="Remove proof"
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200"
                      onClick={() => setProof(null)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-cyan-600 hover:bg-cyan-50"
                    onClick={() => proofInput.current?.click()}
                  >
                    <Upload className="h-5 w-5 text-sky-700" />
                    <span className="text-sm font-semibold text-slate-900">
                      Attach proof (optional)
                    </span>
                    <span className="text-xs text-slate-500">
                      Screenshot, photo or PDF of the approval · max{" "}
                      {MAX_PROOF_MB} MB
                    </span>
                  </button>
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

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
                {saving ? "Sending…" : "Send overtime"}
              </Button>
              <p className="text-center text-xs text-slate-500">
                HR reviews it in Timekeeping. Only approved overtime is counted.
              </p>
            </form>
          )}
        </Card>

        {/* ── My requests ── */}
        <div className="order-2 min-w-0 space-y-5 xl:order-1">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-slate-500">
                Approved in {format(today, "MMMM")}
              </p>
              <p className="text-lg font-bold text-cyan-800">
                {approvedThisMonth > 0 ? fmtDuration(approvedThisMonth) : "0"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-slate-500">Waiting for review</p>
              <p className="text-lg font-bold text-amber-700">{pendingCount}</p>
            </div>
          </div>

          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold text-slate-900">
                My overtime requests{" "}
                <span className="font-normal text-slate-500">
                  ({requests.length})
                </span>
              </h2>
            </div>

            {requests.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                {loadingMine
                  ? "Loading…"
                  : "You have no overtime requests yet. Use the form to file one."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
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
                      {r.proof_name && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                          <FileText className="h-3 w-3" />
                          {r.proof_name}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <StatusBadge status={r.status} />
                      {r.status !== PENDING && r.reviewed_by && (
                        <span className="text-xs text-slate-500">
                          By: {r.reviewed_by}
                        </span>
                      )}
                      {r.status === PENDING && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void cancelRequest(r.id)}
                        >
                          Cancel request
                        </Button>
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
