"use client";

// Company-Issued Item Replacement Request: list + form + print, in ONE file.
//   app/admin/item-replacement/replacement-requests-panel.tsx
//
// Helpers/types below are exported so the employee page
// (app/admin/my-company-items) can reuse them.
//
// API (via Next proxy -> Laravel):
//   GET    /api/admin/replacement-requests
//   POST   /api/admin/replacement-requests
//   GET    /api/admin/replacement-requests/:id
//   PATCH  /api/admin/replacement-requests/:id
//   DELETE /api/admin/replacement-requests/:id
//   POST   /api/admin/replacement-requests/:id/:action
//          (submit | endorse | approve | reject | release | revert)
//   GET    /api/admin/evaluation-monitoring?resource=employees   (employee picker)

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Printer, Search } from "lucide-react";
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

/* ============================================================================
 * TYPES + OPTIONS
 * ========================================================================== */

export type Status =
  | "Draft"
  | "Submitted"
  | "Endorsed"
  | "Approved"
  | "Rejected"
  | "Released";

export type Req = {
  id: number;
  request_no: string | null;
  employee_id: number;
  employee_name: string;
  employee_number: string | null;
  department: string | null;
  position: string | null;
  contact_no: string | null;
  immediate_supervisor: string | null;
  items: string[] | null;
  item_other: string | null;
  item_details: string | null;
  reasons: string[] | null;
  reason_other: string | null;
  date_issued: string | null;
  date_noticed: string | null;
  item_submitted: boolean | null;
  item_submitted_explain: string | null;
  explanation: string | null;
  attachments: string[] | null;
  attachments_other: string | null;
  declaration_accepted: boolean;
  employee_signed_at: string | null;
  status: Status;
  date_filed: string | null;
  endorsed_by_name: string | null;
  endorsed_at: string | null;
  endorsement_remarks: string | null;
  received_by_name: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  resolution: "free" | "chargeable" | null;
  decision_remarks: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  release_date: string | null;
  released_by_name: string | null;
  created_at: string;
};

export type Seed = {
  employee_id: number;
  employee_name: string;
  employee_number: string | null;
  department: string | null;
  position: string | null;
  contact_no: string | null;
  immediate_supervisor: string | null;
};

export const ITEM_OPTS = [
  { value: "company_id", label: "Company ID" },
  { value: "polo_shirt", label: "Company Polo Shirt" },
  { value: "other", label: "Other" },
];
export const REASON_OPTS = [
  { value: "faded_ink", label: "Faded ink/print" },
  { value: "wear_tear", label: "Normal wear and tear" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "incorrect_size", label: "Incorrect size/defect" },
  { value: "other", label: "Other" },
];
export const ATTACH_OPTS = [
  { value: "photo", label: "Photo/s of item" },
  { value: "damaged_item", label: "Damaged/faded item" },
  { value: "incident_report", label: "Incident/Lost ID Report" },
  { value: "other", label: "Other" },
];

export const labelOf = (opts: { value: string; label: string }[], v: string) =>
  opts.find((o) => o.value === v)?.label ?? v;

const FILTERS: ("All" | Status)[] = [
  "Submitted",
  "Endorsed",
  "Approved",
  "Released",
  "Rejected",
  "Draft",
  "All",
];

export const STATUS_STYLES: Record<Status, string> = {
  Draft: "bg-slate-50 text-slate-700 ring-slate-500/20",
  Submitted: "bg-amber-50 text-amber-800 ring-amber-600/20",
  Endorsed: "bg-sky-50 text-sky-800 ring-sky-600/20",
  Approved: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  Rejected: "bg-red-50 text-red-800 ring-red-600/20",
  Released: "bg-cyan-50 text-cyan-800 ring-cyan-600/20",
};

export const LOGO = "/email/logo.png";

/* ============================================================================
 * HELPERS
 * ========================================================================== */

