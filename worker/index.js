// FILE: worker/index.js   (project root, next to package.json — NOT inside /public or /app)
//
// This is merged into the sw.js that @ducanh2912/next-pwa generates, so your
// existing caching keeps working and we only ADD push handling.
// Do not edit public/sw.js by hand: it is regenerated on every build.

/* global self */

const ICON = "/android-chrome-192x192.png";

const samePath = (a, b) => {
  try {
    return (
      new URL(a, self.location.origin).pathname ===
      new URL(b, self.location.origin).pathname
    );
  } catch (e) {
    return false;
  }
};

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Infinitech", body: event.data ? event.data.text() : "" };
  }

  const isAnnouncement = data.type === "announcement";
  const isApproval = data.type === "approval";
  // NEW: a new assignment that auto-started on top of another task.
  // The employee can answer Start / Pause right from the notification.
  const isDecision = data.type === "task_decision" && Boolean(data.task_id);
  const target =
    data.url || (isApproval ? "/admin/for-approval" : "/admin/my-tasks");

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // 1) Real-time: tell every open tab. Announcements use their own message
      //    type so the My Tasks page doesn't refresh for them.
      const messageType = isAnnouncement
        ? "announcement:push"
        : isApproval
          ? "approval:push"
          : "my-tasks:push";
      clients.forEach((client) =>
        client.postMessage({ type: messageType, payload: data }),
      );

      // 2) Skip the system notification only when the person is already looking
      //    at the page that shows it. For announcements that means the
      //    dashboard; on any other page they still get the notification.
      //    (For a decision, the in-app dialog already opens, so skipping is fine.)
      const looking = clients.some(
        (client) =>
          client.visibilityState === "visible" &&
          client.focused &&
          (!isAnnouncement || samePath(client.url, target)),
      );
      if (looking) return;

      // 3) Otherwise show a system notification.
      //    Unique tag per push, so every notification STACKS in the
      //    notification bar instead of replacing the previous one.
      const uniqueTag = `${data.tag || "push"}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      await self.registration.showNotification(
        data.title ||
          (isAnnouncement
            ? "New announcement"
            : isApproval
              ? "New request for approval"
              : isDecision
                ? "New task assigned"
                : "New task"),
        {
          body: data.body || "",
          icon: ICON,
          badge: ICON,
          tag: uniqueTag,
          vibrate: [200, 100, 200],
          // A decision is required, so keep it on screen until answered.
          requireInteraction: isDecision,
          actions: isDecision
            ? [
                { action: "start", title: "▶ Start new task" },
                { action: "pause", title: "⏸ Pause new task" },
              ]
            : [],
          data: {
            url: target,
            decision: isDecision
              ? {
                  task_id: data.task_id,
                  interrupted_task_id: data.interrupted_task_id ?? null,
                }
              : null,
          },
        },
      );
    })(),
  );
});

// Sends the Start / Pause answer straight from the notification.
// Falls back to opening the app (where the decision dialog shows) on any failure.
async function sendDecision(decision, info, url) {
  try {
    const res = await fetch(`/api/admin/my-tasks/${info.task_id}/decision`, {
      method: "PATCH",
      credentials: "same-origin", // same as adminFetch: carries the login cookie
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        reason: null,
        // "Pause" returns to Task A (the interrupted task) when there is one.
        resume_task_id:
          decision === "pause" ? (info.interrupted_task_id ?? null) : null,
      }),
    });
    if (!res.ok) throw new Error("decision failed");

    // Refresh any open tab right away.
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    clients.forEach((c) =>
      c.postMessage({
        type: "my-tasks:push",
        payload: { title: "Tasks updated" },
      }),
    );

    await self.registration.showNotification(
      decision === "start" ? "Continuing with the new task" : "New task paused",
      {
        icon: ICON,
        badge: ICON,
        tag: "decision-result",
        data: { url },
      },
    );
  } catch (e) {
    await self.clients.openWindow(url);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const url = d.url || "/admin/my-tasks";

  // Button pressed (Start / Pause)
  if (d.decision && (event.action === "start" || event.action === "pause")) {
    event.waitUntil(sendDecision(event.action, d.decision, url));
    return;
  }

  // Notification body tapped: open / focus the app
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (client.url.includes("/admin")) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// NetworkOnly (admin routes) throws "no-response" when the network is down.
self.addEventListener("unhandledrejection", (event) => {
  if (event.reason && event.reason.name === "no-response") {
    event.preventDefault();
  }
});
