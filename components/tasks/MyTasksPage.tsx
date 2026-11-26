"use client";
// components/tasks/MyTasksPage.tsx
//
// Everyone gets "My tasks" and "Activity log" (the API decides what each
// person may see: staff see their own, managers also see their team's).
// Managers/supervisors and superadmin also get the "My team" and
// "Targets & kudos" tabs.
//
// MULTIMEDIA: if the signed-in user's position or department is Multimedia,
// the timers are hidden and replaced with the date started / ended.
// Everyone else keeps the timers.
//
// HOW IT DECIDES (first match wins):
//   1. The API says so: `hide_timer` or `is_multimedia` === true on the
//      session (top level or inside `user`) or on /task-management/access.
//   2. Otherwise it scans the session for any field named like position /
//      department / designation and checks whether the text is "multimedia"
//      (any case, and "Multi Media", "multi-media" also match).

import { useEffect, useState } from "react";
import ActivityLogBoard from "@/components/tasks/ActivityLogBoard";
import MyTasksBoard from "@/components/tasks/MyTasksBoard";
import TaskManagementBoard from "@/components/tasks/TaskManagementBoard";
import TeamGoalsPanel from "@/components/tasks/TeamGoalsPanel";
import { adminFetch } from "@/lib/admin-fetch";

type Tab = "mine" | "team" | "goals" | "log";

// "Multi Media", "multi-media", "MULTIMEDIA" -> "multimedia"
const squash = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const isMultimediaText = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === "string") return squash(value).includes("multimedia");
  if (Array.isArray(value)) return value.some(isMultimediaText);
  if (typeof value === "object")
    return Object.values(value as Record<string, unknown>).some(
      isMultimediaText,
    );
  return false;
};

// Only fields that describe a job / department are checked, so a name or a
// permission key can never match by accident.
const FIELD_HINT =
  /position|department|dept|designation|job|division|unit|section/i;

function sessionLooksMultimedia(node: unknown, depth = 0): boolean {
  if (!node || typeof node !== "object" || depth > 6) return false;
  if (Array.isArray(node))
    return node.some((item) => sessionLooksMultimedia(item, depth + 1));

  return Object.entries(node as Record<string, unknown>).some(
    ([key, value]) =>
      (FIELD_HINT.test(key) && isMultimediaText(value)) ||
      sessionLooksMultimedia(value, depth + 1),
  );
}

const flagged = (data: any) =>
  data?.hide_timer === true ||
  data?.is_multimedia === true ||
  data?.user?.hide_timer === true ||
  data?.user?.is_multimedia === true;

export default function MyTasksPage() {
  const [canAssign, setCanAssign] = useState(false);
  const [hideTimer, setHideTimer] = useState(false);
  // Wait for the session before drawing the board, so timers never flash on
  // screen for a Multimedia user.
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("mine");

  useEffect(() => {
    let active = true;
    (async () => {
      const [accessResult, sessionResult] = await Promise.allSettled([
        fetch("/api/admin/task-management/access", {
          cache: "no-store",
          credentials: "same-origin",
        }).then(async (response) => ({
          ok: response.ok,
          data: await response.json().catch(() => ({})),
        })),
        adminFetch("/api/admin/session", { cache: "no-store" }).then(
          async (response) => ({
            ok: response.ok,
            data: await response.json().catch(() => ({})),
          }),
        ),
      ]);
      if (!active) return;

      const access =
        accessResult.status === "fulfilled" && accessResult.value.ok
          ? accessResult.value.data
          : null;
      const session =
        sessionResult.status === "fulfilled" && sessionResult.value.ok
          ? sessionResult.value.data
          : null;

      if (access) setCanAssign(access.can_assign === true);

      // Open the browser console to see what the API really returns.
      if (process.env.NODE_ENV !== "production") {
        console.log("[MyTasks] session:", session, "access:", access);
      }

      setHideTimer(
        flagged(access) || flagged(session) || sessionLooksMultimedia(session),
      );
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const tabs: [Tab, string][] = [
    ["mine", "My tasks"],
    ...(canAssign
      ? ([
          ["team", "My team"],
          ["goals", "Targets & kudos"],
        ] as [Tab, string][])
      : []),
    ["log", "Activity log"],
  ];

  // If the team tabs disappear (e.g. access check changes), fall back safely.
  const current: Tab = tabs.some(([key]) => key === tab) ? tab : "mine";

  if (!ready) {
    return (
      <div className="space-y-3">
        <div className="h-10 w-64 animate-pulse rounded-full bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div
        aria-label="My tasks sections"
        className="flex flex-wrap gap-2"
        role="tablist"
      >
        {tabs.map(([key, label]) => (
          <button
            aria-selected={current === key}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              current === key
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
            }`}
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {current === "mine" ? (
        <MyTasksBoard hideTimer={hideTimer} />
      ) : current === "team" ? (
        <TaskManagementBoard embedded hideTimer={hideTimer} />
      ) : current === "goals" ? (
        <TeamGoalsPanel />
      ) : (
        <ActivityLogBoard />
      )}
    </div>
  );
}
