"use client";

// Request Evaluation (employee). Place at app/admin/my-evaluation/page.tsx
//
// The employee asks HR to evaluate them (1st evaluation, 2nd evaluation or a
// regularization review) and tracks the status of each request.
//
// API (same pattern as /api/admin/coe-requests):
//   GET  /api/admin/evaluation-requests?employee_id=:id   -> { data: EvalRequest[] }
//   POST /api/admin/evaluation-requests                   -> body: { employee_id, evaluation_type, preferred_date, notes }
//   POST /api/admin/evaluation-requests/:id/cancel        -> body: { employee_id }
//   POST /api/admin/evaluation-requests/notify            -> emails HR about the new request
//   HR side: PATCH /api/admin/evaluation-requests/:id     -> { status, scheduled_date, hr_remarks }

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ClipboardCheck, Loader2, Send } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/admin-fetch";

const EVALUATION_TYPES = [
  "1st evaluation",
  "2nd evaluation",
  "Regularization review",
];

const STATUS_STYLES: Record<string, string> = {
  "Pending review": "bg-amber-50 text-amber-800 ring-amber-600/20",
  Scheduled: "bg-sky-50 text-sky-800 ring-sky-600/20",
  Completed: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  Rejected: "bg-rose-50 text-rose-800 ring-rose-600/20",
  Cancelled: "bg-slate-50 text-slate-700 ring-slate-500/20",
};

const selectClass =
  "h-10 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";
const textareaClass =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

type Me = { id: number; number: string; name: string };

type EvalRequest = {
  id: number;
  employee_id: number;
  evaluation_type: string;
  preferred_date: string | null;
  scheduled_date: string | null;
  notes: string | null;
  status: string;
  hr_remarks: string | null;
  created_at: string;
};

type Form = {
  evaluation_type: string;
  preferred_date: string;
  notes: string;
};

const EMPTY_FORM: Form = {
  evaluation_type: "",
  preferred_date: "",
  notes: "",
};

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

const fmtDay = (value?: string | null) =>
  value
    ? format(new Date(`${value.slice(0, 10)}T00:00:00`), "MMM d, yyyy")
    : "—";

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

