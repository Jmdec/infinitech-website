"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

const OT_URL = "/api/admin/overtime-requests";
const LEAVE_URL = "/api/admin/leave-requests";
const PENDING = "Pending review";
const POLL_MS = 15_000;
const STORE_KEY = "approval_notifs_v1";

export const APPROVALS_CHANGED_EVENT = "approvals:changed";

export const notifyApprovalsChanged = () =>
  window.dispatchEvent(new Event(APPROVALS_CHANGED_EVENT));

export type EmployeeRow = {
  id: number;
  employee_id: string;
  name: string;
  department: string | null;
  position: string | null;
  is_active?: boolean | number | string | null;
  status?: string | null;
};

export type ApprovalNotif = {
  key: string;
  kind: "ot" | "leave";
  message: string;
  at: number; // timestamp kung kailan na-detect / na-file
  read: boolean;
};

export const norm = (v?: string | null) =>
  String(v ?? "")
    .trim()
    .toLowerCase();
export const isManager = (e: EmployeeRow) =>
  /\bmanager\b/.test(norm(e.position));
export const isSupervisor = (e: EmployeeRow) =>
  /\bsupervisor\b/.test(norm(e.position));
export const isCeoEA = (e: EmployeeRow) =>
  /executive assistant/.test(norm(e.position));

export const isCeo = (e: EmployeeRow) =>
  !isCeoEA(e) && /\bceo\b|chief executive/.test(norm(e.position));

// DAGDAG, sa ilalim ng isCeo
export const isHead = (e: EmployeeRow) =>
  /\b(head|director)\b/.test(norm(e.position));

export const rank = (e: EmployeeRow) =>
  isHead(e) ? 3 : isManager(e) ? 2 : isSupervisor(e) ? 1 : 0;

/** Can `approver` review a request filed by `requester`? */
export function canApprove(
  approver: EmployeeRow | undefined,
  requester: EmployeeRow,
  employees: EmployeeRow[],
): boolean {
  if (!approver || approver.id === requester.id) return false;
  if (!isActiveEmployee(approver)) return false;

  // EA's request: CEO only
  if (isCeoEA(requester)) return isCeo(approver);

  // EA and CEO see everyone else's
  if (isCeoEA(approver) || isCeo(approver)) return true;

  // Same department, higher rank
  return (
    norm(approver.department) === norm(requester.department) &&
    rank(approver) > rank(requester)
  );
}
export const isActiveEmployee = (e: EmployeeRow) =>
  e.is_active !== undefined && e.is_active !== null
    ? Boolean(Number(e.is_active))
    : String(e.status ?? "active").toLowerCase() === "active";

export function resolveApproverId(
  requester: EmployeeRow | undefined,
  employees: EmployeeRow[],
): number | null {
  if (!requester) return null;
  const active = employees.filter(isActiveEmployee);

  // EA of the CEO: ang CEO lang ang approver.
  if (isCeoEA(requester)) {
    const ceo = active.find((e) => isCeo(e) && e.id !== requester.id);
    return ceo ? ceo.id : null;
  }

  const ea = active.find((e) => isCeoEA(e) && e.id !== requester.id);
  const deptHeads = active.filter(
    (e) =>
      e.id !== requester.id &&
      norm(e.department) === norm(requester.department) &&
      (isManager(e) || isSupervisor(e)),
  );
  const manager = deptHeads.find(isManager);
  const supervisor = deptHeads.find(isSupervisor);

  let pick: EmployeeRow | undefined;
  if (isManager(requester)) pick = ea;
  else if (isSupervisor(requester)) pick = manager ?? ea;
  else pick = supervisor ?? manager ?? ea;

  return pick ? pick.id : null;
}

