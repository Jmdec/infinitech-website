"use client";
// FILE: components/tasks/TaskPushToggle.tsx
// Talks to Laravel through your existing /api/admin/my-tasks/[[...path]] proxy,
// so no new Next.js API route is needed.

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bell, BellOff, Loader } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const SW_URL = "/sw.js";
const READY_TIMEOUT_MS = 10000;

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

// True when an existing subscription was created with the current VAPID key.
// If the browser doesn't expose the key, we can't tell, so assume it matches.
function sameServerKey(subscription: PushSubscription, expected: Uint8Array) {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return (
    bytes.length === expected.length &&
    bytes.every((value, index) => value === expected[index])
  );
}

// Resolves with an ACTIVE registration, or rejects after the timeout.
// `ready` only resolves once a worker is active, which is what
// pushManager.subscribe() needs.
async function waitForActiveWorker(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("sw-timeout")), READY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// next-pwa normally registers /sw.js already. This registers it only if missing,
// then waits for an active worker. If the worker is stuck (installing/waiting
// forever, or a broken old registration), it unregisters everything and
// registers fresh, once, so users never need to do it by hand in DevTools.
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) {
    await navigator.serviceWorker.register(SW_URL);
  }

  try {
    return await waitForActiveWorker();
  } catch {
    // Self-heal: clear the stuck registration(s) and try one more time.
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((item) => item.unregister()));
    await navigator.serviceWorker.register(SW_URL);

    try {
      return await waitForActiveWorker();
    } catch {
      throw new Error(
        "Service worker isn't ready. Reload the page and try again.",
      );
    }
  }
}

export default function TaskPushToggle() {
  const [supported, setSupported] = useState(false);
  // Why push can't work here. Shown on the button instead of hiding it silently.
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!PUBLIC_KEY) {
      setUnavailable(
        "Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY. Add it to your env and rebuild.",
      );
      return;
    }
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setUnavailable(
        "This browser can't do push here. Use HTTPS (or localhost) and a supported browser.",
      );
      return;
    }

    setSupported(true);
    setDenied(Notification.permission === "denied");

    (async () => {
      try {
        const registration = await getRegistration();
        let existing = await registration.pushManager.getSubscription();

        // A subscription made with an old VAPID key will never work with the
        // current server key, so drop it and let the user re-enable cleanly.
        if (
          existing &&
          !sameServerKey(existing, urlBase64ToUint8Array(PUBLIC_KEY))
        ) {
          await existing.unsubscribe();
          existing = null;
        }

        const active =
          Boolean(existing) && Notification.permission === "granted";
        setSubscribed(active);

        // Quietly re-save it so the server never loses a still-valid device.
        if (existing && active) {
          void adminFetch("/api/admin/my-tasks/push-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(existing.toJSON()),
          });
        }
      } catch (error) {
        // Push not available in this browser/session. Logged so it's debuggable.
        console.error("[TaskPushToggle] init failed:", error);
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      // Keep this first: Safari/iOS require requestPermission() to run
      // directly inside the click, before any other awaited work.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDenied(permission === "denied");
        toast.error("Notifications were not allowed.");
        return;
      }

      const registration = await getRegistration();
      const serverKey = urlBase64ToUint8Array(PUBLIC_KEY);

      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !sameServerKey(subscription, serverKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: serverKey,
        });
      }

      const response = await adminFetch(
        "/api/admin/my-tasks/push-subscription",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        },
      );
      if (!response.ok) throw new Error("Could not save your subscription.");

      setSubscribed(true);
      toast.success("Task notifications are on.");
    } catch (failure) {
      console.error("[TaskPushToggle] enable failed:", failure);
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Could not turn on notifications.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await adminFetch("/api/admin/my-tasks/push-unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Task notifications are off.");
    } catch (failure) {
      console.error("[TaskPushToggle] disable failed:", failure);
      toast.error("Could not turn off notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (unavailable)
    return (
      <button
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-medium opacity-70"
        disabled
        title={unavailable}
        type="button"
      >
        <BellOff aria-hidden="true" className="h-4 w-4" />
        Notifications unavailable
      </button>
    );

  if (!supported) return null;

  return (
    <button
      className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
      disabled={busy || denied}
      onClick={() => void (subscribed ? disable() : enable())}
      title={
        denied
          ? "Notifications are blocked in your browser settings."
          : undefined
      }
      type="button"
    >
      {busy ? (
        <Loader aria-hidden="true" className="h-4 w-4 animate-spin" />
      ) : subscribed ? (
        <Bell aria-hidden="true" className="h-4 w-4" />
      ) : (
        <BellOff aria-hidden="true" className="h-4 w-4" />
      )}
      {denied
        ? "Blocked"
        : subscribed
          ? "Notifications on"
          : "Enable notifications"}
    </button>
  );
}
