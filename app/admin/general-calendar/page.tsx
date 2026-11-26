"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addYears, // <-- bago
  differenceInCalendarDays,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Employee, getFullName } from "@/components/admin/employee-types";
import {
  type CalendarEvent,
  type CalendarEventType,
  type CalendarRepeat,
  createCalendarEvent,
  createCalendarEventType,
  deleteCalendarEvent,
  fetchCalendarEmployees,
  fetchCalendarEvents,
  fetchCalendarEventTypes,
  updateCalendarEvent,
} from "@/lib/calendar-api";
import {
  DayTasksCard,
  DayTasksDialog,
  useTaskDayCounts,
  type DayCount,
} from "@/components/tasks/CalendarDayTasks";

type EventForm = {
  title: string;
  event_type_id: number | "";
  particulars: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  repeat: CalendarRepeat;
  repeat_until: string;
  participant_ids: number[];
};

const EMPTY_FORM: EventForm = {
  title: "",
  event_type_id: "",
  particulars: "",
  start_date: "",
  end_date: "",
  start_time: "",
  end_time: "",
  repeat: "none",
  repeat_until: "",
  participant_ids: [],
};

const MAX_LANES = 3;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PAGE_SIZE = 10;
const NEW_TYPE_VALUE = "__new__";

// Employees with these statuses don't get a birthday on the calendar.
// Set to [] to show everyone.
const BIRTHDAY_EXCLUDED_STATUSES: string[] = ["Resigned", "Terminated"];
const BIRTHDAY_TYPE_NAME = "birthdays";
const BIRTHDAY_FALLBACK_KEY = "birthdays";

// Colors per event type. Written out in full so Tailwind keeps the classes.
type TypeStyle = { bar: string; border: string; dot: string; chip: string };

const TYPE_PALETTE: TypeStyle[] = [
  {
    bar: "bg-cyan-100 text-cyan-950 hover:bg-cyan-200",
    border: "border-cyan-600",
    dot: "bg-cyan-500",
    chip: "bg-cyan-100 text-cyan-800",
  },
  {
    bar: "bg-rose-100 text-rose-950 hover:bg-rose-200",
    border: "border-rose-600",
    dot: "bg-rose-500",
    chip: "bg-rose-100 text-rose-800",
  },
  {
    bar: "bg-pink-100 text-pink-950 hover:bg-pink-200",
    border: "border-pink-600",
    dot: "bg-pink-500",
    chip: "bg-pink-100 text-pink-800",
  },
  {
    bar: "bg-amber-100 text-amber-950 hover:bg-amber-200",
    border: "border-amber-600",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-800",
  },
  {
    bar: "bg-emerald-100 text-emerald-950 hover:bg-emerald-200",
    border: "border-emerald-600",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-800",
  },
  {
    bar: "bg-violet-100 text-violet-950 hover:bg-violet-200",
    border: "border-violet-600",
    dot: "bg-violet-500",
    chip: "bg-violet-100 text-violet-800",
  },
  {
    bar: "bg-sky-100 text-sky-950 hover:bg-sky-200",
    border: "border-sky-600",
    dot: "bg-sky-500",
    chip: "bg-sky-100 text-sky-800",
  },
  {
    bar: "bg-orange-100 text-orange-950 hover:bg-orange-200",
    border: "border-orange-600",
    dot: "bg-orange-500",
    chip: "bg-orange-100 text-orange-800",
  },
];

// Fixed colors for the predefined types (index into TYPE_PALETTE).
const DEFAULT_TYPE_COLORS: Record<string, number> = {
  "company events": 0,
  holidays: 1,
  birthdays: 2,
};
const CUSTOM_PALETTE_START = 3;

// Events saved before types existed.
const NO_TYPE_STYLE: TypeStyle = {
  bar: "bg-slate-100 text-slate-900 hover:bg-slate-200",
  border: "border-slate-500",
  dot: "bg-slate-400",
  chip: "bg-slate-100 text-slate-700",
};
// The "Tasks" layer (people's work per day). Not an event type.
const TASKS_KEY = "tasks";
const TASKS_STYLE: TypeStyle = {
  bar: "bg-indigo-100 text-indigo-950",
  border: "border-indigo-600",
  dot: "bg-indigo-500",
  chip: "bg-indigo-100 text-indigo-800",
};
const selectClass =
  "h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-60";
const textareaClass =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

// Layout that must not depend on generated Tailwind utilities, so the
// calendar keeps its shape even if the stylesheet is stale.
const GRID_7: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
};

const TAB_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  whiteSpace: "nowrap",
};

type Segment = {
  event: CalendarEvent;
  startCol: number;
  endCol: number;
  lane: number;
  clipStart: boolean;
  clipEnd: boolean;
};

// ── helpers ──
function dateValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function parseDay(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatRange(start: string, end: string) {
  const s = parseDay(start);
  const e = parseDay(end);

  if (start === end) return format(s, "MMM d, yyyy");
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
    return `${format(s, "MMM d")}–${format(e, "d, yyyy")}`;
  if (s.getFullYear() === e.getFullYear())
    return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;

  return `${format(s, "MMM d, yyyy")} – ${format(e, "MMM d, yyyy")}`;
}

function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);

  return format(new Date(2000, 0, 1, h, m), "h:mm a");
}

// "All day", "9:00 AM", or "9:00 AM – 10:30 AM"
function eventTimeLabel(event: Pick<CalendarEvent, "start_time" | "end_time">) {
  if (!event.start_time) return "All day";
  if (!event.end_time) return formatTime(event.start_time);

  return `${formatTime(event.start_time)} – ${formatTime(event.end_time)}`;
}

