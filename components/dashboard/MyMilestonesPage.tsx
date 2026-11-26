"use client";
// components/dashboard/MyMilestonesPage.tsx

import { useMemo } from "react";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  Flag,
  Hourglass,
  Rocket,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import {
  buildMilestones,
  dayPart,
  fmtDate,
  parseDay,
  startOfToday,
  useEmployeeAccount,
  type Milestone,
} from "@/lib/employee-account";

type Tone = {
  icon: LucideIcon;
  dot: string;
  card: string;
  chip: string;
};

// Full class names so Tailwind can see them.
const TONES: Record<string, Tone> = {
  onboarding: {
    icon: Rocket,
    dot: "bg-emerald-500 text-white ring-emerald-100",
    card: "border-l-emerald-500",
    chip: "bg-emerald-50 text-emerald-700",
  },
  regular: {
    icon: BadgeCheck,
    dot: "bg-blue-600 text-white ring-blue-100",
    card: "border-l-blue-600",
    chip: "bg-blue-50 text-blue-700",
  },
  evaluation: {
    icon: ClipboardCheck,
    dot: "bg-amber-500 text-white ring-amber-100",
    card: "border-l-amber-500",
    chip: "bg-amber-50 text-amber-700",
  },
  request: {
    icon: Sparkles,
    dot: "bg-violet-600 text-white ring-violet-100",
    card: "border-l-violet-600",
    chip: "bg-violet-50 text-violet-700",
  },
  other: {
    icon: Flag,
    dot: "bg-indigo-600 text-white ring-indigo-100",
    card: "border-l-indigo-600",
    chip: "bg-indigo-50 text-indigo-700",
  },
};

function toneFor(text: string): { tone: Tone; label: string } {
  const t = text.toLowerCase();
  if (t.includes("onboarding"))
    return { tone: TONES.onboarding, label: "Onboarding" };
  if (t.includes("regular"))
    return { tone: TONES.regular, label: "Regularization" };
  if (t.includes("evaluat"))
    return { tone: TONES.evaluation, label: "Evaluation" };
  if (t.includes("request") || t.includes("subscription"))
    return { tone: TONES.request, label: "Request" };
  return { tone: TONES.other, label: "Milestone" };
}

function relativeTime(day: string) {
  const diff = Math.round(
    (startOfToday().getTime() - parseDay(day).getTime()) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  if (diff < 0) return `In ${Math.abs(diff)} days`;
  if (diff < 30) return `${diff} days ago`;
  const months = Math.floor(diff / 30.44);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} ${years === 1 ? "year" : "years"}${
    rest ? ` ${rest} mo` : ""
  } ago`;
}

function tenureText(hired: string) {
  if (!hired) return "—";
  const start = parseDay(hired);
  const now = startOfToday();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} ${m === 1 ? "month" : "months"}`;
  return `${y} ${y === 1 ? "year" : "years"}${m ? ` ${m} mo` : ""}`;
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/20 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/80">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1.5 truncate text-xl font-bold tabular-nums sm:text-2xl">
        {value}
      </p>
    </div>
  );
}

export default function MyMilestonesPage() {
  const { employee, manual, loaded, error } = useEmployeeAccount(true);

  const milestones = useMemo(
    () => buildMilestones(manual, employee),
    [manual, employee],
  );

  // Group by year, newest first.
  const groups = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    for (const m of milestones) {
      const year = m.date.slice(0, 4);
      map.set(year, [...(map.get(year) ?? []), m]);
    }
    return Array.from(map.entries());
  }, [milestones]);

  const latest = milestones[0];
  const hired = dayPart(employee?.date_hired);

  return (
    <div className="space-y-6 pb-8">
      <header className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-8 text-white shadow-lg sm:px-9">
        <div className="absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 -z-10 h-64 w-64 rounded-full bg-fuchsia-300/20 blur-3xl" />

        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <Flag aria-hidden="true" className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              My Milestones
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Your journey within the organization.
            </p>
          </div>
        </div>

        {loaded && employee && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatTile
              icon={Trophy}
              label="Milestones"
              value={String(milestones.length)}
            />
            <StatTile
              icon={Hourglass}
              label="Time with us"
              value={tenureText(hired)}
            />
            <StatTile
              icon={CalendarDays}
              label="Latest"
              value={latest ? relativeTime(latest.date) : "—"}
            />
          </div>
        )}
      </header>

      {error && (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {!loaded ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              className="h-24 animate-pulse rounded-2xl bg-slate-100"
              key={i}
            />
          ))}
        </div>
      ) : !employee ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Your account is not linked to an employee record yet. Ask HR to link
          it.
        </p>
      ) : milestones.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Flag aria-hidden="true" className="h-7 w-7" />
          </span>
          <p className="mt-3 font-semibold text-slate-900">No milestones yet</p>
          <p className="text-sm text-slate-500">
            HR adds new ones as they happen.
          </p>
        </section>
      ) : (
        <div className="space-y-8">
          {groups.map(([year, items]) => (
            <section key={year}>
              <div className="mb-4 flex items-center gap-3">
                <span className="rounded-full bg-slate-900 px-3.5 py-1 text-sm font-bold tabular-nums text-white">
                  {year}
                </span>
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs text-slate-500">
                  {items.length}{" "}
                  {items.length === 1 ? "milestone" : "milestones"}
                </span>
              </div>

              <ol>
                {items.map((milestone, index) => {
                  const { tone, label } = toneFor(milestone.particulars);
                  const Icon = tone.icon;
                  const isLatest = milestone.id === latest?.id;
                  const isLast = index === items.length - 1;

                  return (
                    <li
                      className="relative flex gap-4 pb-5 last:pb-0"
                      key={milestone.id}
                    >
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute left-[19px] top-10 h-[calc(100%-1.5rem)] w-0.5 bg-gradient-to-b from-slate-300 to-slate-100"
                        />
                      )}

                      <span
                        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm ring-4 ${tone.dot}`}
                      >
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </span>

                      <div
                        className={`min-w-0 flex-1 rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone.card}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone.chip}`}
                          >
                            {label}
                          </span>
                          {isLatest && (
                            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600">
                              Latest
                            </span>
                          )}
                          <span className="ml-auto text-xs text-slate-400">
                            {relativeTime(milestone.date)}
                          </span>
                        </div>

                        <h3 className="mt-2 text-base font-semibold text-slate-900">
                          {milestone.particulars}
                        </h3>

                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <CalendarDays
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                          {fmtDate(milestone.date)}
                        </p>

                        {milestone.notes && (
                          <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                            {milestone.notes}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
