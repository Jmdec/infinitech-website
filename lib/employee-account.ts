// File: lib/employee-account.ts
//
// Shared by the My Milestones page, the Leave Credits page and the
// dashboard panel.
//   GET /api/admin/session         -> { employee: { date_hired, is_regular, regularization_date, ... } }
//   GET /api/admin/my-milestones   -> { data: [{ id, date, particulars, notes }] }
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";

export const LEAVE_CREDITS_PER_EMPLOYEE = 5;

export type EmployeeInfo = {
  date_hired?: string | null;
  is_regular?: boolean | number | null;
  regularization_date?: string | null;
  leave_credits_used?: number | null;
};

export type Milestone = {
  id: string;
  date: string; // YYYY-MM-DD
  particulars: string;
  notes?: string | null;
};

export const dayPart = (value?: string | null) =>
  value ? value.slice(0, 10) : "";

export function parseDay(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export const fmtDateObj = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export const fmtDate = (value: string) => fmtDateObj(parseDay(value));

export function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.message || "The request could not be completed.");
  return result;
}

/* ── Leave credits: locked until 1 year after the regularization date ── */

export function getLeaveStatus(employee: EmployeeInfo | null) {
  const isRegular = Boolean(employee?.is_regular);
  const regDay = dayPart(employee?.regularization_date);
  const today = startOfToday();

  let regDate: Date | null = null;
  let unlockDate: Date | null = null;
  if (regDay) {
    regDate = parseDay(regDay);
    unlockDate = new Date(
      regDate.getFullYear() + 1,
      regDate.getMonth(),
      regDate.getDate(),
    );
  }

  const unlocked =
    isRegular && unlockDate !== null && today.getTime() >= unlockDate.getTime();

  const used = Math.max(0, employee?.leave_credits_used ?? 0);
  const remaining = Math.max(0, LEAVE_CREDITS_PER_EMPLOYEE - used);

  let progress = 0;
  let daysLeft: number | null = null;
  if (isRegular && regDate && unlockDate) {
    const total = unlockDate.getTime() - regDate.getTime();
    const done = today.getTime() - regDate.getTime();
    progress = unlocked ? 1 : Math.min(1, Math.max(0, done / total));
    daysLeft = unlocked
      ? 0
      : Math.ceil((unlockDate.getTime() - today.getTime()) / 86_400_000);
  }

  let reason = "";
  if (!unlocked) {
    if (!isRegular) reason = "Available once you are regular for 1 year.";
    else if (!unlockDate)
      reason = "Regularization date is not set yet. Ask HR.";
    else reason = `Unlocks on ${fmtDateObj(unlockDate)}.`;
  }

  return {
    isRegular,
    unlocked,
    used,
    remaining,
    reason,
    regDate,
    unlockDate,
    progress,
    daysLeft,
  };
}

/* ── Milestones: manual entries + onboarding/regularization from the record ── */

export function buildMilestones(
  manual: Milestone[],
  employee: EmployeeInfo | null,
): Milestone[] {
  const list: Milestone[] = [...manual];
  const has = (date: string, text: string) =>
    list.some(
      (m) =>
        m.date === date &&
        m.particulars.toLowerCase().includes(text.toLowerCase()),
    );

  const hired = dayPart(employee?.date_hired);
  if (hired && !has(hired, "onboarding"))
    list.push({
      id: "derived-hired",
      date: hired,
      particulars: "Employee Onboarding",
    });

  const regDay = dayPart(employee?.regularization_date);
  if (employee?.is_regular && regDay && !has(regDay, "regular"))
    list.push({
      id: "derived-regular",
      date: regDay,
      particulars: "Regularization",
      notes: "Became a regular employee.",
    });

  return list.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.id.localeCompare(a.id, undefined, { numeric: true });
  });
}

/* ── Data hook ── */

export function useEmployeeAccount(withMilestones = false) {
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [manual, setManual] = useState<Milestone[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await readJson(
          await adminFetch("/api/admin/session", { cache: "no-store" }),
        );
        if (!active) return;
        setEmployee((session?.employee ?? null) as EmployeeInfo | null);
      } catch {
        /* no employee record: pages show a notice */
      }

      if (withMilestones) {
        try {
          const result = await readJson(
            await adminFetch("/api/admin/my-milestones", {
              cache: "no-store",
            }),
          );
          if (!active) return;
          setManual(
            (
              (result.data ?? []) as Array<Milestone & { id: number | string }>
            ).map((m) => ({
              ...m,
              id: String(m.id),
              date: dayPart(m.date),
            })),
          );
        } catch (failure) {
          if (active)
            setError(
              failure instanceof Error
                ? failure.message
                : "Unable to load milestones.",
            );
        }
      }

      if (active) setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [withMilestones]);

  return { employee, manual, loaded, error };
}