function initials(name: string) {
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function pluralParticipants(count: number) {
  return `${count} ${count === 1 ? "participant" : "participants"}`;
}

// Birthday events are generated, never saved. They carry a negative id so
// they can never clash with (or be mistaken for) a real database event.
function isBirthdayEvent(event: Pick<CalendarEvent, "id">) {
  return Number(event.id) < 0;
}

// "YYYY-MM-DD" birthday -> the date it falls on in `year`.
// Feb 29 birthdays are shown on Feb 28 in non-leap years.
function birthdayInYear(birthday: string, year: number) {
  const [, m, d] = birthday.slice(0, 10).split("-").map(Number);

  if (!m || !d) return null;

  const lastDay = new Date(year, m, 0).getDate();

  return dateValue(new Date(year, m - 1, Math.min(d, lastDay)));
}
const REPEAT_LABELS: Record<CalendarRepeat, string> = {
  none: "Does not repeat",
  weekly: "every week",
  monthly: "every month",
  yearly: "every year",
};

// Gumagawa ng kopya ng event para sa bawat pag-ulit sa loob ng [from, to].
function expandRecurring(
  event: CalendarEvent,
  from: string,
  to: string,
): CalendarEvent[] {
  const repeat = event.repeat ?? "none";

  if (repeat === "none") return [event];

  const start = parseDay(event.start_date);
  const span = differenceInCalendarDays(parseDay(event.end_date), start);
  const until = event.repeat_until ? event.repeat_until.slice(0, 10) : null;
  const limit = until && until < to ? until : to;
  const out: CalendarEvent[] = [];

  for (let i = 0; i < 1000; i++) {
    const s =
      repeat === "weekly"
        ? addDays(start, i * 7)
        : repeat === "monthly"
          ? addMonths(start, i)
          : addYears(start, i);
    const startValue = dateValue(s);

    if (startValue > limit) break;

    const endValue = dateValue(addDays(s, span));

    if (endValue >= from) {
      out.push({ ...event, start_date: startValue, end_date: endValue });
    }
  }

  return out;
}
function pluralPeople(n: number) {
  return `${n} ${n === 1 ? "person" : "people"}`;
}
const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? "";
// "Juan Dela Cruz" -> "Juan D."
// "Juan Dela Cruz" -> "Juan"
function shortName(full: string) {
  return full.trim().split(/\s+/)[0] ?? "";
}

// Label ng task chip sa bawat araw ng month view.
function taskChipLabel(count: DayCount) {
  const names = count.names ?? [];
  const tasks = `${count.tasks} ${count.tasks === 1 ? "task" : "tasks"}`;

  // fallback kung wala pang names galing backend
  if (names.length === 0) {
    return `${tasks} · ${pluralPeople(count.people)}`;
  }

  // 1 tao
  if (count.people === 1) {
    return `${shortName(names[0])} · ${tasks}`;
  }

  // 2 tao
  if (count.people === 2 && names.length >= 2) {
    return `${firstName(names[0])}, ${firstName(names[1])} · ${tasks}`;
  }

  // 3+ tao
  return `${count.people} people · ${tasks}`;
}
function layoutWeek(
  weekDays: Date[],
  events: CalendarEvent[],
  maxLanes = MAX_LANES,
) {
  const first = dateValue(weekDays[0]);
  const last = dateValue(weekDays[6]);
  const laneEnds: number[] = [];
  const segments: Segment[] = events
    .filter((e) => e.start_date <= last && e.end_date >= first)
    .sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) ||
        b.end_date.localeCompare(a.end_date) ||
        (a.start_time || "").localeCompare(b.start_time || "") ||
        a.title.localeCompare(b.title),
    )
    .map((event) => {
      const clipStart = event.start_date < first;
      const clipEnd = event.end_date > last;
      const startCol = differenceInCalendarDays(
        parseDay(clipStart ? first : event.start_date),
        weekDays[0],
      );
      const endCol = differenceInCalendarDays(
        parseDay(clipEnd ? last : event.end_date),
        weekDays[0],
      );
      let lane = laneEnds.findIndex((end) => end < startCol);

      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = endCol;

      return { event, startCol, endCol, lane, clipStart, clipEnd };
    });
  const overflow = weekDays.map(
    (_, col) =>
      segments.filter(
        (s) => s.lane >= maxLanes && s.startCol <= col && s.endCol >= col,
      ).length,
  );
  const rows =
    Math.min(laneEnds.length, maxLanes) + (overflow.some((n) => n > 0) ? 1 : 0);

  return { segments, overflow, rows };
}

// ── small UI pieces ──
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-cyan-100 font-semibold text-cyan-900 ${size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"}`}
    >
      {initials(name)}
    </span>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-800">
      <span>
        {label}
        {required && (
          <span className="ml-0.5 text-rose-600" aria-hidden>
            {" "}
            *
          </span>
        )}
      </span>
      {children}
      {hint && (
        <span className="block text-xs font-normal text-slate-500">{hint}</span>
      )}
    </label>
  );
}

function EventRow({
  event,
  onOpen,
  showDate,
  dotClass,
  typeName,
}: {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  showDate?: boolean;
  dotClass: string;
  typeName: string | null;
}) {
  return (
    <button
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
      onClick={() => onOpen(event)}
    >
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900">
          {event.title}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {typeName ? `${typeName} · ` : ""}
          {showDate ? `${formatRange(event.start_date, event.end_date)}, ` : ""}
          {eventTimeLabel(event)}
          {event.participant_ids.length > 0 && !isBirthdayEvent(event)
            ? ` · ${pluralParticipants(event.participant_ids.length)}`
            : ""}
        </span>
      </span>
    </button>
  );
}

