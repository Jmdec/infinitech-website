"use client";
// components/dashboard/AnnouncementPanel.tsx
//
// Latest 3 announcements.
//   Employee dashboard: <AnnouncementPanel />            (fetch only)
//   Admin overview:     <AnnouncementPanel canManage />  (post + delete)
//
//   GET    /api/admin/announcements
//   POST   /api/admin/announcements        (admin only, enforced in Laravel)
//   DELETE /api/admin/announcements/:id    (admin only, enforced in Laravel)
//
// Live updates: when Laravel pushes a new announcement, the service worker
// posts an "announcement:push" message to open tabs. We reload the list and
// mark the new item. We also reload whenever the tab / installed app comes back
// to the foreground, so nothing is missed if a push was delayed.

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";

type Announcement = {
  id: number;
  title: string;
  body: string;
  created_at: string;
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function AnnouncementPanel({
  canManage = false,
}: {
  canManage?: boolean;
}) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState("");
  const [freshIds, setFreshIds] = useState<number[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/announcements", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setItems((json?.data ?? []) as Announcement[]);
      setError("");
    } catch {
      setItems((current) => current ?? []);
      setError("Unable to load announcements.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A push arrived while this page is open: refresh and mark the new item.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "announcement:push") return;
      const id = Number(event.data.payload?.announcement_id);
      if (id) {
        setFreshIds((current) =>
          current.includes(id) ? current : [...current, id],
        );
      }
      void load();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [load]);

  // Catch up when the tab or installed app returns to the foreground.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const post = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/announcements", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      if (!res.ok) throw new Error();
      setTitle("");
      setBody("");
      setComposeOpen(false);
      await load();
    } catch {
      setError("Unable to post the announcement.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setError("");
    try {
      const res = await adminFetch(`/api/admin/announcements/${id}`, {
        method: "DELETE",
        headers: JSON_HEADERS,
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError("Unable to delete the announcement.");
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 className="bg-blue-600 px-5 py-3 text-base font-semibold text-white">
        Announcement
      </h2>
      <div className="p-5">
        {error && (
          <p
            className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800"
            role="alert"
          >
            {error}
          </p>
        )}

        {items === null ? (
          <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
        ) : items.length === 0 ? (
          <p className="text-sm italic text-slate-500">
            No announcements yet. Announcements will be displayed here.
          </p>
        ) : (
          <ul aria-live="polite" className="space-y-3">
            {items.map((item) => {
              const isFresh = freshIds.includes(item.id);
              return (
                <li
                  className={`flex items-start justify-between gap-3 rounded-xl p-3 ring-1 ${
                    isFresh
                      ? "bg-blue-50 ring-blue-200"
                      : "bg-slate-50 ring-slate-100"
                  }`}
                  key={item.id}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Megaphone
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {item.title}
                        {isFresh && (
                          <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            New
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">
                        {item.body}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {fmtDate(item.created_at)}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      aria-label={`Delete announcement ${item.title}`}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                      onClick={() => void remove(item.id)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canManage && (
          <div className="mt-4">
            {composeOpen ? (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  maxLength={255}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Title"
                  value={title}
                />
                <textarea
                  className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  maxLength={5000}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Write the announcement"
                  value={body}
                />
                <p className="text-[11px] text-slate-400">
                  Everyone with notifications turned on gets a push on their
                  phone or desktop.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    disabled={saving}
                    onClick={() => setComposeOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={saving || !title.trim() || !body.trim()}
                    onClick={() => void post()}
                    type="button"
                  >
                    {saving ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                onClick={() => setComposeOpen(true)}
                type="button"
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                New announcement
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
