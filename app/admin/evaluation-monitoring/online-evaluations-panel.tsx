"use client";

// Online performance appraisal: list + form, in ONE file.
// Used as the "Online evaluation" tab of the Evaluation Monitoring page.
//   app/admin/evaluation-monitoring/online-evaluations-panel.tsx
//
// NEW: "Download .docx" generates the Performance Appraisal in the browser by
// filling public/templates/performance_appraisal.docx (see generate-appraisal-docx.ts).
//
// API (via Next proxy -> Laravel):
//   GET   /api/admin/evaluations
//   POST  /api/admin/evaluations
//   GET   /api/admin/evaluations/:id
//   PATCH /api/admin/evaluations/:id
//   POST  /api/admin/evaluations/:id/:action   (submit|review|approve|acknowledge|revert)
//   GET   /api/admin/evaluation-monitoring?resource=employees   (employee picker)

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, Loader2, Search } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminFetch } from "@/lib/admin-fetch";
import { downloadAppraisalDocx } from "@/lib/generate-appraisal-docx";

/* ============================================================================
 * FORM (the online "Performance Appraisal")
 * ========================================================================== */

export type EvalStatus =
  | "Draft"
  | "Submitted"
  | "Reviewed"
  | "Approved"
  | "Acknowledged";

export type Evaluation = {
  id: number;
  employee_id: number;
  employee_name: string;
  department: string | null;
  job_title: string | null;
  evaluation_request_id: number | null;
  evaluation_type: string | null;
  rating_period: string;
  ratings: (number | null)[];
  total_score: number;
  interpretation: string | null;
  recommend_regular: boolean | null;
  comments: string | null;
  status: EvalStatus;
  rated_by_name: string | null;
  rated_at: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  employee_response: "agree" | "disagree" | null;
  employee_disagree_items: string | null;
  employee_acknowledged_at: string | null;
  created_at: string;
};

/** Used to start a new evaluation (e.g. from an evaluation request row). */
export type EvaluationSeed = {
  employee_id: number;
  employee_name: string;
  department: string | null;
  job_title: string | null;
  evaluation_request_id?: number | null;
  evaluation_type?: string | null;
};

/**
 * Statuses where the .docx can be downloaded.
 * Add "Submitted" / "Reviewed" here if HR wants a copy earlier.
 */
const DOWNLOADABLE: EvalStatus[] = ["Approved", "Acknowledged"];

export const CRITERIA = [
  {
    title: "Work Attitude",
    prompts: [
      "How does the employee feel about his/her job? Is he/she interested in his/her work?",
      "Does the employee work hard? Is he/she alert and resourceful?",
    ],
  },
  {
    title: "Knowledge of the Job",
    prompts: ["Does he/she know the requirements of the job being worked on?"],
  },
  {
    title: "Quality of Work",
    prompts: [
      "Is he/she accurate, thorough and neat? Consider working habits. Extent to which decisions and actions are based on facts, sound reasoning and weighing of outcomes.",
    ],
  },
  {
    title: "Ability to Handle Assigned Workload",
    prompts: [
      "Consider working habits. Is work completed on time? Do you have to follow up?",
    ],
  },
  {
    title: "Ability to Work with Supervisor",
    prompts: ["Consider working relationship / interaction with superior."],
  },
  {
    title: "Ability to Work with Co-employee",
    prompts: ["Can he/she work harmoniously with others?"],
  },
  {
    title: "Attendance (Absences / Tardiness / Undertime)",
    prompts: [
      "Is he/she regular and punctual in attendance? What is his/her attitude towards time lost?",
    ],
  },
  {
    title: "Compliance with Company Rules and Regulations",
    prompts: [
      "Does the employee follow the company's rules and regulations at all times?",
    ],
  },
  {
    title: "Grooming and Appearance",
    prompts: [
      "Does he/she wear the uniform completely and neatly? Is he/she clean and neat?",
    ],
  },
  {
    title: "Communication Skills",
    prompts: [
      "How successful is he/she in expressing himself/herself orally, verbally and in written form?",
    ],
  },
];

