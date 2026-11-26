"use client";

// Record movement dialog (Stock in / Stock out / Adjust count).
// The item is picked from the existing items list, so nothing is typed twice.

import { useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type StockItem = {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  is_active?: boolean;
};

export type MovementKind = "in" | "out" | "adjust";

export type StockAction = {
  kind: MovementKind;
  item: StockItem | null; // null = the admin picks the item in the dialog
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 disabled:opacity-60";

const KINDS: { value: MovementKind; label: string }[] = [
  { value: "in", label: "Stock in" },
  { value: "out", label: "Stock out" },
  { value: "adjust", label: "Adjust count" },
];

const SUBMIT_LABEL: Record<MovementKind, string> = {
  in: "Add stock",
  out: "Issue stock",
  adjust: "Save count",
};

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

function Field({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span>
        {label}
        {optional && (
          <span className="font-normal text-slate-400"> (optional)</span>
        )}
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

function MovementForm({
  action,
  items,
  onClose,
  onDone,
}: {
  action: StockAction;
  items: StockItem[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [itemId, setItemId] = useState<string>(
    action.item ? String(action.item.id) : "",
  );
  const [kind, setKind] = useState<MovementKind>(action.kind);
  // For "adjust" the number is the new counted total, for in/out it is the change.
  const [quantity, setQuantity] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const item = items.find((i) => String(i.id) === itemId) ?? null;
  const qty = Number(quantity);
  const preview =
    !item || quantity === "" || !Number.isFinite(qty)
      ? null
      : kind === "in"
        ? item.quantity + qty
        : kind === "out"
          ? item.quantity - qty
          : qty;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    if (!item) {
      setError("Choose an item.");
      return;
    }
    if (quantity === "" || !Number.isFinite(qty)) {
      setError("Enter a quantity.");
      return;
    }
    if (kind !== "adjust" && qty <= 0) {
      setError("Quantity must be more than 0.");
      return;
    }
    if (kind === "adjust" && qty < 0) {
      setError("Counted quantity can't be negative.");
      return;
    }
    if (kind === "out" && qty > item.quantity) {
      setError(`Only ${item.quantity} ${item.unit} on hand.`);
      return;
    }
    setError("");
    setSending(true);
    try {
      const message = await postJson(
        `/api/admin/office-supplies/items/${item.id}/movements`,
        {
          type: kind,
          quantity: qty,
          issued_to: kind === "out" ? issuedTo.trim() || null : null,
          remarks: remarks.trim() || null,
        },
      );
      onDone(message === "Done." ? `${item.name} updated.` : message);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not save this movement.",
      );
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}

      <Field
        label="Item"
        hint={item ? `On hand now: ${item.quantity} ${item.unit}` : undefined}
      >
        <select
          className={inputClass}
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          disabled={sending}
        >
          <option value="">Select an item…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.quantity} {i.unit})
            </option>
          ))}
        </select>
      </Field>

      <div>
        <p className="text-sm font-semibold text-slate-700">Type</p>
        <div className="mt-1.5 inline-flex rounded-xl border border-slate-300 bg-white p-1">
          {KINDS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              aria-pressed={kind === value}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
                kind === value
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Field
        label={kind === "adjust" ? "Counted quantity" : "Quantity"}
        hint={
          preview !== null && item
            ? `New balance: ${preview} ${item.unit}`
            : kind === "adjust"
              ? "Enter the total you counted on the shelf."
              : undefined
        }
      >
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step="1"
          className={inputClass}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </Field>

      {kind === "out" && (
        <Field label="Issued to" optional>
          <input
            className={inputClass}
            maxLength={160}
            placeholder="Employee or department"
            value={issuedTo}
            onChange={(e) => setIssuedTo(e.target.value)}
          />
        </Field>
      )}

      <Field label="Remarks" optional>
        <textarea
          className={`${inputClass} resize-y`}
          rows={3}
          maxLength={500}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </Field>

      <div className="sticky bottom-0 -mx-1 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={sending}
          className="min-h-11 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={sending}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
            kind === "out"
              ? "bg-rose-700 hover:bg-rose-800"
              : "bg-[#0f1a3d] hover:bg-[#1b2b58]"
          }`}
        >
          {sending ? (
            <LoaderCircle
              size={16}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Send size={16} aria-hidden="true" />
          )}
          {sending ? "Saving…" : SUBMIT_LABEL[kind]}
        </button>
      </div>
    </form>
  );
}

export function StockMovementDialog({
  action,
  items,
  onClose,
  onDone,
}: {
  action: StockAction | null;
  items: StockItem[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto border-slate-200 bg-white text-slate-900 sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-bold text-[#0f1a3d]">
            Record movement
          </DialogTitle>
          <DialogDescription>
            Choose an item, then add, issue, or recount its stock.
          </DialogDescription>
        </DialogHeader>
        {action && (
          <MovementForm
            key={`${action.kind}-${action.item?.id ?? "new"}`}
            action={action}
            items={items}
            onClose={onClose}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
