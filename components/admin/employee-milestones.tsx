"use client";
// components/admin/employee-milestones.tsx
//
// Employee Milestones section for the Employee Masterfile "View" dialog.
// HR / admin add and remove entries here; the employee only reads them on
// their own dashboard.
//
//   GET    /api/admin/employees/{id}/milestones
//   POST   /api/admin/employees/{id}/milestones        { date, particulars, notes }
//   DELETE /api/admin/employees/{id}/milestones/{milestone}
//
// Onboarding (date hired) and Regularization are added automatically on the
// employee's dashboard from the employee record, so they are not entered here.

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Milestone = {
  id: number;
  date: string; // YYYY-MM-DD
  particulars: string;
  notes: string | null;
};

// One-click starters taken from the HR sheet. Edit freely.
const SUGGESTIONS = [
  "Evaluated by ",
  "Request of Subscription - Submitted",
  "Request of Subscription - Approved",
];

const todayKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

const fmtDate = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.message || "The request could not be completed.");
  return result;
}

const byNewest = (a: Milestone, b: Milestone) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id;

export default function EmployeeMilestones({
  employeeId,
}: {
  employeeId: number;
}) {
  const [items, setItems] = useState<Milestone[] | null>(null);
  const [error, setError] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(todayKey());
  const [particulars, setParticulars] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const base = `/api/admin/employees/${employeeId}/milestones`;

  const load = useCallback(async () => {
    try {
      setError("");
      const result = await readJson(await fetch(base, { cache: "no-store" }));
      setItems(((result.data ?? []) as Milestone[]).sort(byNewest));
    } catch (failure) {
      setItems([]);
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to load milestones.",
      );
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only show the buttons the account is allowed to use. The server enforces
  // the same rules, this just avoids showing a button that would fail.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await readJson(
          await fetch("/api/admin/session", { cache: "no-store" }),
        );
        if (!active) return;
        const actions: string[] =
          (session.permissions ?? []).find(
            (permission: { key: string }) =>
              permission.key === "employee_masterfile",
          )?.actions ?? [];
        const superadmin = session.is_superadmin === true;
        setCanCreate(superadmin || actions.includes("create"));
        setCanDelete(superadmin || actions.includes("delete"));
      } catch {
        /* leave the buttons hidden */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const resetForm = () => {
    setDate(todayKey());
    setParticulars("");
    setNotes("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!date || !particulars.trim()) return;

    setSaving(true);
    try {
      const result = await readJson(
        await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            particulars: particulars.trim(),
            notes: notes.trim() || null,
          }),
        }),
      );
      setItems((current) =>
        [...(current ?? []), result.data as Milestone].sort(byNewest),
      );
      resetForm();
      setAdding(false);
      toast.success("Milestone added.");
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Unable to add the milestone.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (milestone: Milestone) => {
    if (!window.confirm("Remove this milestone?")) return;

    setDeletingId(milestone.id);
    try {
      await readJson(
        await fetch(`${base}/${milestone.id}`, { method: "DELETE" }),
      );
      setItems((current) =>
        (current ?? []).filter((item) => item.id !== milestone.id),
      );
      toast.success("Milestone removed.");
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Unable to remove the milestone.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="border-b border-slate-200 pb-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Employee Milestones
        </p>
        {canCreate && !adding && (
          <Button
            className="h-8 px-3 text-xs"
            onClick={() => setAdding(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add milestone
          </Button>
        )}
      </div>

      {adding && (
        <form
          className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
          onSubmit={submit}
        >
          <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
            <div>
              <label
                className="mb-1 block text-xs font-medium text-slate-600"
                htmlFor={`milestone-date-${employeeId}`}
              >
                Date
              </label>
              <Input
                id={`milestone-date-${employeeId}`}
                onChange={(event) => setDate(event.target.value)}
                required
                type="date"
                value={date}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-medium text-slate-600"
                htmlFor={`milestone-particulars-${employeeId}`}
              >
                Particulars
              </label>
              <Input
                id={`milestone-particulars-${employeeId}`}
                maxLength={255}
                onChange={(event) => setParticulars(event.target.value)}
                placeholder="e.g. Evaluated by (Supervisor Name)"
                required
                value={particulars}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                    key={suggestion}
                    onClick={() => setParticulars(suggestion)}
                    type="button"
                  >
                    {suggestion.trim()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-medium text-slate-600"
              htmlFor={`milestone-notes-${employeeId}`}
            >
              Notes (optional)
            </label>
            <textarea
              className="min-h-[70px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              id={`milestone-notes-${employeeId}`}
              maxLength={2000}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. Result: Need Improvement"
              value={notes}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              disabled={saving}
              onClick={() => {
                resetForm();
                setAdding(false);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={saving || !date || !particulars.trim()}
              size="sm"
              type="submit"
            >
              {saving && <Loader className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save milestone
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </p>
      )}

      {items === null ? (
        <p className="py-3 text-sm text-slate-500">Loading milestones…</p>
      ) : items.length === 0 ? (
        <p className="py-3 text-sm text-slate-500">
          No milestones recorded yet. Onboarding and regularization appear on
          the employee&apos;s dashboard automatically.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((milestone) => (
            <li
              className="flex items-start justify-between gap-3 py-2.5"
              key={milestone.id}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  <span className="text-slate-500">
                    {fmtDate(milestone.date)}
                  </span>{" "}
                  - {milestone.particulars}
                </p>
                {milestone.notes && (
                  <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">
                    {milestone.notes}
                  </p>
                )}
              </div>
              {canDelete && (
                <button
                  aria-label={`Remove milestone ${milestone.particulars}`}
                  className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50"
                  disabled={deletingId === milestone.id}
                  onClick={() => void remove(milestone)}
                  type="button"
                >
                  {deletingId === milestone.id ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