export const SCALE = [
  { value: 1, label: "Poor" },
  { value: 2, label: "Needs Improvement" },
  { value: 3, label: "Meets Minimum Requirement" },
  { value: 4, label: "Very Satisfactory" },
  { value: 5, label: "Outstanding" },
];

export function interpret(total: number) {
  if (total >= 41) return "Highly suitable to the position";
  if (total >= 31) return "Suitable to the position";
  if (total >= 16) return "Fails to meet minimum requirements of the job";
  return "Employee advised to resign";
}

const BANDS = [
  { range: "50 – 41", text: "Highly suitable to the position" },
  { range: "40 – 31", text: "Suitable to the position" },
  { range: "30 – 16", text: "Fails to meet minimum requirements of the job" },
  { range: "15 – 0", text: "Employee advised to resign" },
];

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

const fmtStamp = (value?: string | null) =>
  value ? format(new Date(value), "MMM d, yyyy h:mm a") : null;

const textareaClass =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:bg-slate-50 disabled:text-slate-600";

function SignOff({
  label,
  name,
  at,
}: {
  label: string;
  name: string | null;
  at: string | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {name ? (
        <>
          <p className="mt-1 font-medium text-slate-900">{name}</p>
          <p className="text-xs text-slate-500">{fmtStamp(at)}</p>
        </>
      ) : (
        <p className="mt-1 text-slate-400">Pending</p>
      )}
    </div>
  );
}

