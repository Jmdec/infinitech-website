// File: lib/calendar-api.ts

// General Calendar (admin, superadmin only). Goes through the authenticated
// Next.js proxy like the other admin endpoints in lib/api.ts.
import { apiFetch } from "./api-client";

export type CalendarEventType = {
  id: number;
  name: string;
  is_default: boolean;
};

export type CalendarRepeat = "none" | "weekly" | "monthly" | "yearly"; // <-- bago

export type CalendarEvent = {
  id: number;
  title: string;
  event_type_id: number | null;
  particulars: string | null;
  start_date: string; // yyyy-MM-dd
  end_date: string; // yyyy-MM-dd
  start_time: string | null; // HH:mm or HH:mm:ss
  end_time: string | null;
  repeat?: CalendarRepeat; // <-- bago
  repeat_until?: string | null; // <-- bago (yyyy-MM-dd, null = forever)
  participant_ids: number[];
  created_at: string;
  updated_at: string;
};

export type CalendarEventPayload = {
  title: string;
  event_type_id: number;
  particulars: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  repeat: CalendarRepeat; // <-- bago
  repeat_until: string | null; // <-- bago
  participant_ids: number[];
};

// Surfaces Laravel validation errors / messages instead of just the status.
async function calendarJson<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = data?.errors
      ? Object.values(data.errors as Record<string, string[]>)
          .flat()
          .join(" ")
      : "";
    throw new Error(errors || data?.message || `${fallback}: ${res.status}`);
  }
  return data as T;
}

// ── Event types ──────────────────────────────────────────────────

export async function fetchCalendarEventTypes(): Promise<CalendarEventType[]> {
  const res = await apiFetch("/api/admin/calendar-event-types", {
    cache: "no-store",
  });
  return (
    await calendarJson<{ data: CalendarEventType[] }>(
      res,
      "Failed to fetch event types",
    )
  ).data;
}

export async function createCalendarEventType(
  name: string,
): Promise<CalendarEventType> {
  const res = await apiFetch("/api/admin/calendar-event-types", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (
    await calendarJson<{ data: CalendarEventType }>(
      res,
      "Failed to create event type",
    )
  ).data;
}

// ── Events ───────────────────────────────────────────────────────

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const res = await apiFetch("/api/admin/calendar-events", {
    cache: "no-store",
  });
  return (
    await calendarJson<{ data: CalendarEvent[] }>(
      res,
      "Failed to fetch calendar events",
    )
  ).data;
}

export async function createCalendarEvent(
  payload: CalendarEventPayload,
): Promise<CalendarEvent> {
  const res = await apiFetch("/api/admin/calendar-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (
    await calendarJson<{ data: CalendarEvent }>(
      res,
      "Failed to create calendar event",
    )
  ).data;
}

export async function updateCalendarEvent(
  id: number,
  payload: CalendarEventPayload,
): Promise<CalendarEvent> {
  const res = await apiFetch(`/api/admin/calendar-events/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (
    await calendarJson<{ data: CalendarEvent }>(
      res,
      "Failed to update calendar event",
    )
  ).data;
}

export async function deleteCalendarEvent(id: number): Promise<void> {
  const res = await apiFetch(`/api/admin/calendar-events/${id}`, {
    method: "DELETE",
  });
  await calendarJson<unknown>(res, "Failed to delete calendar event");
}

// Every employee in the masterfile, whatever their status (participant picker).
export async function fetchCalendarEmployees<T = unknown>(): Promise<T[]> {
  const res = await apiFetch("/api/employee-masterfile", {
    cache: "no-store",
  });
  return (await calendarJson<{ data: T[] }>(res, "Failed to fetch employees"))
    .data;
}