export async function readJson<T = any>(response: Response): Promise<T> {
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

export const fmtDay = (v?: string | null) =>
  v ? format(new Date(v), "MMM d, yyyy") : "—";
export const fmtStamp = (v?: string | null) =>
  v ? format(new Date(v), "MMM d, yyyy h:mm a") : null;
export const dateInput = (v?: string | null) => (v ? v.slice(0, 10) : "");

export const textareaClass =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:bg-slate-50 disabled:text-slate-600";
export const primaryBtn = "bg-[#0e7490] text-white hover:bg-[#0c4a6e]";

export function Chip({
  on,
  children,
  onClick,
  type = "checkbox",
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
  type?: "checkbox" | "radio";
}) {
  return (
    <button
      type="button"
      role={type}
      aria-checked={on}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-default ${on ? "bg-cyan-700 text-white ring-cyan-700" : "bg-white text-slate-700 ring-slate-300 enabled:hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

export function Section({
  letter,
  title,
  children,
}: {
  letter: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="rounded bg-slate-200 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-slate-900">
        {letter}. {title}
      </h3>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SignOff({
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

export const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/* ============================================================================
 * PRINT (same layout as the paper form, with the company logo)
 * ========================================================================== */

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

export function printForm(r: Req) {
  const box = (checked: boolean, label: string) =>
    `<span class="cb">${checked ? "&#9746;" : "&#9744;"} ${esc(label)}</span>`;
  const has = (list: string[] | null, v: string) => !!list?.includes(v);
  const d = (v?: string | null) =>
    v ? format(new Date(v), "MMM d, yyyy") : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc(r.request_no ?? "Replacement Request")}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; }
  .logo { text-align: center; } .logo img { height: 64px; }
  h1 { text-align: center; font-size: 14px; margin: 8px 0 14px; line-height: 1.3; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 4px; vertical-align: top; }
  .lbl { font-weight: bold; white-space: nowrap; width: 17%; }
  .sec { background: #d9d9d9; font-weight: bold; padding: 3px 5px; margin-top: 10px; }
  .ul { border-bottom: 1px solid #333; min-height: 14px; }
  .cb { margin-right: 14px; white-space: nowrap; }
  .box { border: 1px solid #333; min-height: 54px; padding: 4px; white-space: pre-wrap; }
  .sig td { height: 46px; }
</style></head><body>
<div class="logo"><img src="${window.location.origin}${LOGO}" alt="Company logo"/></div>
<h1>COMPANY-ISSUED ITEM<br/>REPLACEMENT REQUEST FORM</h1>

<table>
  <tr><td class="lbl">Request No.</td><td><i>${esc(r.request_no)}</i></td><td class="lbl">Date Filed</td><td>${esc(d(r.date_filed))}</td></tr>
  <tr><td class="lbl">Received By</td><td>${esc(r.received_by_name)}</td><td class="lbl">Release Date</td><td>${esc(d(r.release_date))}</td></tr>
</table>

<div class="sec">A. EMPLOYEE INFORMATION</div>
<table>
  <tr><td class="lbl">Full Name</td><td>${esc(r.employee_name)}</td><td class="lbl">Employee ID</td><td>${esc(r.employee_number)}</td></tr>
  <tr><td class="lbl">Department</td><td>${esc(r.department)}</td><td class="lbl">Position</td><td>${esc(r.position)}</td></tr>
  <tr><td class="lbl">Contact No.</td><td>${esc(r.contact_no)}</td><td class="lbl">Immediate Supervisor</td><td>${esc(r.immediate_supervisor)}</td></tr>
</table>

<div class="sec">B. ITEM AND REPLACEMENT DETAILS</div>
<table>
  <tr><td class="lbl">Item Requested</td><td>
    ${ITEM_OPTS.map((o) => box(has(r.items, o.value), o.label)).join("")}
    ${has(r.items, "other") ? `<span class="ul">${esc(r.item_other)}</span>` : ""}
  </td></tr>
  <tr><td class="lbl">Item Details</td><td>ID No./Polo Size/Color: <span class="ul">${esc(r.item_details)}</span></td></tr>
  <tr><td class="lbl">Reason</td><td>
    ${REASON_OPTS.map((o) => box(has(r.reasons, o.value), o.label)).join("")}
    ${has(r.reasons, "other") ? `<span class="ul">${esc(r.reason_other)}</span>` : ""}
  </td></tr>
  <tr><td class="lbl">Date Issued / Noticed</td><td>Original issue date: <span class="ul">${esc(d(r.date_issued))}</span> &nbsp; Date issue/damage noticed: <span class="ul">${esc(d(r.date_noticed))}</span></td></tr>
  <tr><td class="lbl">Item Submitted</td><td>
    ${box(r.item_submitted === true, "Yes, attached/returned")}
    ${box(r.item_submitted === false, "No — explain:")} <span class="ul">${esc(r.item_submitted_explain)}</span>
  </td></tr>
</table>

<div class="sec">C. EMPLOYEE EXPLANATION AND SUPPORTING EVIDENCE</div>
<p><b>Explain when and how the fading, damage, loss, defect, or size concern occurred:</b></p>
<div class="box">${esc(r.explanation)}</div>
<p><b>Attachments:</b>
  ${ATTACH_OPTS.map((o) => box(has(r.attachments, o.value), o.label)).join("")}
  ${has(r.attachments, "other") ? `<span class="ul">${esc(r.attachments_other)}</span>` : ""}
</p>

<div class="sec">D. EMPLOYEE DECLARATION</div>
<p>I certify that the information provided is true and complete. I understand that approval and whether the replacement is free or chargeable will depend on the company's assessment, the item's reasonable service life, prior replacements, and whether loss or damage resulted from normal use, an issuing defect, accident, negligence, or intentional misuse.</p>
<table class="sig">
  <tr><td class="lbl">Employee Signature</td><td>${r.declaration_accepted ? `${esc(r.employee_name)}<br/><small>Signed ${esc(fmtStamp(r.employee_signed_at) ?? "")}</small>` : ""}</td></tr>
  <tr><td class="lbl">Supervisor Endorsement</td><td>${r.endorsed_by_name ? `${esc(r.endorsed_by_name)}<br/><small>${esc(fmtStamp(r.endorsed_at) ?? "")}${r.endorsement_remarks ? " — " + esc(r.endorsement_remarks) : ""}</small>` : ""}</td></tr>
  <tr><td class="lbl">Approval</td><td>${r.approved_by_name ? `${esc(r.approved_by_name)} — ${r.resolution === "free" ? "Free replacement" : "Chargeable"}<br/><small>${esc(fmtStamp(r.approved_at) ?? "")}${r.decision_remarks ? " — " + esc(r.decision_remarks) : ""}</small>` : ""}</td></tr>
</table>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    toast.error("Allow pop-ups to print the form.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/* ============================================================================
 * FORM DIALOG
 * ========================================================================== */

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

function RequestFormDialog({
  open,
  requestId,
  seed,
  onClose,
  onChanged,
}: {
  open: boolean;
  requestId?: number | null;
  seed?: Seed | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<Req | null>(null);
  const [f, setF] = useState(blankForm);
  const [remarks, setRemarks] = useState("");
  const [resolution, setResolution] = useState<"free" | "chargeable" | null>(
    null,
  );
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const id = meta?.id ?? null;
  const status: Status = meta?.status ?? "Draft";
  const editable = status === "Draft";
  const person = meta ?? seed ?? null;
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
    setRemarks("");
    setResolution(null);
    setRejecting(false);
    setRejectReason("");
    setF({
      ...blankForm,
      contact_no: seed?.contact_no ?? "",
      immediate_supervisor: seed?.immediate_supervisor ?? "",
    });
    if (!requestId) return;
    setLoading(true);
    adminFetch(`/api/admin/replacement-requests/${requestId}`, {
      cache: "no-store",
    })
      .then((r) => readJson<{ data: Req }>(r))
      .then((d) => apply(d.data))
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "Unable to load request."),
      )
      .finally(() => setLoading(false));
  }, [open, requestId]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = () => ({
    employee_id: meta?.employee_id ?? seed?.employee_id,
    employee_name: meta?.employee_name ?? seed?.employee_name,
    employee_number: meta?.employee_number ?? seed?.employee_number ?? null,
    department: meta?.department ?? seed?.department ?? null,
    position: meta?.position ?? seed?.position ?? null,
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
    if (id) {
      const d = await readJson<{ data: Req }>(
        await adminFetch(`/api/admin/replacement-requests/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body()),
        }),
      );
      return d.data;
    }
    if (!seed) throw new Error("No employee selected.");
    const d = await readJson<{ data: Req }>(
      await adminFetch("/api/admin/replacement-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body()),
      }),
    );
    return d.data;
  };

  const run = async (
    label: string,
    work: () => Promise<Req>,
    closeAfter = false,
  ) => {
    setBusy(true);
    try {
      const saved = await work();
      apply(saved);
      toast.success(label);
      onChanged?.();
      if (closeAfter) onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: string, extra?: object) => {
    const saved = editable ? await persist() : null;
    const target = saved?.id ?? id;
    const d = await readJson<{ data: Req }>(
      await adminFetch(`/api/admin/replacement-requests/${target}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extra ?? {}),
      }),
    );
    return d.data;
  };

  const submit = () => {
    if (f.items.length === 0) return toast.error("Select the item requested.");
    if (f.items.includes("other") && !f.item_other.trim())
      return toast.error("Specify the other item.");
    if (f.reasons.length === 0)
      return toast.error("Select at least one reason.");
    if (f.reasons.includes("other") && !f.reason_other.trim())
      return toast.error("Specify the other reason.");
    if (f.item_submitted === null)
      return toast.error("Say whether the item was submitted.");
    if (f.item_submitted === false && !f.item_submitted_explain.trim())
      return toast.error("Explain why the item was not submitted.");
    if (!f.explanation.trim())
      return toast.error("Explain when and how the concern occurred.");
    if (!f.declaration_accepted)
      return toast.error("The employee declaration must be accepted.");
    void run("Request submitted.", () => act("submit"));
  };

  const approve = () => {
    if (!resolution) return toast.error("Choose free or chargeable.");
    void run("Request approved.", () =>
      act("approve", { resolution, remarks: remarks.trim() || null }),
    );
  };

  const reject = () => {
    if (!rejectReason.trim()) return toast.error("Enter the reason.");
    void run("Request rejected.", () =>
      act("reject", { reason: rejectReason.trim() }),
    );
  };

  const remove = async () => {
    if (!id || !confirm("Delete this draft?")) return;
    setBusy(true);
    try {
      await readJson(
        await adminFetch(`/api/admin/replacement-requests/${id}`, {
          method: "DELETE",
        }),
      );
      toast.success("Draft deleted.");
      onChanged?.();
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
            <span>Company-issued item replacement request</span>
          </DialogTitle>
          <DialogDescription>
            {meta?.request_no ? `${meta.request_no} · ` : ""}
            {person?.employee_name}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
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

            {/* A */}
            <Section letter="A" title="Employee information">
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
                  Item requested
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
                <Field label="Date issue/damage noticed">
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
                  Item submitted
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
            <Section
              letter="C"
              title="Employee explanation and supporting evidence"
            >
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
                  Attachments (tick what the employee is handing in)
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
            <Section letter="D" title="Employee declaration">
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
                  The employee agrees to this declaration (e-signature
                  {meta?.employee_signed_at
                    ? `, signed ${fmtStamp(meta.employee_signed_at)}`
                    : ""}
                  ).
                </span>
              </label>
            </Section>

            {/* Sign-offs */}
            {id && (
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
                <span className="font-medium">Endorsement remarks:</span>{" "}
                {meta.endorsement_remarks}
              </p>
            )}
            {meta?.resolution && (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Decision:</span>{" "}
                {meta.resolution === "free"
                  ? "Free replacement"
                  : "Chargeable to the employee"}
                {meta.decision_remarks ? `. ${meta.decision_remarks}` : ""}
              </p>
            )}
            {status === "Rejected" && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                Rejected by {meta?.rejected_by_name} on{" "}
                {fmtStamp(meta?.rejected_at)}: {meta?.reject_reason}
              </p>
            )}

            {/* Reviewer inputs */}
            {status === "Submitted" && (
              <Field label="Endorsement remarks (optional)">
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className={textareaClass}
                />
              </Field>
            )}
            {status === "Endorsed" && (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-900">Decision</p>
                <div className="flex gap-2">
                  <Chip
                    type="radio"
                    on={resolution === "free"}
                    onClick={() => setResolution("free")}
                  >
                    Free replacement
                  </Chip>
                  <Chip
                    type="radio"
                    on={resolution === "chargeable"}
                    onClick={() => setResolution("chargeable")}
                  >
                    Chargeable
                  </Chip>
                </div>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Remarks (optional)"
                  className={textareaClass}
                />
              </div>
            )}
            {rejecting && (
              <Field label="Reason for rejection">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className={textareaClass}
                />
              </Field>
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

              {(status === "Submitted" || status === "Endorsed") && (
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
                  {rejecting ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={reject}
                      className="text-red-700"
                    >
                      Confirm rejection
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setRejecting(true)}
                      className="text-red-700"
                    >
                      Reject
                    </Button>
                  )}
                </>
              )}

              {status === "Submitted" && (
                <Button
                  type="button"
                  disabled={busy}
                  className={primaryBtn}
                  onClick={() =>
                    run("Request endorsed.", () =>
                      act("endorse", { remarks: remarks.trim() || null }),
                    )
                  }
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Endorse
                </Button>
              )}

              {status === "Endorsed" && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={approve}
                  className={primaryBtn}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Approve
                </Button>
              )}

              {status === "Approved" && (
                <Button
                  type="button"
                  disabled={busy}
                  className={primaryBtn}
                  onClick={() =>
                    run("Marked as released.", () => act("release"))
                  }
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Mark released
                </Button>
              )}

              {status === "Rejected" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => run("Returned to draft.", () => act("revert"))}
                >
                  Return to draft
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

// Active employees only; an employee with no status field is kept.
function isActive(e: any): boolean {
  const raw = e?.status ?? e?.employee_status ?? e?.is_active ?? e?.active;
  if (raw === undefined || raw === null || raw === "") return true;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;
  return String(raw).trim().toLowerCase() === "active";
}

// The masterfile response shape is not known, so read the common field names.
function toSeed(e: any): Seed | null {
  const id = Number(e?.id ?? e?.employee_id);
  const name =
    e?.full_name ??
    e?.name ??
    e?.employee_name ??
    [e?.first_name, e?.middle_name, e?.last_name].filter(Boolean).join(" ");
  if (!id || !name) return null;
  return {
    employee_id: id,
    employee_name: name,
    employee_number:
      e?.employee_number ??
      (e?.employee_id != null ? String(e.employee_id) : null),
    department: e?.department ?? null,
    position: e?.position ?? e?.job_title ?? null,
    contact_no:
      e?.contact_no ?? e?.contact_number ?? e?.mobile ?? e?.phone ?? null,
    immediate_supervisor:
      e?.immediate_supervisor ?? e?.supervisor ?? e?.supervisor_name ?? null,
  };
}

export default function ReplacementRequestsPanel() {
  const [items, setItems] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | Status>("Submitted");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [picking, setPicking] = useState(false);
  const [employees, setEmployees] = useState<Seed[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState("");

  const openPicker = async () => {
    setPicking(true);
    setEmpSearch("");
    if (employees.length) return;
    setEmpLoading(true);
    try {
      const res = await adminFetch(
        "/api/admin/evaluation-monitoring?resource=employees",
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Request failed.");
      const rows: any[] = Array.isArray(data) ? data : (data.data ?? []);
      setEmployees(
        rows
          .filter(isActive)
          .map(toSeed)
          .filter((o): o is Seed => o !== null),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to load employees.");
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
          [e.employee_name, e.employee_number, e.position, e.department].some(
            (v) => (v || "").toLowerCase().includes(q),
          ),
      )
      .slice(0, 50);
  }, [employees, empSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/replacement-requests", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Request failed.");
      setItems(data.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to load requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { All: items.length };
    for (const r of items) map[r.status] = (map[r.status] || 0) + 1;
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (r) =>
        (filter === "All" || r.status === filter) &&
        (!q ||
          [r.request_no, r.employee_name, r.department, r.position].some((v) =>
            (v || "").toLowerCase().includes(q),
          )),
    );
  }, [items, filter, search]);

  const summary = (r: Req) =>
    [
      ...(r.items ?? []).map((v) =>
        v === "other" && r.item_other ? r.item_other : labelOf(ITEM_OPTS, v),
      ),
    ].join(", ") || "—";

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="space-y-3 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="font-semibold text-slate-900">
            Replacement requests{" "}
            <span className="font-normal text-slate-500">
              ({filtered.length})
            </span>
          </h2>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <Button onClick={openPicker} className={primaryBtn}>
              New request
            </Button>
            <div className="relative w-full md:w-72">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by request no., name or department"
                aria-label="Search requests"
                className="pl-9"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${filter === s ? "bg-cyan-700 text-white ring-cyan-700" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}
            >
              {s}
              <span
                className={`tabular-nums ${filter === s ? "text-cyan-100" : "text-slate-400"}`}
              >
                {counts[s] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading requests
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="font-medium text-slate-900">No requests</p>
          <p className="mt-1 text-sm text-slate-500">
            Use New request to start one, or change the filter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Request</th>
                <th className="px-3 py-2.5 font-medium">Employee</th>
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 font-medium">Decision</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="w-[96px] px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="text-slate-700 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {r.request_no ?? `#${r.id}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      Filed {fmtDay(r.date_filed ?? r.created_at)}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-900">
                      {r.employee_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[r.department, r.position].filter(Boolean).join(" / ")}
                    </p>
                  </td>
                  <td className="px-3 py-3">{summary(r)}</td>
                  <td className="px-3 py-3">
                    {r.resolution === "free"
                      ? "Free"
                      : r.resolution === "chargeable"
                        ? "Chargeable"
                        : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpenId(r.id)}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee picker */}
      <Dialog open={picking} onOpenChange={(o) => !o && setPicking(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New replacement request</DialogTitle>
            <DialogDescription>Choose the employee.</DialogDescription>
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
                  <li key={e.employee_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicking(false);
                        setSeed(e);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                    >
                      <span className="block text-sm font-medium text-slate-900">
                        {e.employee_name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {[e.employee_number, e.position, e.department]
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

      <RequestFormDialog
        open={openId !== null || seed !== null}
        requestId={openId}
        seed={seed}
        onClose={() => {
          setOpenId(null);
          setSeed(null);
        }}
        onChanged={() => void load()}
      />
    </div>
  );
}