function EvaluationFormDialog({
  open,
  evaluationId,
  seed,
  onClose,
  onChanged,
}: {
  open: boolean;
  /** Existing evaluation to open. Leave empty to start a new one from `seed`. */
  evaluationId?: number | null;
  seed?: EvaluationSeed | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [id, setId] = useState<number | null>(null);
  const [status, setStatus] = useState<EvalStatus>("Draft");
  const [meta, setMeta] = useState<Evaluation | null>(null);

  const [period, setPeriod] = useState("");
  const [ratings, setRatings] = useState<(number | null)[]>(
    Array(CRITERIA.length).fill(null),
  );
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [comments, setComments] = useState("");
  const [response, setResponse] = useState<"agree" | "disagree" | null>(null);
  const [disagreeItems, setDisagreeItems] = useState("");

  const person = meta ?? seed ?? null;

  const apply = (e: Evaluation) => {
    setMeta(e);
    setId(e.id);
    setStatus(e.status);
    setPeriod(e.rating_period);
    setRatings(
      CRITERIA.map((_, i) => (e.ratings?.[i] ?? null) as number | null),
    );
    setRecommend(e.recommend_regular);
    setComments(e.comments ?? "");
    setResponse(e.employee_response);
    setDisagreeItems(e.employee_disagree_items ?? "");
  };

  // Load or reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setMeta(null);
    setId(evaluationId ?? null);
    setStatus("Draft");
    setPeriod("");
    setRatings(Array(CRITERIA.length).fill(null));
    setRecommend(null);
    setComments("");
    setResponse(null);
    setDisagreeItems("");

    if (!evaluationId) return;
    setLoading(true);
    adminFetch(`/api/admin/evaluations/${evaluationId}`, { cache: "no-store" })
      .then((r) => readJson<{ data: Evaluation }>(r))
      .then((d) => apply(d.data))
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Unable to load evaluation.",
        ),
      )
      .finally(() => setLoading(false));
  }, [open, evaluationId]);

  const total = useMemo(
    () => ratings.reduce<number>((sum, v) => sum + (v ?? 0), 0),
    [ratings],
  );
  const answered = ratings.filter((v) => v !== null).length;
  const editable = status === "Draft";
  const canDownload = !!meta && DOWNLOADABLE.includes(status);

  const body = () => ({
    rating_period: period.trim(),
    ratings,
    recommend_regular: recommend,
    comments: comments.trim() || null,
  });

  // Create or update the draft, return the saved evaluation.
  const persist = async (): Promise<Evaluation> => {
    if (!period.trim()) throw new Error("Enter the rating period.");
    if (id) {
      const d = await readJson<{ data: Evaluation }>(
        await adminFetch(`/api/admin/evaluations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body()),
        }),
      );
      return d.data;
    }
    if (!seed) throw new Error("No employee selected.");
    const d = await readJson<{ data: Evaluation }>(
      await adminFetch("/api/admin/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body(),
          employee_id: seed.employee_id,
          employee_name: seed.employee_name,
          department: seed.department,
          job_title: seed.job_title,
          evaluation_request_id: seed.evaluation_request_id ?? null,
          evaluation_type: seed.evaluation_type ?? null,
        }),
      }),
    );
    return d.data;
  };

  const run = async (
    label: string,
    work: () => Promise<Evaluation>,
    closeAfter = false,
  ) => {
    setBusy(true);
    try {
      const saved = await work();
      apply(saved);
      toast.success(label);
      onChanged?.();
      if (closeAfter) onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: string, extra?: object) => {
    const saved = editable ? await persist() : null;
    const target = saved?.id ?? id;
    const d = await readJson<{ data: Evaluation }>(
      await adminFetch(`/api/admin/evaluations/${target}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extra ?? {}),
      }),
    );
    return d.data;
  };

  const submit = () => {
    if (answered < CRITERIA.length) {
      toast.error("Rate all 10 criteria before submitting.");
      return;
    }
    if (recommend === null) {
      toast.error("Choose a recommendation for regular employment.");
      return;
    }
    void run("Evaluation submitted.", () => act("submit"));
  };

  const acknowledge = () => {
    if (!response) {
      toast.error("Choose whether the employee agrees or disagrees.");
      return;
    }
    if (response === "disagree" && !disagreeItems.trim()) {
      toast.error("List the items the employee disagrees with.");
      return;
    }
    void run("Acknowledgement recorded.", () =>
      act("acknowledge", {
        response,
        disagree_items: response === "disagree" ? disagreeItems.trim() : null,
      }),
    );
  };

  // Build the Word document in the browser from the saved evaluation.
  const download = async () => {
    if (!meta) return;
    setDownloading(true);
    try {
      await downloadAppraisalDocx(meta);
      toast.success("Performance appraisal downloaded.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to generate document.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Performance appraisal</DialogTitle>
          <DialogDescription>
            {person?.employee_name}
            {person?.job_title || person?.department
              ? `, ${[person?.department, person?.job_title].filter(Boolean).join(" / ")}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block flex-1 space-y-1.5 text-sm font-medium text-slate-800">
                <span>Rating period</span>
                <Input
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="e.g. August to October 2026"
                  disabled={!editable}
                  maxLength={100}
                />
              </label>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {status}
              </span>
            </div>

            {/* Criteria */}
            <ol className="space-y-3">
              {CRITERIA.map((c, i) => (
                <li
                  key={c.title}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <fieldset disabled={!editable}>
                    <legend className="text-sm font-semibold text-slate-900">
                      {i + 1}. {c.title.toUpperCase()}
                    </legend>
                    {c.prompts.map((p) => (
                      <p key={p} className="mt-1 text-xs text-slate-500">
                        {p}
                      </p>
                    ))}
                    <div
                      role="radiogroup"
                      aria-label={`Rating for ${c.title}`}
                      className="mt-3 grid grid-cols-5 gap-1.5"
                    >
                      {SCALE.map((s) => {
                        const on = ratings[i] === s.value;
                        return (
                          <button
                            key={s.value}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            title={s.label}
                            onClick={() =>
                              setRatings((cur) =>
                                cur.map((v, idx) => (idx === i ? s.value : v)),
                              )
                            }
                            className={`rounded-md px-1 py-2 text-center ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-default ${on ? "bg-cyan-700 text-white ring-cyan-700" : "bg-white text-slate-700 ring-slate-300 enabled:hover:bg-slate-50"}`}
                          >
                            <span className="block text-sm font-semibold">
                              {s.value}
                            </span>
                            <span className="hidden text-[10px] leading-tight sm:block">
                              {s.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </li>
              ))}
            </ol>

            {/* Total */}
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  TOTAL SCORE
                </p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">
                  {total}
                  <span className="text-sm font-normal text-slate-500">
                    {" "}
                    / 50
                  </span>
                </p>
              </div>
              <p className="mt-1 text-sm text-slate-700">
                {answered === 0
                  ? "Rate the criteria to see the interpretation."
                  : answered < CRITERIA.length
                    ? `${answered} of ${CRITERIA.length} rated. Current standing: ${interpret(total)}.`
                    : interpret(total)}
              </p>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
                {BANDS.map((b) => (
                  <div key={b.range} className="flex gap-2">
                    <dt className="w-14 shrink-0 tabular-nums">{b.range}</dt>
                    <dd>{b.text}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Recommendation */}
            <fieldset disabled={!editable} className="space-y-2">
              <legend className="text-sm font-semibold text-slate-900">
                RECOMMENDATION: REGULAR EMPLOYMENT
              </legend>
              <div className="flex gap-2">
                {[
                  { label: "Yes", value: true },
                  { label: "No", value: false },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={recommend === o.value}
                    onClick={() => setRecommend(o.value)}
                    className={`rounded-md px-5 py-1.5 text-sm font-medium ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-default ${recommend === o.value ? "bg-cyan-700 text-white ring-cyan-700" : "bg-white text-slate-700 ring-slate-300 enabled:hover:bg-slate-50"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block space-y-1.5 text-sm font-medium text-slate-800">
              <span>Comments / remarks</span>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
                maxLength={3000}
                disabled={!editable}
                className={textareaClass}
              />
            </label>

            {/* Sign-offs */}
            {id && (
              <div className="grid gap-2 sm:grid-cols-3">
                <SignOff
                  label="Rated by"
                  name={meta?.rated_by_name ?? null}
                  at={meta?.rated_at ?? null}
                />
                <SignOff
                  label="Reviewed by"
                  name={meta?.reviewed_by_name ?? null}
                  at={meta?.reviewed_at ?? null}
                />
                <SignOff
                  label="Approved by"
                  name={meta?.approved_by_name ?? null}
                  at={meta?.approved_at ?? null}
                />
              </div>
            )}

            {/* Employee acknowledgement */}
            {(status === "Approved" || status === "Acknowledged") && (
              <fieldset
                disabled={status === "Acknowledged"}
                className="space-y-3 rounded-lg border border-slate-200 p-3"
              >
                <legend className="px-1 text-sm font-semibold text-slate-900">
                  Employee acknowledgement
                </legend>
                <p className="text-sm text-slate-600">
                  The above appraisal was discussed with me by my superior and
                  I:
                </p>
                <div className="flex gap-2">
                  {(["agree", "disagree"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={response === v}
                      onClick={() => setResponse(v)}
                      className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-default ${response === v ? "bg-cyan-700 text-white ring-cyan-700" : "bg-white text-slate-700 ring-slate-300 enabled:hover:bg-slate-50"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {response === "disagree" && (
                  <label className="block space-y-1.5 text-sm font-medium text-slate-800">
                    <span>Items the employee disagrees with</span>
                    <textarea
                      value={disagreeItems}
                      onChange={(e) => setDisagreeItems(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      className={textareaClass}
                    />
                  </label>
                )}
                {status === "Acknowledged" && (
                  <p className="text-xs text-slate-500">
                    Acknowledged {fmtStamp(meta?.employee_acknowledged_at)}.
                  </p>
                )}
              </fieldset>
            )}

            {/* Actions */}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              {canDownload && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={downloading}
                  onClick={() => void download()}
                  className="sm:mr-auto"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download .docx
                </Button>
              )}

              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>

              {status === "Draft" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run("Draft saved.", persist)}
                  >
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={submit}
                    className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Submit rating
                  </Button>
                </>
              )}

              {(status === "Submitted" || status === "Reviewed") && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run("Returned to draft.", () => act("revert"))
                    }
                  >
                    Return to draft
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        status === "Submitted"
                          ? "Marked as reviewed."
                          : "Evaluation approved.",
                        () =>
                          act(status === "Submitted" ? "review" : "approve"),
                      )
                    }
                    className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {status === "Submitted" ? "Mark reviewed" : "Approve"}
                  </Button>
                </>
              )}

              {status === "Approved" && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={acknowledge}
                  className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Record acknowledgement
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================================
 * LIST + EMPLOYEE PICKER
 * ========================================================================== */

type EmployeeOption = {
  id: number;
  name: string;
  number: string | null;
  position: string | null;
  department: string | null;
};

// Active employees only. Reads the common status field names; an employee with
// no status field at all is kept, so a missing field never empties the list.
function isActive(e: any): boolean {
  const raw = e?.status ?? e?.employee_status ?? e?.is_active ?? e?.active;
  if (raw === undefined || raw === null || raw === "") return true;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;
  return String(raw).trim().toLowerCase() === "active";
}

// The masterfile response shape is not known, so read the common field names.
function toOption(e: any): EmployeeOption | null {
  const id = Number(e?.id ?? e?.employee_id);
  const name =
    e?.full_name ??
    e?.name ??
    e?.employee_name ??
    [e?.first_name, e?.middle_name, e?.last_name].filter(Boolean).join(" ");
  if (!id || !name) return null;
  return {
    id,
    name,
    number:
      e?.employee_number ??
      (e?.employee_id != null ? String(e.employee_id) : null),
    position: e?.position ?? e?.job_title ?? null,
    department: e?.department ?? null,
  };
}

const FILTERS: ("All" | EvalStatus)[] = [
  "Draft",
  "Submitted",
  "Reviewed",
  "Approved",
  "Acknowledged",
  "All",
];

const STATUS_STYLES: Record<EvalStatus, string> = {
  Draft: "bg-slate-50 text-slate-700 ring-slate-500/20",
  Submitted: "bg-amber-50 text-amber-800 ring-amber-600/20",
  Reviewed: "bg-sky-50 text-sky-800 ring-sky-600/20",
  Approved: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  Acknowledged: "bg-cyan-50 text-cyan-800 ring-cyan-600/20",
};

const fmtDay = (value?: string | null) =>
  value ? format(new Date(value), "MMM d, yyyy") : "—";

export default function OnlineEvaluationsPanel({
  startSeed,
  onStartHandled,
  onChanged,
}: {
  /** Set by the page (e.g. from an employee's Details) to open a new evaluation. */
  startSeed?: EvaluationSeed | null;
  onStartHandled?: () => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | EvalStatus>("Submitted");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [seed, setSeed] = useState<EvaluationSeed | null>(null);
  const [picking, setPicking] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    if (startSeed) {
      setSeed(startSeed);
      onStartHandled?.();
    }
  }, [startSeed]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPicker = async () => {
    setPicking(true);
    setEmpSearch("");
    if (employees.length) return;
    setEmpLoading(true);
    try {
      const res = await adminFetch(
        "/api/admin/evaluation-monitoring?resource=employees",
        {
          cache: "no-store",
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Request failed.");
      const rows: any[] = Array.isArray(data) ? data : (data.data ?? []);
      setEmployees(
        rows
          .filter(isActive)
          .map(toOption)
          .filter((o): o is EmployeeOption => o !== null),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load employees.",
      );
    } finally {
      setEmpLoading(false);
    }
  };

  const shownEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return employees
      .filter(
        (e) =>
          !q ||
          [e.name, e.number, e.position, e.department].some((v) =>
            (v || "").toLowerCase().includes(q),
          ),
      )
      .slice(0, 50);
  }, [employees, empSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/evaluations", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Request failed.");
      setItems(data.data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load evaluations.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Download straight from the list row. The full record is fetched first so
  // the document never depends on what the list endpoint happens to return.
  const downloadRow = async (row: Evaluation) => {
    setDownloadingId(row.id);
    try {
      const d = await readJson<{ data: Evaluation }>(
        await adminFetch(`/api/admin/evaluations/${row.id}`, {
          cache: "no-store",
        }),
      );
      await downloadAppraisalDocx(d.data);
      toast.success("Performance appraisal downloaded.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to generate document.",
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const counts = useMemo(() => {
    const map: Record<string, number> = { All: items.length };
    for (const e of items) map[e.status] = (map[e.status] || 0) + 1;
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (e) =>
        (filter === "All" || e.status === filter) &&
        (!q ||
          [e.employee_name, e.department, e.job_title, e.rating_period].some(
            (v) => (v || "").toLowerCase().includes(q),
          )),
    );
  }, [items, filter, search]);

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="space-y-3 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="font-semibold text-slate-900">
            Evaluations{" "}
            <span className="font-normal text-slate-500">
              ({filtered.length})
            </span>
          </h2>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <Button
              onClick={openPicker}
              className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
            >
              New evaluation
            </Button>
            <div className="relative w-full md:w-72">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, department or period"
                aria-label="Search evaluations"
                className="pl-9"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${filter === f ? "bg-cyan-700 text-white ring-cyan-700" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}
            >
              {f}
              <span
                className={`tabular-nums ${filter === f ? "text-cyan-100" : "text-slate-400"}`}
              >
                {counts[f] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading evaluations
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="font-medium text-slate-900">No evaluations</p>
          <p className="mt-1 text-sm text-slate-500">
            Use New evaluation to start one, or change the filter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Employee</th>
                <th className="px-3 py-2.5 font-medium">Period</th>
                <th className="px-3 py-2.5 font-medium">Score</th>
                <th className="px-3 py-2.5 font-medium">Regular?</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="w-[190px] px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((e) => (
                <tr key={e.id} className="text-slate-700 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {e.employee_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[e.department, e.job_title].filter(Boolean).join(" / ")}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p>{e.rating_period}</p>
                    <p className="text-xs text-slate-500">
                      Created {fmtDay(e.created_at)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                    {e.total_score}/50
                  </td>
                  <td className="px-3 py-3">
                    {e.recommend_regular === null
                      ? "—"
                      : e.recommend_regular
                        ? "Yes"
                        : "No"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[e.status]}`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {DOWNLOADABLE.includes(e.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadingId === e.id}
                          onClick={() => void downloadRow(e)}
                          aria-label={`Download appraisal of ${e.employee_name}`}
                        >
                          {downloadingId === e.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          .docx
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOpenId(e.id)}
                      >
                        Open
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee picker for a new evaluation */}
      <Dialog open={picking} onOpenChange={(o) => !o && setPicking(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New evaluation</DialogTitle>
            <DialogDescription>
              Choose the employee to evaluate.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
            placeholder="Search by name, ID, position"
            aria-label="Search employees"
          />
          <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200">
            {empLoading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading employees
              </div>
            ) : shownEmployees.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">
                No employees found.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {shownEmployees.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicking(false);
                        setSeed({
                          employee_id: e.id,
                          employee_name: e.name,
                          department: e.department,
                          job_title: e.position,
                        });
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                    >
                      <span className="block text-sm font-medium text-slate-900">
                        {e.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {[e.number, e.position, e.department]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EvaluationFormDialog
        open={openId !== null || seed !== null}
        evaluationId={openId}
        seed={seed}
        onClose={() => {
          setOpenId(null);
          setSeed(null);
        }}
        onChanged={() => {
          void load();
          onChanged?.();
        }}
      />
    </div>
  );
}
