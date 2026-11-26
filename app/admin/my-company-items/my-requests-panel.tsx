"use client";

// Employee side: "My Company Items" (own replacement requests only).
//   app/admin/my-company-items/my-requests-panel.tsx
//
// Reuses the shared pieces exported from the admin panel file
// (see the `export` list in the setup notes).
//
// API (via Next proxy -> Laravel, always scoped to the logged-in employee):
//   GET    /api/admin/my-replacement-requests            -> { data, profile }
//   POST   /api/admin/my-replacement-requests
//   GET    /api/admin/my-replacement-requests/:id
//   PATCH  /api/admin/my-replacement-requests/:id        (drafts only)
//   DELETE /api/admin/my-replacement-requests/:id        (drafts only)
//   POST   /api/admin/my-replacement-requests/:id/submit
//   POST   /api/admin/my-replacement-requests/:id/withdraw (Submitted -> Draft)

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Printer } from "lucide-react";
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
import {
  ATTACH_OPTS,
  Chip,
  Field,
  ITEM_OPTS,
  LOGO,
  REASON_OPTS,
  STATUS_STYLES,
  Section,
  SignOff,
  dateInput,
  fmtDay,
  fmtStamp,
  labelOf,
  primaryBtn,
  printForm,
  readJson,
  textareaClass,
  toggle,
  type Req,
  type Status,
} from "../item-replacement/replacement-requests-panel";

const API = "/api/admin/my-replacement-requests";

type Profile = {
  employee_name: string;
  employee_number: string | null;
  department: string | null;
  position: string | null;
  contact_no: string | null;
  immediate_supervisor: string | null;
};

const STEPS: Status[] = ["Submitted", "Endorsed", "Approved", "Released"];

const blankForm = {
  contact_no: "",
  immediate_supervisor: "",
  items: [] as string[],
  item_other: "",
  item_details: "",
  reasons: [] as string[],
  reason_other: "",
  date_issued: "",
  date_noticed: "",
  item_submitted: null as boolean | null,
  item_submitted_explain: "",
  explanation: "",
  attachments: [] as string[],
  attachments_other: "",
  declaration_accepted: false,
};

/* ============================================================================
 * STATUS TRACKER
 * ========================================================================== */