export default function RequestEvaluationPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [resolving, setResolving] = useState(true);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [requests, setRequests] = useState<EvalRequest[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Who is signed in -> the employee record the request is filed under.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await readJson(
          await adminFetch("/api/admin/session", { cache: "no-store" }),
        );
        const emp = session?.employee;
        if (active && emp?.id) {
          setMe({
            id: Number(emp.id),
            number: String(emp.id_number ?? ""),
            name: String(emp.name ?? "Employee"),
          });
        }
      } catch {
        /* shows the "not linked" notice */
      } finally {
        if (active) setResolving(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!me) return;
    setLoadingList(true);
    try {
      const data = await readJson<{ data: EvalRequest[] }>(
        await adminFetch(
          `/api/admin/evaluation-requests?employee_id=${me.id}`,
          {
            cache: "no-store",
          },
        ),
      );
      setRequests(data.data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load your requests.",
      );
    } finally {
      setLoadingList(false);
    }
  }, [me]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!me) return;

    if (!form.evaluation_type) {
      toast.error("Choose the type of evaluation.");
      return;
    }

    // One open request per evaluation type.
    const hasOpen = requests.some(
      (r) =>
        r.evaluation_type === form.evaluation_type &&
        (r.status === "Pending review" || r.status === "Scheduled"),
    );
    if (hasOpen) {
      toast.error(
        `You already have an open request for your ${form.evaluation_type}.`,
      );
      return;
    }

    setSaving(true);
    try {
      await readJson(
        await adminFetch("/api/admin/evaluation-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: me.id,
            evaluation_type: form.evaluation_type,
            preferred_date: form.preferred_date || null,
            notes: form.notes.trim() || null,
          }),
        }),
      );

      // Email HR. The request is already saved, so a mail failure only warns.
      try {
        await readJson(
          await adminFetch("/api/admin/evaluation-requests/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employee_id: me.id,
              employee_name: me.name,
              employee_number: me.number,
              evaluation_type: form.evaluation_type,
              preferred_date: form.preferred_date,
              notes: form.notes.trim(),
            }),
          }),
        );
      } catch {
        toast("Request saved, but the email to HR could not be sent.", {
          icon: "⚠️",
        });
      }

      toast.success("Evaluation request sent for review.");
      setForm(EMPTY_FORM);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to submit the request.",
      );
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (request: EvalRequest) => {
    if (!me) return;
    setCancellingId(request.id);
    try {
      await readJson(
        await adminFetch(
          `/api/admin/evaluation-requests/${request.id}/cancel`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employee_id: me.id }),
          },
        ),
      );
      toast.success("Request cancelled.");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to cancel the request.",
      );
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section className="mx-auto max-w-[1400px] space-y-5 p-1 sm:p-2">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="flex items-center gap-3 p-5 sm:p-7">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
            <ClipboardCheck className="h-6 w-6 text-white sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Request evaluation
            </h1>
            <p className="mt-1 text-sm text-blue-100">
              Ask HR to evaluate you and track the status of your request.
              {me
                ? ` Filing as ${me.name}${me.number ? ` (${me.number})` : ""}.`
                : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Request form */}
        <Card className="order-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:order-2 xl:sticky xl:top-4">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            New request
          </h2>

          {resolving ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your
              account…
            </div>
          ) : !me ? (
            <p
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              role="status"
            >
              Your account isn&rsquo;t linked to an employee record yet. Ask HR
              to link it.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Type of evaluation">
                <select
                  value={form.evaluation_type}
                  onChange={(e) =>
                    setForm({ ...form, evaluation_type: e.target.value })
                  }
                  required
                  className={selectClass}
                >
                  <option value="">Select evaluation</option>
                  {EVALUATION_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>

              <Field
                label="Preferred date (optional)"
                hint="HR will confirm the final schedule."
              >
                <Input
                  type="date"
                  min={format(new Date(), "yyyy-MM-dd")}
                  value={form.preferred_date}
                  onChange={(e) =>
                    setForm({ ...form, preferred_date: e.target.value })
                  }
                />
              </Field>

              <Field label="Notes (optional)">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  maxLength={1000}
                  rows={3}
                  className={textareaClass}
                  placeholder="Anything HR should know, e.g. your supervisor or availability"
                />
              </Field>

              <Button
                type="submit"
                disabled={saving}
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
                HR is emailed right away and will schedule your evaluation.
              </p>
            </form>
          )}
        </Card>

        {/* My requests */}
        <Card className="order-2 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:order-1">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-900">
              My requests{" "}
              <span className="font-normal text-slate-500">
                ({requests.length})
              </span>
            </h2>
          </div>

          {requests.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              {loadingList
                ? "Loading…"
                : "You have no evaluation requests yet. Use the form to send one."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {r.evaluation_type}
                    </p>
                    <p className="text-xs text-slate-500">
                      Filed {fmtDay(r.created_at)}
                      {r.preferred_date
                        ? ` · Preferred ${fmtDay(r.preferred_date)}`
                        : ""}
                      {r.scheduled_date
                        ? ` · Scheduled ${fmtDay(r.scheduled_date)}`
                        : ""}
                    </p>
                    {r.notes && (
                      <p
                        className="mt-0.5 max-w-xl truncate text-xs text-slate-400"
                        title={r.notes}
                      >
                        {r.notes}
                      </p>
                    )}
                    {r.hr_remarks && (
                      <p className="mt-1 text-xs text-slate-600">
                        HR: {r.hr_remarks}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[r.status] ?? STATUS_STYLES.Cancelled}`}
                    >
                      {r.status}
                    </span>
                    {r.status === "Pending review" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-slate-500 hover:text-rose-600"
                        disabled={cancellingId === r.id}
                        onClick={() => void cancel(r)}
                      >
                        {cancellingId === r.id
                          ? "Cancelling…"
                          : "Cancel request"}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}
