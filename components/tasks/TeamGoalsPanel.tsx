"use client";
// components/tasks/TeamGoalsPanel.tsx
//
// For managers / supervisors / superadmin. Set daily, weekly and focus
// targets per employee, and send kudos. Drop it into the "My team" tab of
// My Tasks (or any page): <TeamGoalsPanel />
//
//   GET    /api/admin/task-management/goals
//   PUT    /api/admin/task-management/goals/{employee}
//   DELETE /api/admin/task-management/goals/{employee}
//   POST   /api/admin/task-management/kudos

import { useCallback, useEffect, useState } from "react";
import { Heart, Pencil, RefreshCw, Target } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";

type TeamRow = {
  employee_id: number;
  id_number: string | null;
  name: string;
  daily_tasks: number;
  weekly_tasks: number;
  daily_focus_minutes: number;
  is_manager_set: boolean;
  done_today: number;
  done_week: number;
};

const EMOJIS = ["👏", "🔥", "🌟", "💪", "🎯", "🙌"];

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.message || "The request could not be completed.");
  return result;
}

export default function TeamGoalsPanel() {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ daily: "", weekly: "", focus: "" });

  const [kudosFor, setKudosFor] = useState<number | null>(null);
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setError("");
      const result = await readJson(
        await adminFetch("/api/admin/task-management/goals", {
          cache: "no-store",
        }),
      );
      setRows(result.data as TeamRow[]);
    } catch (failure) {
      setRows((current) => current ?? []);
      setError(
        failure instanceof Error ? failure.message : "Unable to load targets.",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 4000);
  };

  const openEditor = (row: TeamRow) => {
    setKudosFor(null);
    setEditing(row.employee_id);
    setForm({
      daily: String(row.daily_tasks),
      weekly: String(row.weekly_tasks),
      focus: String(row.daily_focus_minutes),
    });
  };

  const openKudos = (row: TeamRow) => {
    setEditing(null);
    setKudosFor(row.employee_id);
    setEmoji(EMOJIS[0]);
    setMessage("");
  };

  const saveGoal = async (row: TeamRow) => {
    setBusy(true);
    setError("");
    try {
      await readJson(
        await adminFetch(
          `/api/admin/task-management/goals/${row.employee_id}`,
          {
            method: "PUT",
            headers: JSON_HEADERS,
            body: JSON.stringify({
              daily_tasks: Number(form.daily),
              weekly_tasks: Number(form.weekly),
              daily_focus_minutes: Number(form.focus),
            }),
          },
        ),
      );
      setEditing(null);
      flash(`Targets saved for ${row.name}.`);
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to save targets.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resetGoal = async (row: TeamRow) => {
    setBusy(true);
    setError("");
    try {
      await readJson(
        await adminFetch(
          `/api/admin/task-management/goals/${row.employee_id}`,
          { method: "DELETE", headers: JSON_HEADERS },
        ),
      );
      setEditing(null);
      flash(`${row.name} is back on the default targets.`);
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to reset targets.",
      );
    } finally {
      setBusy(false);
    }
  };

  const sendKudos = async (row: TeamRow) => {
    if (!message.trim()) return;
    setBusy(true);
    setError("");
    try {
      await readJson(
        await adminFetch("/api/admin/task-management/kudos", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            employee_id: row.employee_id,
            emoji,
            message: message.trim(),
          }),
        }),
      );
      setKudosFor(null);
      setMessage("");
      flash(`Kudos sent to ${row.name}.`);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to send kudos.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Target aria-hidden="true" className="h-4 w-4 text-blue-600" />
            Team targets and kudos
          </h2>
          <p className="text-sm text-slate-500">
            Targets you set replace the defaults (5 a day, 25 a week, 4 hours of
            focus) and employees can’t change them.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
          disabled={refreshing}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={refreshing ? "animate-spin" : ""}
            size={16}
          />
          Refresh
        </button>
      </div>

      {error && (
        <p
          className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {notice}
        </p>
      )}

      {rows === null ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="h-14 animate-pulse rounded-xl bg-slate-100"
              key={index}
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No team members to show.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {rows.map((row) => (
            <li className="py-3" key={row.employee_id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {row.name}
                    {row.id_number && (
                      <span className="ml-1 text-xs text-slate-400">
                        {row.id_number}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    Today {row.done_today}/{row.daily_tasks} · This week{" "}
                    {row.done_week}/{row.weekly_tasks} · Focus{" "}
                    {Math.round((row.daily_focus_minutes / 60) * 10) / 10}h
                    {row.is_manager_set && (
                      <span className="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        Set by manager
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    onClick={() => openEditor(row)}
                    type="button"
                  >
                    <Pencil aria-hidden="true" className="h-3 w-3" />
                    Set target
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1.5 text-xs font-medium text-pink-700 hover:bg-pink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                    onClick={() => openKudos(row)}
                    type="button"
                  >
                    <Heart aria-hidden="true" className="h-3 w-3" />
                    Kudos
                  </button>
                </div>
              </div>

              {editing === row.employee_id && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { key: "daily", label: "Tasks per day" },
                      { key: "weekly", label: "Tasks per week" },
                      { key: "focus", label: "Focus minutes per day" },
                    ].map((field) => (
                      <label
                        className="flex flex-col gap-1 text-xs text-slate-600"
                        key={field.key}
                      >
                        {field.label}
                        <input
                          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          min={1}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          type="number"
                          value={
                            form[field.key as "daily" | "weekly" | "focus"]
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {row.is_manager_set && (
                      <button
                        className="mr-auto text-xs font-medium text-slate-500 hover:underline disabled:opacity-60"
                        disabled={busy}
                        onClick={() => void resetGoal(row)}
                        type="button"
                      >
                        Reset to defaults
                      </button>
                    )}
                    <button
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      disabled={busy}
                      onClick={() => setEditing(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => void saveGoal(row)}
                      type="button"
                    >
                      {busy ? "Saving…" : "Save target"}
                    </button>
                  </div>
                </div>
              )}

              {kudosFor === row.employee_id && (
                <div className="mt-3 rounded-xl bg-pink-50 p-3 ring-1 ring-pink-100">
                  <div className="flex flex-wrap gap-1.5" role="radiogroup">
                    {EMOJIS.map((option) => (
                      <button
                        aria-checked={emoji === option}
                        className={`rounded-lg px-2.5 py-1 text-lg ${
                          emoji === option
                            ? "bg-white ring-2 ring-pink-400"
                            : "bg-pink-100 hover:bg-white"
                        }`}
                        key={option}
                        onClick={() => setEmoji(option)}
                        role="radio"
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="mt-2 w-full rounded-md border border-pink-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                    maxLength={280}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Say what they did well…"
                    rows={2}
                    value={message}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] tabular-nums text-pink-700">
                      {message.length}/280
                    </span>
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-pink-50"
                        disabled={busy}
                        onClick={() => setKudosFor(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-700 disabled:opacity-60"
                        disabled={busy || !message.trim()}
                        onClick={() => void sendKudos(row)}
                        type="button"
                      >
                        {busy ? "Sending…" : "Send kudos"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