async function getJson(url: string) {
  const token = localStorage.getItem("adminSessionActive");
  const res = await fetch(url, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

type PendingItem = {
  key: string;
  kind: "ot" | "leave";
  message: string;
  at: number;
};

async function fetchPending(): Promise<{
  items: PendingItem[];
  userKey: string;
}> {
  const [session, ot, leave, emp] = await Promise.all([
    getJson("/api/admin/session"),
    getJson(OT_URL),
    getJson(LEAVE_URL),
    getJson(`${LEAVE_URL}?resource=employees`),
  ]);

  const isSuperadmin = session.is_superadmin === true;
  const myId = Number(
    session.employee_id ??
      session.employee?.id ??
      session.user?.employee_id ??
      session.user?.employee?.id ??
      session.user?.id ??
      session.id ??
      0,
  );
  const userKey = myId ? String(myId) : isSuperadmin ? "superadmin" : "";
  if (!userKey) return { items: [], userKey: "" };

  const employees: EmployeeRow[] = emp.data ?? [];
  const me = employees.find((e) => e.id === myId);
  // Superadmin, EA, at CEO: kita lahat ng pending.
  //   const seesAll = isSuperadmin || (!!me && (isCeoEA(me) || isCeo(me)));

  const byNumber = new Map<string, EmployeeRow>();
  employees.forEach((e) => byNumber.set(e.employee_id, e));

  const collect = (
    rows: {
      id: number;
      employee_number: string;
      status: string;
      created_at?: string | null;
    }[],
    kind: "ot" | "leave",
  ): PendingItem[] =>
    rows.flatMap((r) => {
      if (r.status !== PENDING) return [];
      const requester = byNumber.get(r.employee_number);
      if (!requester || !isActiveEmployee(requester)) return [];
      const allowed =
        isSuperadmin || (!!me && canApprove(me, requester, employees));
      if (!allowed) return [];

      const filed = r.created_at ? new Date(r.created_at).getTime() : NaN;
      return [
        {
          key: `${kind}-${r.id}`,
          kind,
          message: `${requester.name} filed a ${
            kind === "ot" ? "overtime" : "leave"
          } request`,
          at: Number.isNaN(filed) ? Date.now() : filed,
        },
      ];
    });

  return {
    items: [
      ...collect(ot.data ?? [], "ot"),
      ...collect(leave.data ?? [], "leave"),
    ],
    userKey,
  };
}

const loadStore = (userKey: string): ApprovalNotif[] => {
  try {
    const raw = localStorage.getItem(`${STORE_KEY}:${userKey}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveStore = (userKey: string, list: ApprovalNotif[]) => {
  try {
    localStorage.setItem(`${STORE_KEY}:${userKey}`, JSON.stringify(list));
  } catch {
    /* ignore */
  }
};

export function useApprovalNotifications(enabled = true) {
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<ApprovalNotif[]>([]);
  const userKeyRef = useRef("");
  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem("adminSessionActive")) return;
    try {
      const { items, userKey } = await fetchPending();
      if (!userKey) return;
      userKeyRef.current = userKey;

      const stored = loadStore(userKey);
      const known = new Set(stored.map((n) => n.key));
      const pendingKeys = new Set(items.map((i) => i.key));

      const fresh = items.filter((i) => !known.has(i.key));
      const added: ApprovalNotif[] = fresh.map((i) => ({
        key: i.key,
        kind: i.kind,
        message: i.message,
        at: i.at,
        read: false,
      }));
      // Kapag na-approve/decline na (hindi na pending), mawawala sa listahan.
      const kept = stored.filter((n) => pendingKeys.has(n.key));
      const next = [...added, ...kept].sort((a, b) => b.at - a.at);

      saveStore(userKey, next);
      setNotifications(next);
      setCount(items.length);

      // Toast para sa bagong dating habang naka-open (hindi sa unang load).
      if (!firstLoad.current) {
        fresh
          .slice(0, 3)
          .forEach((i) =>
            toast(i.message, { icon: "🔔", duration: 8000, id: i.key }),
          );
        if (fresh.length > 3)
          toast(`+${fresh.length - 3} more requests waiting for approval`, {
            icon: "🔔",
            duration: 8000,
          });
      }
      firstLoad.current = false;
    } catch {
      /* keep the last known state */
    }
  }, []);

  const update = useCallback(
    (fn: (list: ApprovalNotif[]) => ApprovalNotif[]) => {
      setNotifications((current) => {
        const next = fn(current);
        if (userKeyRef.current) saveStore(userKeyRef.current, next);
        return next;
      });
    },
    [],
  );

  const markRead = useCallback(
    (key: string) =>
      update((list) =>
        list.map((n) => (n.key === key ? { ...n, read: true } : n)),
      ),
    [update],
  );

  const markAllRead = useCallback(
    () => update((list) => list.map((n) => ({ ...n, read: true }))),
    [update],
  );

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      setNotifications([]);
      firstLoad.current = true;
      return;
    }
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onFocus = () => void refresh();
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "approval:push") void refresh();
    };
    window.addEventListener(APPROVALS_CHANGED_EVENT, onFocus);
    window.addEventListener("focus", onFocus);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      clearInterval(timer);
      window.removeEventListener(APPROVALS_CHANGED_EVENT, onFocus);
      window.removeEventListener("focus", onFocus);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [enabled, refresh]);

  return { count, notifications, markRead, markAllRead };
}