export default function GeneralCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<CalendarEventType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [view, setView] = useState<"calendar" | "week" | "list">("calendar");
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Unchecked event types (hidden from the calendar). New types start checked.
  const [hiddenTypeIds, setHiddenTypeIds] = useState<Set<string>>(new Set());
  const [participantFilter, setParticipantFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sortAscending, setSortAscending] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [participantQuery, setParticipantQuery] = useState("");
  const [participantStatus, setParticipantStatus] = useState("All");

  // "Add new type" inline form (inside the event dialog)
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [savingType, setSavingType] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [tasksDialogOpen, setTasksDialogOpen] = useState(false);

  const today = new Date();
  const todayValue = dateValue(today);
  const weekAheadValue = dateValue(addDays(today, 7));

  const showTasks = !hiddenTypeIds.has(TASKS_KEY);
  const taskCounts = useTaskDayCounts(
    format(month, "yyyy-MM"),
    showTasks && view !== "list",
  );
  // ── data (Laravel) ──
  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await fetchCalendarEvents());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load the calendar.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEventTypes = useCallback(async () => {
    try {
      setEventTypes(await fetchCalendarEventTypes());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load event types.",
      );
    }
  }, []);

  // Every employee in the masterfile, whatever their status.
  const loadEmployees = useCallback(async () => {
    try {
      setEmployees(await fetchCalendarEmployees<Employee>());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load employees.",
      );
    }
  }, []);

  useEffect(() => {
    void loadEvents();
    void loadEventTypes();
    void loadEmployees();
  }, [loadEvents, loadEventTypes, loadEmployees]);

  useEffect(() => {
    setPage(1);
  }, [search, hiddenTypeIds, participantFilter, fromFilter, toFilter]);

  const employeeById = useMemo(() => {
    const map = new Map<number, Employee>();

    for (const e of employees) map.set(Number(e.id), e);

    return map;
  }, [employees]);

  const participantsOf = useCallback(
    (event: CalendarEvent) =>
      event.participant_ids.map((id) => ({
        id,
        employee: employeeById.get(Number(id)),
      })),
    [employeeById],
  );

  // ── event type helpers ──
  const typeNameById = useMemo(() => {
    const map = new Map<number, string>();

    for (const t of eventTypes) map.set(t.id, t.name);

    return map;
  }, [eventTypes]);

  const typeStyleById = useMemo(() => {
    const map = new Map<number, TypeStyle>();
    const customSlots = TYPE_PALETTE.length - CUSTOM_PALETTE_START;
    let custom = 0;

    for (const t of eventTypes) {
      const fixed = DEFAULT_TYPE_COLORS[t.name.trim().toLowerCase()];

      if (fixed !== undefined) {
        map.set(t.id, TYPE_PALETTE[fixed]);
      } else {
        map.set(
          t.id,
          TYPE_PALETTE[CUSTOM_PALETTE_START + (custom % customSlots)],
        );
        custom++;
      }
    }

    return map;
  }, [eventTypes]);

  // The predefined "Birthdays" type, if the backend has it.
  const birthdayTypeId = useMemo(
    () =>
      eventTypes.find((t) => t.name.trim().toLowerCase() === BIRTHDAY_TYPE_NAME)
        ?.id ?? null,
    [eventTypes],
  );

  const typeNameOf = useCallback(
    (event: CalendarEvent) => {
      if (isBirthdayEvent(event)) {
        return birthdayTypeId != null
          ? (typeNameById.get(birthdayTypeId) ?? "Birthdays")
          : "Birthdays";
      }

      return event.event_type_id != null
        ? (typeNameById.get(event.event_type_id) ?? null)
        : null;
    },
    [typeNameById, birthdayTypeId],
  );

  const styleOf = useCallback(
    (event: CalendarEvent): TypeStyle => {
      if (isBirthdayEvent(event)) {
        return (
          (birthdayTypeId != null
            ? typeStyleById.get(birthdayTypeId)
            : undefined) ??
          TYPE_PALETTE[DEFAULT_TYPE_COLORS[BIRTHDAY_TYPE_NAME]]
        );
      }

      return (
        (event.event_type_id != null
          ? typeStyleById.get(event.event_type_id)
          : undefined) ?? NO_TYPE_STYLE
      );
    },
    [typeStyleById, birthdayTypeId],
  );

  // Key used by the event type checkboxes (sidebar) to show/hide events.
  const typeKeyOf = useCallback(
    (event: CalendarEvent) =>
      isBirthdayEvent(event)
        ? String(birthdayTypeId ?? BIRTHDAY_FALLBACK_KEY)
        : String(event.event_type_id ?? "none"),
    [birthdayTypeId],
  );

  // ── birthdays (generated from the masterfile) ──
  const birthdayEmployees = useMemo(
    () =>
      employees.filter(
        (e) =>
          !!e.birthday &&
          !BIRTHDAY_EXCLUDED_STATUSES.includes(String(e.status)),
      ),
    [employees],
  );

  // Years to generate: around the month being viewed (covers the Dec/Jan
  // edges of the grid) plus this year and next (list + "Upcoming").
  const birthdayYears = useMemo(() => {
    const y = month.getFullYear();

    return Array.from(
      new Set([y - 1, y, y + 1, today.getFullYear(), today.getFullYear() + 1]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, todayValue]);

  const birthdayEvents = useMemo(() => {
    const result: CalendarEvent[] = [];

    for (const emp of birthdayEmployees) {
      const born = Number(emp.birthday.slice(0, 4));
      const shortName = (emp.nickname || emp.first_name || "").trim();

      for (const year of birthdayYears) {
        const day = birthdayInYear(emp.birthday, year);

        if (!day) continue;

        const age = year - born;

        result.push({
          id: -(Number(emp.id) * 10000 + year),
          title: `${shortName}'s birthday`,
          event_type_id: birthdayTypeId,
          particulars:
            age > 0
              ? `Turning ${age}${emp.department ? ` · ${emp.department}` : ""}`
              : null,
          start_date: day,
          end_date: day,
          start_time: null,
          end_time: null,
          participant_ids: [Number(emp.id)],
          created_at: emp.created_at,
          updated_at: emp.updated_at,
        } as unknown as CalendarEvent);
      }
    }

    return result;
  }, [birthdayEmployees, birthdayYears, birthdayTypeId]);

  // Saved events + generated birthdays.
  const allEvents = useMemo(() => {
    const rangeStart = addMonths(startOfMonth(month), -2);
    const rangeEnd = addMonths(month, 14);
    const from = dateValue(
      rangeStart < startOfMonth(today) ? rangeStart : startOfMonth(today),
    );
    const to = dateValue(
      rangeEnd > addMonths(today, 12) ? rangeEnd : addMonths(today, 12),
    );

    return [
      ...events.flatMap((e) => expandRecurring(e, from, to)),
      ...birthdayEvents,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, birthdayEvents, month, todayValue]);

  // ── filtering ──
  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const who = participantFilter.trim().toLowerCase();

    return allEvents
      .filter((event) => {
        const people = participantsOf(event)
          .map((p) => p.employee)
          .filter(Boolean) as Employee[];

        const matchesSearch =
          !query ||
          [
            event.title,
            event.particulars || "",
            typeNameOf(event) || "",
            ...people.flatMap((p) => [
              getFullName(p),
              String(p.id_number ?? ""),
              p.department || "",
            ]),
          ].some((value) => value.toLowerCase().includes(query));

        const matchesType = !hiddenTypeIds.has(typeKeyOf(event));

        const matchesParticipant =
          !who ||
          people.some(
            (p) =>
              getFullName(p).toLowerCase().includes(who) ||
              String(p.id_number ?? "")
                .toLowerCase()
                .includes(who),
          );

        const matchesDate =
          (!fromFilter || event.end_date >= fromFilter) &&
          (!toFilter || event.start_date <= toFilter);

        return (
          matchesSearch && matchesType && matchesParticipant && matchesDate
        );
      })
      .sort(
        (a, b) =>
          a.start_date.localeCompare(b.start_date) ||
          (a.start_time || "").localeCompare(b.start_time || "") ||
          a.title.localeCompare(b.title),
      );
  }, [
    allEvents,
    search,
    hiddenTypeIds,
    participantFilter,
    fromFilter,
    toFilter,
    participantsOf,
    typeNameOf,
    typeKeyOf,
  ]);

  const listEvents = useMemo(
    () => (sortAscending ? filteredEvents : [...filteredEvents].reverse()),
    [filteredEvents, sortAscending],
  );

  const activeFilterCount = [participantFilter, fromFilter, toFilter].filter(
    Boolean,
  ).length;

  const clearFilters = () => {
    setSearch("");
    setHiddenTypeIds(new Set());
    setParticipantFilter("");
    setFromFilter("");
    setToFilter("");
  };

  // Event type checkboxes (each type keeps its own color).
  const toggleType = (key: string) =>
    setHiddenTypeIds((prev) => {
      const next = new Set(prev);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });

  // Sidebar counts: saved events per type, plus one per birthday employee
  // (not one per generated year).
  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();

    for (const e of events) {
      const key = String(e.event_type_id ?? "none");

      map.set(key, (map.get(key) ?? 0) + 1);
    }

    if (birthdayEmployees.length > 0) {
      const key = String(birthdayTypeId ?? BIRTHDAY_FALLBACK_KEY);

      map.set(key, (map.get(key) ?? 0) + birthdayEmployees.length);
    }

    return map;
  }, [events, birthdayEmployees, birthdayTypeId]);

  const legendItems = useMemo(() => {
    const items = eventTypes.map((t) => ({
      key: String(t.id),
      name: t.name,
      style: typeStyleById.get(t.id) ?? NO_TYPE_STYLE,
    }));

    // No "Birthdays" type in the database yet, but birthdays are showing.
    if (birthdayTypeId == null && birthdayEmployees.length > 0) {
      items.push({
        key: BIRTHDAY_FALLBACK_KEY,
        name: "Birthdays",
        style: TYPE_PALETTE[DEFAULT_TYPE_COLORS[BIRTHDAY_TYPE_NAME]],
      });
    }

    // Events saved before types existed.
    if ((typeCounts.get("none") ?? 0) > 0) {
      items.push({ key: "none", name: "No type", style: NO_TYPE_STYLE });
    }

    items.push({ key: TASKS_KEY, name: "Tasks", style: TASKS_STYLE });

    return items;
  }, [
    eventTypes,
    typeStyleById,
    typeCounts,
    birthdayTypeId,
    birthdayEmployees,
  ]);

  const pages = Math.max(1, Math.ceil(listEvents.length / PAGE_SIZE));
  const visibleEvents = listEvents.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const stats = useMemo(
    () => ({
      today: allEvents.filter(
        (e) => e.start_date <= todayValue && e.end_date >= todayValue,
      ).length,
      upcoming: allEvents.filter(
        (e) => e.start_date > todayValue && e.start_date <= weekAheadValue,
      ).length,
    }),
    [allEvents, todayValue, weekAheadValue],
  );

  // Next few events that haven't ended yet (sidebar).
  const upcomingEvents = useMemo(
    () => filteredEvents.filter((e) => e.end_date >= todayValue).slice(0, 5),
    [filteredEvents, todayValue],
  );

  const selectedDayValue = dateValue(selectedDate);

  // ── calendar layout ──
  const weeks = useMemo(() => {
    const rangeStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const rangeEnd = addDays(
      startOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      6,
    );
    const days: Date[] = [];

    for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) days.push(d);
    const result: ({ days: Date[] } & ReturnType<typeof layoutWeek>)[] = [];

    for (let i = 0; i < days.length; i += 7) {
      const weekDays = days.slice(i, i + 7);

      result.push({ days: weekDays, ...layoutWeek(weekDays, filteredEvents) });
    }

    return result;
  }, [month, filteredEvents]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });

    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);
  const weekLayout = useMemo(
    () => layoutWeek(weekDays, filteredEvents, Infinity),
    [weekDays, filteredEvents],
  );

  const goToday = () => {
    setMonth(startOfMonth(today));
    setSelectedDate(today);
  };
  const goPrev = () => {
    if (view === "week") {
      const d = addDays(selectedDate, -7);

      setSelectedDate(d);
      setMonth(startOfMonth(d));
    } else setMonth((v) => subMonths(v, 1));
  };
  const goNext = () => {
    if (view === "week") {
      const d = addDays(selectedDate, 7);

      setSelectedDate(d);
      setMonth(startOfMonth(d));
    } else setMonth((v) => addMonths(v, 1));
  };

  // ── add / edit event ──
  const resetTypeForm = () => {
    setAddingType(false);
    setNewTypeName("");
  };

  const openCreate = (date?: Date) => {
    const day = dateValue(date ?? selectedDate);
    const defaultType =
      eventTypes.find((t) => t.name.toLowerCase() === "company events") ??
      eventTypes[0];

    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      event_type_id: defaultType ? defaultType.id : "",
      start_date: day,
      end_date: day,
    });
    setParticipantQuery("");
    setParticipantStatus("All");
    resetTypeForm();
    setFormOpen(true);
  };

  const openEdit = (occurrence: CalendarEvent) => {
    // Generated birthdays are edited in the masterfile, not here.
    if (isBirthdayEvent(occurrence)) return;

    // Kopya lang ang occurrence; ang orihinal na event ang ine-edit.
    const event = events.find((e) => e.id === occurrence.id) ?? occurrence;

    setSelectedEvent(null);
    setEditing(event);
    setForm({
      title: event.title,
      event_type_id: event.event_type_id ?? "",
      particulars: event.particulars || "",
      start_date: event.start_date,
      end_date: event.end_date,
      start_time: event.start_time ? event.start_time.slice(0, 5) : "",
      end_time: event.end_time ? event.end_time.slice(0, 5) : "",
      repeat: event.repeat ?? "none",
      repeat_until: event.repeat_until ? event.repeat_until.slice(0, 10) : "",
      participant_ids: event.participant_ids.map(Number),
    });
    setParticipantQuery("");
    setParticipantStatus("All");
    resetTypeForm();
    setFormOpen(true);
  };

  // Creates a new event type, then selects it in the form.
  const addEventType = async () => {
    const name = newTypeName.trim();

    if (!name) {
      toast.error("Enter the event type name.");

      return;
    }

    const existing = eventTypes.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );

    if (existing) {
      setForm((prev) => ({ ...prev, event_type_id: existing.id }));
      resetTypeForm();

      return;
    }

    setSavingType(true);
    try {
      const created = await createCalendarEventType(name);

      setEventTypes((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, event_type_id: created.id }));
      resetTypeForm();
      toast.success("Event type added.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to add the event type.",
      );
    } finally {
      setSavingType(false);
    }
  };

  // Participant picker: search + status filter over the WHOLE masterfile.
  const statuses = useMemo(
    () =>
      Array.from(
        new Set(employees.map((e) => String(e.status ?? "")).filter(Boolean)),
      ).sort(),
    [employees],
  );

  const shownEmployees = useMemo(() => {
    const q = participantQuery.trim().toLowerCase();

    return employees
      .filter(
        (e) =>
          (participantStatus === "All" || e.status === participantStatus) &&
          (!q ||
            getFullName(e).toLowerCase().includes(q) ||
            String(e.id_number ?? "")
              .toLowerCase()
              .includes(q) ||
            String(e.department ?? "")
              .toLowerCase()
              .includes(q)),
      )
      .slice()
      .sort((a, b) =>
        String(a.id_number ?? "").localeCompare(
          String(b.id_number ?? ""),
          undefined,
          { numeric: true, sensitivity: "base" },
        ),
      );
  }, [employees, participantQuery, participantStatus]);

  const selectedIds = useMemo(
    () => new Set(form.participant_ids),
    [form.participant_ids],
  );

  const toggleParticipant = (id: number) =>
    setForm((prev) => ({
      ...prev,
      participant_ids: prev.participant_ids.includes(id)
        ? prev.participant_ids.filter((x) => x !== id)
        : [...prev.participant_ids, id],
    }));

  // Adds everyone currently shown (no filters = the whole masterfile).
  const selectAllShown = () =>
    setForm((prev) => ({
      ...prev,
      participant_ids: Array.from(
        new Set([...prev.participant_ids, ...shownEmployees.map((e) => e.id)]),
      ),
    }));

  const clearParticipants = () =>
    setForm((prev) => ({ ...prev, participant_ids: [] }));

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim()) {
      toast.error("Enter the event title.");

      return;
    }
    if (form.event_type_id === "") {
      toast.error("Choose the event type.");

      return;
    }
    if (!form.start_date || !form.end_date) {
      toast.error("Choose the start and end dates.");

      return;
    }
    if (form.start_date > form.end_date) {
      toast.error("End date cannot be before start date.");

      return;
    }
    if (form.end_time && !form.start_time) {
      toast.error("Add a start time before the end time.");

      return;
    }
    if (
      form.start_time &&
      form.end_time &&
      form.start_date === form.end_date &&
      form.end_time <= form.start_time
    ) {
      toast.error("End time must be after the start time.");

      return;
    }
    if (
      form.repeat !== "none" &&
      form.repeat_until &&
      form.repeat_until < form.start_date
    ) {
      toast.error("Repeat end date cannot be before the start date.");

      return;
    }
    const payload = {
      title: form.title.trim(),
      event_type_id: Number(form.event_type_id),
      particulars: form.particulars.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      participant_ids: form.participant_ids,

      repeat: form.repeat,
      repeat_until: form.repeat === "none" ? null : form.repeat_until || null,
    };

    setSaving(true);
    try {
      if (editing) await updateCalendarEvent(editing.id, payload);
      else await createCalendarEvent(payload);

      toast.success(editing ? "Event updated." : "Event added.");
      setFormOpen(false);
      setSelectedEvent(null);
      await loadEvents();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save the event.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (event: CalendarEvent) => {
    if (isBirthdayEvent(event)) return;

    const repeats = event.repeat && event.repeat !== "none";

    if (
      !window.confirm(
        repeats
          ? `Delete "${event.title}" and all its repeats? This cannot be undone.`
          : `Delete "${event.title}"? This cannot be undone.`,
      )
    )
      return;

    try {
      await deleteCalendarEvent(event.id);
      toast.success("Event deleted.");
      setSelectedEvent(null);
      await loadEvents();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete the event.",
      );
    }
  };

  const dayCount =
    form.start_date && form.end_date && form.start_date <= form.end_date
      ? differenceInCalendarDays(
          parseDay(form.end_date),
          parseDay(form.start_date),
        ) + 1
      : 0;

  // Bar text: title, plus the time on the segment where the event starts.
  const barLabel = (seg: Segment) => (
    <>
      <span className="truncate font-medium">{seg.event.title}</span>
      {seg.event.start_time && (
        <span className="shrink-0 opacity-70">
          {formatTime(seg.event.start_time)}
        </span>
      )}
    </>
  );

  const barTitle = (event: CalendarEvent) =>
    `${event.title}${typeNameOf(event) ? ` [${typeNameOf(event)}]` : ""} (${formatRange(event.start_date, event.end_date)}, ${eventTimeLabel(event)})`;

  const selectedEventType = selectedEvent ? typeNameOf(selectedEvent) : null;
  const selectedIsBirthday = selectedEvent
    ? isBirthdayEvent(selectedEvent)
    : false;

  return (
    <section className="mx-auto max-w-[1600px] space-y-5 p-1 sm:p-2">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
                <CalendarRange className="h-6 w-6 text-white sm:h-7 sm:w-7" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  General calendar
                </h1>
                <p className="mt-1 text-sm text-blue-100">
                  Company events, schedules and who is part of them.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-blue-100">
                Showing{" "}
                <span className="font-semibold text-white">
                  {filteredEvents.length}
                </span>{" "}
                {filteredEvents.length === 1 ? "event" : "events"}
              </span>
              <span className="hidden h-4 w-px bg-white/30 sm:block" />
              <span className="inline-flex items-center gap-2 text-blue-100">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                <span>
                  <span className="font-semibold text-white">
                    {stats.today}
                  </span>{" "}
                  happening today
                </span>
              </span>
              <span className="inline-flex items-center gap-2 text-blue-100">
                <span className="h-2 w-2 rounded-full bg-cyan-200" />
                <span>
                  <span className="font-semibold text-white">
                    {stats.upcoming}
                  </span>{" "}
                  upcoming this week
                </span>
              </span>
            </div>
          </div>
          <Button
            className="h-11 shrink-0 bg-white px-5 font-semibold text-blue-700 shadow-md transition-colors hover:bg-blue-50"
            onClick={() => openCreate()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add event
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div
              aria-label="Calendar view"
              className="inline-flex shrink-0 self-start rounded-lg bg-slate-50 p-1"
              role="tablist"
              style={{ display: "inline-flex", gap: 4 }}
            >
              {(
                [
                  ["calendar", "Month", CalendarDays],
                  ["week", "Week", CalendarRange],
                  ["list", "List", List],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  aria-selected={view === key}
                  className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${view === key ? "bg-white text-cyan-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  role="tab"
                  style={TAB_STYLE}
                  onClick={() => setView(key)}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                aria-label="Search events"
                className="pl-9"
                placeholder="Search by event, type, details, participant or department"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                aria-controls="calendar-filters"
                aria-expanded={filtersOpen}
                variant="outline"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal className="h-4 w-4" /> Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1 rounded-full bg-cyan-700 px-1.5 text-xs font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              {(activeFilterCount > 0 || search || hiddenTypeIds.size > 0) && (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {filtersOpen && (
            <div
              className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-3"
              id="calendar-filters"
            >
              <Field label="Participant">
                <Input
                  placeholder="Name or employee ID"
                  value={participantFilter}
                  onChange={(event) => setParticipantFilter(event.target.value)}
                />
              </Field>
              <Field label="From">
                <Input
                  type="date"
                  value={fromFilter}
                  onChange={(event) => setFromFilter(event.target.value)}
                />
              </Field>
              <Field label="To">
                <Input
                  min={fromFilter || undefined}
                  type="date"
                  value={toFilter}
                  onChange={(event) => setToFilter(event.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          {view === "week" ? (
            /* ───────── WEEK PANEL ───────── */
            <div className="min-w-0 self-stretch overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {format(weekDays[0], "MMM d")} –{" "}
                  {format(weekDays[6], "MMM d, yyyy")}
                </h2>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={goToday}>
                    Today
                  </Button>
                  <Button
                    aria-label="Previous week"
                    size="icon"
                    variant="outline"
                    onClick={goPrev}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    aria-label="Next week"
                    size="icon"
                    variant="outline"
                    onClick={goNext}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 640 }}>
                  <div
                    className="border-b border-slate-200 bg-slate-50/70"
                    style={GRID_7}
                  >
                    {weekDays.map((day) => {
                      const isToday = isSameDay(day, today);
                      const isSelected = isSameDay(day, selectedDate);

                      return (
                        <button
                          key={dateValue(day)}
                          aria-pressed={isSelected}
                          className={`py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${isSelected ? "bg-cyan-50/70" : ""}`}
                          style={{ minWidth: 0 }}
                          onClick={() => setSelectedDate(day)}
                        >
                          <span className="block text-xs font-medium text-slate-500">
                            {format(day, "EEE")}
                          </span>
                          <span
                            className={`rounded-full text-sm tabular-nums ${isToday ? "bg-cyan-700 font-semibold text-white" : "text-slate-800"}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 28,
                              height: 28,
                              margin: "2px auto 0",
                            }}
                          >
                            {format(day, "d")}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ position: "relative" }}>
                    <div
                      style={{
                        ...GRID_7,
                        minHeight: Math.max(
                          320,
                          16 + weekLayout.rows * 26 + 16,
                        ),
                      }}
                    >
                      {weekDays.map((day) => (
                        <div
                          key={dateValue(day)}
                          className={`border-r border-slate-100 last:border-r-0 ${isSameDay(day, selectedDate) ? "bg-cyan-50/70" : ""}`}
                          style={{ minWidth: 0 }}
                        />
                      ))}
                    </div>

                    <div
                      style={{
                        ...GRID_7,
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: 8,
                        gridAutoRows: "22px",
                        rowGap: 4,
                        alignContent: "start",
                        pointerEvents: "none",
                      }}
                    >
                      {weekLayout.segments.map((seg) => {
                        const st = styleOf(seg.event);

                        return (
                          <button
                            key={`${seg.event.id}-${seg.startCol}`}
                            className={`px-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${st.bar} ${seg.clipStart ? "rounded-l-none" : `rounded-l border-l-[3px] ${st.border}`} ${seg.clipEnd ? "rounded-r-none" : "rounded-r"}`}
                            style={{
                              gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`,
                              gridRow: seg.lane + 1,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              minWidth: 0,
                              pointerEvents: "auto",
                              marginLeft: seg.clipStart ? 0 : 4,
                              marginRight: seg.clipEnd ? 0 : 4,
                            }}
                            title={barTitle(seg.event)}
                            onClick={() => setSelectedEvent(seg.event)}
                          >
                            {barLabel(seg)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-2 border-t border-slate-100 p-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading events
                </div>
              )}
              {!loading && weekLayout.segments.length === 0 && (
                <p className="border-t border-slate-100 p-6 text-center text-sm text-slate-500">
                  No events this week.
                </p>
              )}
            </div>
          ) : view === "calendar" ? (
            /* ───────── MONTH PANEL ───────── */
            <div className="min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {format(month, "MMMM yyyy")}
                </h2>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={goToday}>
                    Today
                  </Button>
                  <Button
                    aria-label="Previous month"
                    size="icon"
                    variant="outline"
                    onClick={() => setMonth((value) => subMonths(value, 1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    aria-label="Next month"
                    size="icon"
                    variant="outline"
                    onClick={() => setMonth((value) => addMonths(value, 1))}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div
                    className="border-b border-slate-200 bg-slate-50/70"
                    style={GRID_7}
                  >
                    {WEEKDAYS.map((day) => (
                      <div
                        key={day}
                        className="py-2 text-center text-xs font-medium text-slate-500"
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="divide-y divide-slate-200">
                    {weeks.map(
                      ({ days, segments, overflow, rows }, weekIndex) => (
                        <div
                          key={weekIndex}
                          className="relative"
                          style={{
                            minHeight: Math.max(
                              128,
                              48 + rows * 26 + 8 + (showTasks ? 26 : 0),
                            ),
                          }}
                        >
                          <div
                            style={{
                              ...GRID_7,
                              minHeight: Math.max(
                                128,
                                48 + rows * 26 + 8 + (showTasks ? 26 : 0),
                              ),
                            }}
                          >
                            {days.map((day) => {
                              const inMonth = isSameMonth(day, month);
                              const isToday = isSameDay(day, today);
                              const isSelected = isSameDay(day, selectedDate);
                              const taskCount = taskCounts[dateValue(day)];
                              const isWeekend =
                                day.getDay() === 0 || day.getDay() === 6;

                              return (
                                <div
                                  key={dateValue(day)}
                                  className={`relative border-r border-slate-100 p-1.5 last:border-r-0 sm:p-2 ${!inMonth ? "bg-slate-50/70" : ""} ${isSelected ? "bg-cyan-50/60" : ""}`}
                                >
                                  <button
                                    aria-label={`View events for ${format(day, "MMMM d, yyyy")}`}
                                    aria-pressed={isSelected}
                                    className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${isToday ? "bg-cyan-700 font-semibold text-white" : inMonth ? "text-slate-800 hover:bg-slate-50" : "text-slate-400"} ${isSelected && !isToday ? "ring-2 ring-cyan-600" : ""}`}
                                    onClick={() => setSelectedDate(day)}
                                  >
                                    {format(day, "d")}
                                  </button>
                                  {inMonth &&
                                    showTasks &&
                                    taskCount &&
                                    !isWeekend && (
                                      <button
                                        className="absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-md bg-indigo-50 px-1.5 py-0.5 text-left text-[11px] font-medium text-indigo-800 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
                                        onClick={() => {
                                          setSelectedDate(day);
                                          setTasksDialogOpen(true);
                                        }}
                                        title={`${taskCount.tasks} ${taskCount.tasks === 1 ? "task" : "tasks"} · ${pluralPeople(taskCount.people)}${
                                          taskCount.names?.length
                                            ? `\n${taskCount.names.join("\n")}${
                                                taskCount.people >
                                                taskCount.names.length
                                                  ? `\n+${taskCount.people - taskCount.names.length} more`
                                                  : ""
                                              }`
                                            : ""
                                        }`}
                                        type="button"
                                      >
                                        {taskChipLabel(taskCount)}
                                      </button>
                                    )}
                                </div>
                              );
                            })}
                          </div>

                          <div
                            style={{
                              ...GRID_7,
                              position: "absolute",
                              top: 40,
                              left: 0,
                              right: 0,
                              gridAutoRows: "22px",
                              rowGap: 4,
                              alignContent: "start",
                              pointerEvents: "none",
                            }}
                          >
                            {segments
                              .filter((segment) => segment.lane < MAX_LANES)
                              .map((segment) => {
                                const st = styleOf(segment.event);

                                return (
                                  <button
                                    key={`${segment.event.id}-${segment.startCol}`}
                                    aria-label={barTitle(segment.event)}
                                    className={`px-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${st.bar} ${segment.clipStart ? "rounded-l-none" : `rounded-l border-l-[3px] ${st.border}`} ${segment.clipEnd ? "rounded-r-none" : "rounded-r"}`}
                                    style={{
                                      gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
                                      gridRow: segment.lane + 1,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      minWidth: 0,
                                      pointerEvents: "auto",
                                      marginLeft: segment.clipStart ? 0 : 4,
                                      marginRight: segment.clipEnd ? 0 : 4,
                                    }}
                                    title={barTitle(segment.event)}
                                    onClick={() =>
                                      setSelectedEvent(segment.event)
                                    }
                                  >
                                    {!segment.clipStart && barLabel(segment)}
                                  </button>
                                );
                              })}
                            {overflow.map((count, dayIndex) =>
                              count > 0 ? (
                                <button
                                  key={`overflow-${weekIndex}-${dayIndex}`}
                                  className="truncate px-1 text-left text-xs font-medium text-cyan-700 hover:underline"
                                  style={{
                                    gridColumn: dayIndex + 1,
                                    gridRow: MAX_LANES + 1,
                                    minWidth: 0,
                                    pointerEvents: "auto",
                                  }}
                                  onClick={() =>
                                    setSelectedDate(days[dayIndex])
                                  }
                                >
                                  +{count} more
                                </button>
                              ) : null,
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 border-t border-slate-100 p-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading events
                </div>
              )}
              {!loading && filteredEvents.length === 0 && (
                <p className="border-t border-slate-100 p-6 text-center text-sm text-slate-500">
                  No events match these filters.
                </p>
              )}
            </div>
          ) : (
            /* ───────── LIST PANEL ───────── */
            <div className="min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <h2 className="font-semibold text-slate-900">
                  Events{" "}
                  <span className="font-normal text-slate-500">
                    ({filteredEvents.length})
                  </span>
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSortAscending((current) => !current)}
                >
                  Start date:{" "}
                  {sortAscending ? "earliest first" : "latest first"}
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading events
                </div>
              ) : visibleEvents.length === 0 ? (
                <div className="px-4 py-14 text-center">
                  <p className="font-medium text-slate-900">No events found</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Try a different search, or add a new event.
                  </p>
                  {(activeFilterCount > 0 ||
                    search ||
                    hiddenTypeIds.size > 0) && (
                    <Button
                      className="mt-4"
                      variant="outline"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                        <tr>
                          <th className="w-[28%] px-4 py-2.5 font-medium">
                            Event
                          </th>
                          <th className="w-[14%] px-3 py-2.5 font-medium">
                            Type
                          </th>
                          <th className="w-[20%] px-3 py-2.5 font-medium">
                            Dates
                          </th>
                          <th className="w-[16%] px-3 py-2.5 font-medium">
                            Time
                          </th>
                          <th className="w-[12%] px-3 py-2.5 font-medium">
                            Participants
                          </th>
                          <th className="w-[96px] px-4 py-2.5 text-right font-medium">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleEvents.map((event) => {
                          const typeName = typeNameOf(event);

                          return (
                            <tr
                              key={`${event.id}-${event.start_date}`}
                              className="align-middle text-slate-700 hover:bg-slate-50/60"
                            >
                              <td className="px-4 py-3">
                                <p className="truncate font-medium text-slate-900">
                                  {event.title}
                                </p>
                                {event.particulars && (
                                  <p
                                    className="truncate text-xs text-slate-500"
                                    title={event.particulars}
                                  >
                                    {event.particulars}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {typeName ? (
                                  <span
                                    className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${styleOf(event).chip}`}
                                  >
                                    {typeName}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <p className="truncate">
                                  {formatRange(
                                    event.start_date,
                                    event.end_date,
                                  )}
                                </p>
                              </td>
                              <td className="px-3 py-3">
                                <span className="inline-flex items-center gap-1.5 text-slate-600">
                                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                                  {eventTimeLabel(event)}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="inline-flex items-center gap-1.5 text-slate-600">
                                  <Users className="h-3.5 w-3.5 text-slate-400" />
                                  {event.participant_ids.length}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedEvent(event)}
                                >
                                  Details
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <ul className="divide-y divide-slate-100 md:hidden">
                    {visibleEvents.map((event) => (
                      <li key={`${event.id}-${event.start_date}`}>
                        <button
                          className="flex w-full flex-col gap-0.5 p-4 text-left hover:bg-slate-50"
                          onClick={() => setSelectedEvent(event)}
                        >
                          <span className="font-medium text-slate-900">
                            {event.title}
                          </span>
                          <span className="text-xs text-slate-500">
                            {typeNameOf(event) ? `${typeNameOf(event)} · ` : ""}
                            {formatRange(
                              event.start_date,
                              event.end_date,
                            )} · {eventTimeLabel(event)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {pluralParticipants(event.participant_ids.length)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
                    <span className="text-slate-500">
                      Showing {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, filteredEvents.length)} of{" "}
                      {filteredEvents.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">
                        Page {page} of {pages}
                      </span>
                      <Button
                        disabled={page <= 1}
                        size="sm"
                        variant="outline"
                        onClick={() => setPage((current) => current - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        disabled={page >= pages}
                        size="sm"
                        variant="outline"
                        onClick={() => setPage((current) => current + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ───────── RIGHT SIDEBAR ───────── */}
          <aside className="w-full space-y-4 self-start justify-self-end p-4 xl:w-[340px] xl:pl-0">
            {/* Event type filter */}
            {legendItems.length > 0 && (
              <div
                aria-label="Event types"
                className="rounded-xl border border-slate-200 bg-white p-4"
                role="group"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-slate-900">Event types</h2>
                  {hiddenTypeIds.size > 0 && (
                    <button
                      className="text-xs font-medium text-cyan-700 hover:underline"
                      type="button"
                      onClick={() => setHiddenTypeIds(new Set())}
                    >
                      Show all
                    </button>
                  )}
                </div>
                <div className="mt-3 space-y-1">
                  {legendItems.map((item) => {
                    const checked = !hiddenTypeIds.has(item.key);

                    return (
                      <label
                        key={item.key}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          checked={checked}
                          className="peer sr-only"
                          type="checkbox"
                          onChange={() => toggleType(item.key)}
                        />
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-600 ${checked ? `${item.style.dot} border-transparent` : "border-slate-300 bg-white"}`}
                        >
                          {checked && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <span
                          className={`flex-1 truncate ${checked ? "" : "text-slate-400"}`}
                        >
                          {item.name}
                        </span>
                        <span className="text-xs text-slate-400">
                          {item.key === TASKS_KEY
                            ? ""
                            : (typeCounts.get(item.key) ?? 0)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {view !== "list" && (
              <>
                {/* <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-slate-900">
                        {isSameDay(selectedDate, today)
                          ? "Today"
                          : format(selectedDate, "EEEE, MMM d")}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {selectedDayEvents.length === 0
                          ? "No events."
                          : `${selectedDayEvents.length} ${selectedDayEvents.length === 1 ? "event" : "events"}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openCreate(selectedDate)}
                    >
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>
                  {selectedDayEvents.length > 0 && (
                    <div className="mt-3 divide-y divide-slate-100">
                      {selectedDayEvents.map((event) => (
                        <EventRow
                          key={event.id}
                          dotClass={styleOf(event).dot}
                          event={event}
                          typeName={typeNameOf(event)}
                          onOpen={setSelectedEvent}
                        />
                      ))}
                    </div>
                  )}
                </div> */}

                {showTasks && <DayTasksCard date={selectedDayValue} />}

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="font-semibold text-slate-900">Upcoming</h2>
                  {upcomingEvents.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      No upcoming events.
                    </p>
                  ) : (
                    <div className="mt-3 divide-y divide-slate-100">
                      {upcomingEvents.map((event) => (
                        <EventRow
                          key={`${event.id}-${event.start_date}`}
                          showDate
                          dotClass={styleOf(event).dot}
                          event={event}
                          typeName={typeNameOf(event)}
                          onOpen={setSelectedEvent}
                        />
                      ))}
                    </div>
                  )}
                  {filteredEvents.filter((e) => e.end_date >= todayValue)
                    .length > 5 && (
                    <button
                      className="mt-3 text-sm font-medium text-cyan-700 hover:underline"
                      onClick={() => setView("list")}
                    >
                      See all events
                    </button>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </Card>

      {/* Add / edit event */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-4">
            <DialogTitle>{editing ? "Edit event" : "Add event"}</DialogTitle>
            <DialogDescription>
              Set the type, dates and optional time, then pick who is part of it
              from the masterfile.
            </DialogDescription>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitForm}>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Event details
                </h3>
                <Field label="Event title" required>
                  <Input
                    maxLength={150}
                    placeholder="e.g. Company outing"
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                  />
                </Field>

                <Field label="Event type" required>
                  <select
                    className={selectClass}
                    value={
                      addingType ? NEW_TYPE_VALUE : String(form.event_type_id)
                    }
                    onChange={(event) => {
                      const value = event.target.value;

                      if (value === NEW_TYPE_VALUE) {
                        setAddingType(true);

                        return;
                      }
                      setAddingType(false);
                      setForm({ ...form, event_type_id: Number(value) });
                    }}
                  >
                    {form.event_type_id === "" && !addingType && (
                      <option value="">Select event type</option>
                    )}
                    {eventTypes.map((type) => (
                      <option key={type.id} value={String(type.id)}>
                        {type.name}
                      </option>
                    ))}
                    <option value={NEW_TYPE_VALUE}>+ Add new type…</option>
                  </select>
                </Field>

                {addingType && (
                  <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-center">
                    <Input
                      autoFocus
                      aria-label="New event type name"
                      className="flex-1"
                      maxLength={50}
                      placeholder="New event type name"
                      value={newTypeName}
                      onChange={(event) => setNewTypeName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addEventType();
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                        disabled={savingType}
                        size="sm"
                        type="button"
                        onClick={() => void addEventType()}
                      >
                        {savingType ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Add type
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={resetTypeForm}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <Field
                  label="Particulars"
                  hint="Details, venue, reminders, etc."
                >
                  <textarea
                    className={textareaClass}
                    maxLength={5000}
                    rows={3}
                    value={form.particulars}
                    onChange={(event) =>
                      setForm({ ...form, particulars: event.target.value })
                    }
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Start date" required>
                    <Input
                      required
                      type="date"
                      value={form.start_date}
                      onChange={(event) => {
                        const startDate = event.target.value;

                        setForm({
                          ...form,
                          start_date: startDate,
                          end_date:
                            !form.end_date || form.end_date < startDate
                              ? startDate
                              : form.end_date,
                        });
                      }}
                    />
                  </Field>
                  <Field
                    hint={dayCount > 1 ? `${dayCount} days` : undefined}
                    label="End date"
                    required
                  >
                    <Input
                      required
                      min={form.start_date || undefined}
                      type="date"
                      value={form.end_date}
                      onChange={(event) =>
                        setForm({ ...form, end_date: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Start time (optional)">
                    <Input
                      type="time"
                      value={form.start_time}
                      onChange={(event) =>
                        setForm({ ...form, start_time: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    hint="Leave both times blank for an all-day event."
                    label="End time (optional)"
                  >
                    <Input
                      type="time"
                      value={form.end_time}
                      onChange={(event) =>
                        setForm({ ...form, end_time: event.target.value })
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Repeat">
                    <select
                      className={selectClass}
                      value={form.repeat}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          repeat: event.target.value as CalendarRepeat,
                        })
                      }
                    >
                      <option value="none">Does not repeat</option>
                      <option value="weekly">Every week</option>
                      <option value="monthly">Every month</option>
                      <option value="yearly">Every year</option>
                    </select>
                  </Field>

                  {form.repeat !== "none" && (
                    <Field
                      hint="Leave blank to repeat forever."
                      label="Repeat until (optional)"
                    >
                      <Input
                        min={form.start_date || undefined}
                        type="date"
                        value={form.repeat_until}
                        onChange={(event) =>
                          setForm({ ...form, repeat_until: event.target.value })
                        }
                      />
                    </Field>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Participants
                  </h3>
                  <span className="text-xs text-slate-500">
                    {form.participant_ids.length} selected of {employees.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      aria-label="Search employees"
                      className="pl-9"
                      placeholder="Search by name, ID or department"
                      value={participantQuery}
                      onChange={(event) =>
                        setParticipantQuery(event.target.value)
                      }
                    />
                  </div>
                  <select
                    aria-label="Filter employees by status"
                    className={`${selectClass} sm:w-44`}
                    value={participantStatus}
                    onChange={(event) =>
                      setParticipantStatus(event.target.value)
                    }
                  >
                    <option value="All">All statuses</option>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={shownEmployees.length === 0}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={selectAllShown}
                  >
                    Select all shown ({shownEmployees.length})
                  </Button>
                  <Button
                    disabled={form.participant_ids.length === 0}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={clearParticipants}
                  >
                    Clear selection
                  </Button>
                </div>

                <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {employees.length === 0 ? (
                    <p className="p-4 text-center text-sm text-slate-500">
                      Loading employees...
                    </p>
                  ) : shownEmployees.length === 0 ? (
                    <p className="p-4 text-center text-sm text-slate-500">
                      No employees match.
                    </p>
                  ) : (
                    shownEmployees.map((employee) => (
                      <label
                        key={employee.id}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50"
                      >
                        <input
                          checked={selectedIds.has(employee.id)}
                          className="h-4 w-4 accent-cyan-700"
                          type="checkbox"
                          onChange={() => toggleParticipant(employee.id)}
                        />
                        <Avatar name={getFullName(employee)} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {getFullName(employee)}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {employee.id_number} · {employee.department || "—"}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {employee.status}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </section>
            </div>
            <DialogFooter className="border-t border-slate-200 px-6 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-[#0e7490] text-white hover:bg-[#0c4a6e]"
                disabled={saving}
                type="submit"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Add event"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Event details */}
      <Dialog
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">
                  {selectedEvent.title}
                </DialogTitle>
                <DialogDescription>
                  {formatRange(
                    selectedEvent.start_date,
                    selectedEvent.end_date,
                  )}
                  {" · "}
                  {eventTimeLabel(selectedEvent)}
                </DialogDescription>
                {selectedEvent.repeat && selectedEvent.repeat !== "none" && (
                  <p className="text-xs text-slate-500">
                    Repeats {REPEAT_LABELS[selectedEvent.repeat]}
                    {selectedEvent.repeat_until
                      ? ` until ${formatRange(selectedEvent.repeat_until.slice(0, 10), selectedEvent.repeat_until.slice(0, 10))}`
                      : ""}
                  </p>
                )}
                {selectedEventType && (
                  <span
                    className={`mt-1 inline-block w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${styleOf(selectedEvent).chip}`}
                  >
                    {selectedEventType}
                  </span>
                )}
              </DialogHeader>

              {selectedEvent.particulars && (
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">
                    {selectedIsBirthday ? "Details" : "Particulars"}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">
                    {selectedEvent.particulars}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">
                  {selectedIsBirthday ? "Employee" : "Participants"}{" "}
                  <span className="font-normal text-slate-500">
                    ({selectedEvent.participant_ids.length})
                  </span>
                </p>
                {selectedEvent.participant_ids.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No participants added.
                  </p>
                ) : (
                  <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                    {participantsOf(selectedEvent).map(({ id, employee }) => (
                      <li
                        key={id}
                        className="flex items-center gap-3 px-3 py-2"
                      >
                        <Avatar
                          name={employee ? getFullName(employee) : "?"}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {employee
                              ? getFullName(employee)
                              : `Employee #${id}`}
                          </span>
                          {employee && (
                            <span className="block truncate text-xs text-slate-500">
                              {employee.id_number} ·{" "}
                              {employee.department || "—"}
                            </span>
                          )}
                        </span>
                        {employee && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {employee.status}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedIsBirthday ? (
                <p className="text-xs text-slate-500">
                  Birthdays come from the employee masterfile. To change one,
                  edit the employee&apos;s birthday there.
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-500">
                    Last updated{" "}
                    {format(
                      new Date(selectedEvent.updated_at),
                      "MMM d, yyyy p",
                    )}
                  </p>

                  <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-slate-200 pt-4 sm:justify-between">
                    <Button
                      className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      size="sm"
                      variant="ghost"
                      onClick={() => void deleteEvent(selectedEvent)}
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(selectedEvent)}
                    >
                      <Pencil className="h-4 w-4" /> Edit event
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <DayTasksDialog
        date={selectedDayValue}
        open={tasksDialogOpen}
        onOpenChange={setTasksDialogOpen}
      />
    </section>
  );
}