function Tracker({ status }: { status: Status }) {
  if (status === "Draft") {
    return (
      <p className="text-sm text-slate-600">
        This is a draft. Nothing is sent to your supervisor until you submit it.
      </p>
    );
  }
  const current = STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-medium">
      {STEPS.map((s, i) => {
        const done = status !== "Rejected" && i <= current;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${done ? "bg-cyan-700 text-white ring-cyan-700" : "bg-white text-slate-500 ring-slate-300"}`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
          </li>
        );
      })}
      {status === "Rejected" && (
        <li>
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-800 ring-1 ring-inset ring-red-600/20">
            Rejected
          </span>
        </li>
      )}
    </ol>
  );
}

/* ============================================================================
 * FORM DIALOG (employee)
 * ========================================================================== */

function MyRequestDialog({
  open,
  requestId,
  isNew,
  profile,
  onClose,
  onChanged,
}: {
  open: boolean;
  requestId: number | null;
  isNew: boolean;
  profile: Profile | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<Req | null>(null);
  const [f, setF] = useState(blankForm);

  const id = meta?.id ?? null;
  const status: Status = meta?.status ?? "Draft";
  const editable = status === "Draft";
  const person = meta ?? profile;
  const set = <K extends keyof typeof blankForm>(
    k: K,
    v: (typeof blankForm)[K],
  ) => setF((cur) => ({ ...cur, [k]: v }));

  const apply = (r: Req) => {
    setMeta(r);
    setF({
      contact_no: r.contact_no ?? "",
      immediate_supervisor: r.immediate_supervisor ?? "",
      items: r.items ?? [],
      item_other: r.item_other ?? "",
      item_details: r.item_details ?? "",
      reasons: r.reasons ?? [],
      reason_other: r.reason_other ?? "",
      date_issued: dateInput(r.date_issued),
      date_noticed: dateInput(r.date_noticed),
      item_submitted: r.item_submitted,
      item_submitted_explain: r.item_submitted_explain ?? "",
      explanation: r.explanation ?? "",
      attachments: r.attachments ?? [],
      attachments_other: r.attachments_other ?? "",
      declaration_accepted: !!r.declaration_accepted,
    });
  };

  useEffect(() => {
    if (!open) return;
    setMeta(null);
    setF({
      ...blankForm,
      contact_no: profile?.contact_no ?? "",
      immediate_supervisor: profile?.immediate_supervisor ?? "",
    });
    if (!requestId) return;
    setLoading(true);
    adminFetch(`${API}/${requestId}`, { cache: "no-store" })
      .then((r) => readJson<{ data: Req }>(r))
      .then((d) => apply(d.data))
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "Unable to load request."),
      )
      .finally(() => setLoading(false));
  }, [open, requestId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Identity (name, department, etc.) is filled in by the server from the
  // logged-in account, so it is not sent from here.
  const body = () => ({
    contact_no: f.contact_no.trim() || null,
    immediate_supervisor: f.immediate_supervisor.trim() || null,
    items: f.items,
    item_other: f.items.includes("other") ? f.item_other.trim() || null : null,
    item_details: f.item_details.trim() || null,
    reasons: f.reasons,
    reason_other: f.reasons.includes("other")
      ? f.reason_other.trim() || null
      : null,
    date_issued: f.date_issued || null,
    date_noticed: f.date_noticed || null,
    item_submitted: f.item_submitted,
    item_submitted_explain:
      f.item_submitted === false
        ? f.item_submitted_explain.trim() || null
        : null,
    explanation: f.explanation.trim() || null,
    attachments: f.attachments,
    attachments_other: f.attachments.includes("other")
      ? f.attachments_other.trim() || null
      : null,
    declaration_accepted: f.declaration_accepted,
  });

  const persist = async (): Promise<Req> => {
    const d = await readJson<{ data: Req }>(
      await adminFetch(id ? `${API}/${id}` : API, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body()),
      }),
    );
    return d.data;
  };

  const run = async (label: string, work: () => Promise<Req>) => {
    setBusy(true);
    try {
      const saved = await work();
      apply(saved);
      toast.success(label);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: string) => {
    const saved = editable ? await persist() : null;
    const target = saved?.id ?? id;
    const d = await readJson<{ data: Req }>(
      await adminFetch(`${API}/${target}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    return d.data;
  };

  const submit = () => {
    if (f.items.length === 0) return toast.error("Select the item you need.");
    if (f.items.includes("other") && !f.item_other.trim())
      return toast.error("Specify the other item.");
    if (f.reasons.length === 0)
      return toast.error("Select at least one reason.");
    if (f.reasons.includes("other") && !f.reason_other.trim())
      return toast.error("Specify the other reason.");
    if (f.item_submitted === null)
      return toast.error("Say whether you are submitting the old item.");
    if (f.item_submitted === false && !f.item_submitted_explain.trim())
      return toast.error("Explain why the item was not submitted.");
    if (!f.explanation.trim())
      return toast.error("Explain when and how the concern occurred.");
    if (!f.declaration_accepted)
      return toast.error("You need to accept the declaration.");
    void run("Request submitted.", () => act("submit"));
  };

  const remove = async () => {
    if (!id || !confirm("Delete this draft?")) return;
    setBusy(true);
    try {
      await readJson(await adminFetch(`${API}/${id}`, { method: "DELETE" }));
      toast.success("Draft deleted.");
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to delete.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <img src={LOGO} alt="Company logo" className="h-9 w-auto" />
            <span>Item replacement request</span>
          </DialogTitle>
          <DialogDescription>
            {meta?.request_no ? `${meta.request_no} · ` : "New request · "}
            {person?.employee_name}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
              >
                {status}
              </span>
              <div className="text-xs text-slate-500">
                Date filed: {fmtDay(meta?.date_filed)} · Release date:{" "}
                {fmtDay(meta?.release_date)}
              </div>
            </div>

            <Tracker status={status} />

            {/* A */}
            <Section letter="A" title="Your information">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name">
                  <Input value={person?.employee_name ?? ""} disabled />
                </Field>
                <Field label="Employee ID">
                  <Input value={person?.employee_number ?? ""} disabled />
                </Field>
                <Field label="Department">
                  <Input value={person?.department ?? ""} disabled />
                </Field>
                <Field label="Position">
                  <Input value={person?.position ?? ""} disabled />
                </Field>
                <Field label="Contact no.">
                  <Input
                    value={f.contact_no}
                    onChange={(e) => set("contact_no", e.target.value)}
                    disabled={!editable}
                    maxLength={50}
                  />
                </Field>
                <Field label="Immediate supervisor">
                  <Input
                    value={f.immediate_supervisor}
                    onChange={(e) =>
                      set("immediate_supervisor", e.target.value)
                    }
                    disabled={!editable}
                    maxLength={150}
                  />
                </Field>
              </div>
            </Section>

            {/* B */}
            <Section letter="B" title="Item and replacement details">
              <fieldset disabled={!editable} className="space-y-2">
                <legend className="text-sm font-medium text-slate-800">
                  Item you need replaced
                </legend>
                <div className="flex flex-wrap gap-2">
                  {ITEM_OPTS.map((o) => (
                    <Chip
                      key={o.value}
                      on={f.items.includes(o.value)}
                      onClick={() => set("items", toggle(f.items, o.value))}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </div>
                {f.items.includes("other") && (
                  <Input
                    value={f.item_other}
                    onChange={(e) => set("item_other", e.target.value)}
                    placeholder="Specify the item"
                    maxLength={150}
                  />
                )}
              </fieldset>

              <Field label="Item details (ID no. / polo size / color)">
                <Input
                  value={f.item_details}
                  onChange={(e) => set("item_details", e.target.value)}
                  disabled={!editable}
                  maxLength={255}
                />
              </Field>

              <fieldset disabled={!editable} className="space-y-2">
                <legend className="text-sm font-medium text-slate-800">
                  Reason
                </legend>
                <div className="flex flex-wrap gap-2">
                  {REASON_OPTS.map((o) => (
                    <Chip
                      key={o.value}
                      on={f.reasons.includes(o.value)}
                      onClick={() => set("reasons", toggle(f.reasons, o.value))}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </div>
                {f.reasons.includes("other") && (
                  <Input
                    value={f.reason_other}
                    onChange={(e) => set("reason_other", e.target.value)}
                    placeholder="Specify the reason"
                    maxLength={150}
                  />
                )}
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Original issue date">
                  <Input
                    type="date"
                    value={f.date_issued}
                    onChange={(e) => set("date_issued", e.target.value)}
                    disabled={!editable}
                  />
                </Field>
                <Field label="Date you noticed the issue/damage">
                  <Input
                    type="date"
                    value={f.date_noticed}
                    onChange={(e) => set("date_noticed", e.target.value)}
                    disabled={!editable}
                  />
                </Field>
              </div>

              <fieldset disabled={!editable} className="space-y-2">
                <legend className="text-sm font-medium text-slate-800">
                  Are you submitting the old item?
                </legend>
                <div className="flex gap-2">
                  <Chip
                    type="radio"
                    on={f.item_submitted === true}
                    onClick={() => set("item_submitted", true)}
                  >
                    Yes, attached/returned
                  </Chip>
                  <Chip
                    type="radio"
                    on={f.item_submitted === false}
                    onClick={() => set("item_submitted", false)}
                  >
                    No
                  </Chip>
                </div>
                {f.item_submitted === false && (
                  <Input
                    value={f.item_submitted_explain}
                    onChange={(e) =>
                      set("item_submitted_explain", e.target.value)
                    }
                    placeholder="Explain why it was not submitted"
                    maxLength={255}
                  />
                )}
              </fieldset>
            </Section>

            {/* C */}
            <Section letter="C" title="Explanation and supporting evidence">
              <Field label="Explain when and how the fading, damage, loss, defect, or size concern occurred">
                <textarea
                  value={f.explanation}
                  onChange={(e) => set("explanation", e.target.value)}
                  rows={4}
                  maxLength={3000}
                  disabled={!editable}
                  className={textareaClass}
                />
              </Field>
              <fieldset disabled={!editable} className="space-y-2">
                <legend className="text-sm font-medium text-slate-800">
                  What you will hand in to HR
                </legend>
                <div className="flex flex-wrap gap-2">
                  {ATTACH_OPTS.map((o) => (
                    <Chip
                      key={o.value}
                      on={f.attachments.includes(o.value)}
                      onClick={() =>
                        set("attachments", toggle(f.attachments, o.value))
                      }
                    >
                      {o.label}
                    </Chip>
                  ))}
                </div>
                {f.attachments.includes("other") && (
                  <Input
                    value={f.attachments_other}
                    onChange={(e) => set("attachments_other", e.target.value)}
                    placeholder="Specify the attachment"
                    maxLength={150}
                  />
                )}
              </fieldset>
            </Section>

            {/* D */}
            <Section letter="D" title="Declaration">
              <p className="text-sm text-slate-700">
                I certify that the information provided is true and complete. I
                understand that approval and whether the replacement is free or
                chargeable will depend on the company&apos;s assessment, the
                item&apos;s reasonable service life, prior replacements, and
                whether loss or damage resulted from normal use, an issuing
                defect, accident, negligence, or intentional misuse.
              </p>
              <label className="flex items-start gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={f.declaration_accepted}
                  onChange={(e) =>
                    set("declaration_accepted", e.target.checked)
                  }
                  disabled={!editable}
                />
                <span>
                  I agree to this declaration (e-signature
                  {meta?.employee_signed_at
                    ? `, signed ${fmtStamp(meta.employee_signed_at)}`
                    : ""}
                  ).
                </span>
              </label>
            </Section>

            {/* Progress / outcome */}
            {id && status !== "Draft" && (
              <div className="grid gap-2 sm:grid-cols-3">
                <SignOff
                  label="Supervisor endorsement"
                  name={meta?.endorsed_by_name ?? null}
                  at={meta?.endorsed_at ?? null}
                />
                <SignOff
                  label="Approved by"
                  name={meta?.approved_by_name ?? null}
                  at={meta?.approved_at ?? null}
                />
                <SignOff
                  label="Released by"
                  name={meta?.released_by_name ?? null}
                  at={meta?.release_date ?? null}
                />
              </div>
            )}
            {meta?.endorsement_remarks && (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Supervisor remarks:</span>{" "}
                {meta.endorsement_remarks}
              </p>
            )}
            {meta?.resolution && (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Decision:</span>{" "}
                {meta.resolution === "free"
                  ? "Free replacement"
                  : "Chargeable to you"}
                {meta.decision_remarks ? `. ${meta.decision_remarks}` : ""}
              </p>
            )}
            {status === "Rejected" && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                Rejected by {meta?.rejected_by_name} on{" "}
                {fmtStamp(meta?.rejected_at)}: {meta?.reject_reason}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              {meta && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => printForm(meta)}
                  className="mr-auto"
                >
                  <Printer className="h-4 w-4" /> Print
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>

              {status === "Draft" && (
                <>
                  {id && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={remove}
                    >
                      Delete
                    </Button>
                  )}
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
                    className={primaryBtn}
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Submit request
                  </Button>
                </>
              )}

              {/* Only before the supervisor has endorsed it. */}
              {status === "Submitted" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run("Request withdrawn. You can edit it again.", () =>
                      act("withdraw"),
                    )
                  }
                >
                  Withdraw and edit
                </Button>
              )}

              {status === "Rejected" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run("Returned to draft.", () => act("withdraw"))
                  }
                >
                  Edit and resubmit
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
 * LIST
 * ========================================================================== */

export default function MyRequestsPanel() {
  const [items, setItems] = useState<Req[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(API, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Request failed.");
      setItems(data.data ?? []);
      setProfile(data.profile ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to load requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = (r: Req) =>
    (r.items ?? [])
      .map((v) =>
        v === "other" && r.item_other ? r.item_other : labelOf(ITEM_OPTS, v),
      )
      .join(", ") || "—";

  const hasOpenDraft = useMemo(
    () => items.some((r) => r.status === "Draft"),
    [items],
  );

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold text-slate-900">
          My requests{" "}
          <span className="font-normal text-slate-500">({items.length})</span>
        </h2>
        <Button
          className={primaryBtn}
          disabled={loading || !profile}
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> New request
        </Button>
      </div>

      {hasOpenDraft && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          You have a draft that has not been submitted yet.
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your requests
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="font-medium text-slate-900">No requests yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Need a new Company ID or polo shirt? Use New request.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {r.request_no ?? `#${r.id}`} · {summary(r)}
                </p>
                <p className="text-xs text-slate-500">
                  Filed {fmtDay(r.date_filed ?? r.created_at)}
                  {r.resolution
                    ? ` · ${r.resolution === "free" ? "Free replacement" : "Chargeable"}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[r.status]}`}
                >
                  {r.status}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenId(r.id)}
                >
                  {r.status === "Draft" ? "Continue" : "View"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MyRequestDialog
        open={openId !== null || creating}
        requestId={openId}
        isNew={creating}
        profile={profile}
        onClose={() => {
          setOpenId(null);
          setCreating(false);
        }}
        onChanged={() => void load()}
      />
    </div>
  );
}
