"use client";
// components/tasks/AutoPushSubscribe.tsx
//
// Mounted once in AdminShell. As soon as the admin is signed in:
//   - permission already granted -> subscribes this device right away
//   - permission not asked yet   -> asks on the first click/tap/keypress
//     (browsers, Safari/iOS especially, only allow the prompt after a user action)
//   - permission denied          -> nothing (only the browser settings can undo it)
// The subscription is re-sent once per browser session, so the device is always
// tied to whoever is signed in now.

import { useEffect } from "react";

// Must be the same key TaskPushToggle uses.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const SENT_KEY = "task_push_sent";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function subscribeDevice() {
  if (!VAPID_PUBLIC_KEY) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const response = await fetch("/api/admin/my-tasks/push-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (response.ok) sessionStorage.setItem(SENT_KEY, "1");
}

export default function AutoPushSubscribe({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || typeof Notification === "undefined") return;
    if (Notification.permission === "denied") return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void subscribeDevice().catch(() => {
        /* never break the admin shell because of notifications */
      });
    };

    if (Notification.permission === "granted") {
      if (sessionStorage.getItem(SENT_KEY) !== "1") run();
      return;
    }

    // permission === "default": ask on the first interaction.
    const ask = async () => {
      window.removeEventListener("pointerdown", ask);
      window.removeEventListener("keydown", ask);
      const result = await Notification.requestPermission();
      if (result === "granted") run();
    };
    window.addEventListener("pointerdown", ask, { once: true });
    window.addEventListener("keydown", ask, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", ask);
      window.removeEventListener("keydown", ask);
    };
  }, [enabled]);

  return null;
}
