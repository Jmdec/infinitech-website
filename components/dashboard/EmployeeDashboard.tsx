"use client";
// components/dashboard/EmployeeDashboard.tsx
//
// Employee home. Everything here comes from the employee's real task data:
//   GET /api/admin/my-tasks                       (open tasks + completed, last 30 days)
//   GET /api/admin/my-tasks/timeline?date=Y-m-d   (time logs, one call per day, last 7 days)
//   GET /api/admin/my-tasks/extras                (targets, kudos, leaderboard, lifetime count)
// Nothing is mocked. Streak, level, badges and the pet are computed from those.
// If /extras is not available yet, the dashboard falls back to the default
// targets and hides the kudos / leaderboard / edit-target parts. The pet then
// uses the 30-day count instead of the lifetime count.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crown,
  Flame,
  Gauge,
  Gem,
  Heart,
  Hourglass,
  Lightbulb,
  ListChecks,
  Lock,
  Medal,
  MessageSquareText,
  Moon,
  Pencil,
  Play,
  RefreshCw,
  Rocket,
  Snowflake,
  Sparkles,
  Star,
  Sunrise,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";
import EmployeeAccountPanel from "@/components/dashboard/EmployeeAccountPanel";
import AnnouncementPanel from "@/components/dashboard/AnnouncementPanel";



const MY_TASKS_HREF = "/admin/my-tasks";


const DEFAULT_DAILY_GOAL = 5; // tasks to finish per day
const DEFAULT_WEEKLY_GOAL = 25; // tasks to finish per week (Mon to Sun)
const DEFAULT_FOCUS_MINUTES = 240; // tracked focus per day

const STREAK_MILESTONES = [30, 14, 7, 3]; // biggest first
const CELEBRATED_KEY = "employee-dashboard-celebrated-v1";
const XP_PER_LEVEL = 50;
const BADGES_PER_PAGE = 6; // 2 columns x 3 rows, so the card never grows

// Titles unlocked by level. Lowest first.
const LEVEL_TITLES: { level: number; title: string }[] = [
  { level: 1, title: "Rookie" },
  { level: 3, title: "Rising Star" },
  { level: 5, title: "Pro" },
  { level: 8, title: "Veteran" },
  { level: 10, title: "Elite" },
  { level: 15, title: "Legend" },
  { level: 20, title: "Distinguished" },
  { level: 30, title: "Exemplary" },
  { level: 50, title: "Premier" },
];

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

const QUOTES = [
  "Small steps every day add up to big things.",
  "Progress, not perfection.",
  "One finished task beats ten half-started ones.",
  "Start with the smallest thing. Momentum does the rest.",
  "Done is a great feeling. Go get some.",
  "You don’t have to be fast. You just have to keep moving.",
  "Focus on the next step, not the whole staircase.",
];

/* ============================================================================
 * TYPES + HELPERS
 * ========================================================================== */

type Task = {
  id: number;
  particulars: string;
  details: string | null;
  priority: "normal" | "urgent";
  status: "pending" | "in_progress" | "paused" | "completed" | "cancelled";
  progress: number;
  estimated_minutes: number | null;
  due_date: string | null;
  completed_at: string | null;
  worked_seconds: number;
  running_since: string | null;
  segments: number;
  last_remark?: string | null;
};

type Segment = {
  id: number;
  start: string;
  end: string | null;
};

type Goals = {
  daily_tasks: number;
  weekly_tasks: number;
  daily_focus_minutes: number;
  is_manager_set: boolean;
  set_by_name: string | null;
};

type Kudos = {
  id: number;
  emoji: string;
  message: string;
  from_name: string | null;
  task_title: string | null;
  created_at: string;
  is_new: boolean;
};

type LeaderRow = {
  rank: number;
  name: string;
  tasks: number;
  is_you: boolean;
};

type Extras = {
  goals: Goals;
  kudos: Kudos[];
  unread_kudos: number;
  lifetime_completed?: number; // all-time finished tasks (pet growth)
  leaderboard: {
    opted_in: boolean;
    department: string | null;
    entries: LeaderRow[];
    your_rank: number | null;
  };
};

type Toast = { id: number; text: string };

// What we already celebrated, so the same win doesn't pop up twice.
type Celebrated = {
  badges: string[];
  goalDay: string;
  weekKey: string;
  streak: number;
};

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.message || "The request could not be completed.");
  return result;
}

const dateKey = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const fmtClock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const fmtShort = (seconds: number) => {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const fmtWhen = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const hourLabel = (hour: number) => {
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
};

function greeting(hour: number) {
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function titleFor(level: number) {
  let current = LEVEL_TITLES[0];
  for (const entry of LEVEL_TITLES) if (level >= entry.level) current = entry;
  return current;
}

function nextTitleFor(level: number) {
  return LEVEL_TITLES.find((entry) => entry.level > level) ?? null;
}

const CONFETTI_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

function Confetti({ burst }: { burst: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (burst === 0) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, [burst]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, index) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2.2 + Math.random() * 1.8,
        size: 6 + Math.random() * 6,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      })),
    [burst],
  );

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 !mt-0 overflow-hidden"
    >
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .confetti-piece { display: none; }
        }
      `}</style>
      {pieces.map((piece, index) => (
        <span
          className="confetti-piece absolute top-0 block rounded-sm"
          key={`${burst}-${index}`}
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size * 0.6,
            backgroundColor: piece.color,
            animation: `confetti-fall ${piece.duration}s ${piece.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

/* ============================================================================
 * SMALL PIECES
 * ========================================================================== */

function Ring({ value, goal }: { value: number; goal: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(1, goal > 0 ? value / goal : 0);
  const done = value >= goal;

  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          fill="none"
          r={radius}
          stroke="#e2e8f0"
          strokeWidth="9"
        />
        <circle
          className="transition-all duration-700"
          cx="50"
          cy="50"
          fill="none"
          r={radius}
          stroke={done ? "#10b981" : "#2563eb"}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          strokeLinecap="round"
          strokeWidth="9"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {done ? (
          <Trophy
            aria-hidden="true"
            className="h-7 w-7 animate-bounce text-emerald-500"
          />
        ) : (
          <span className="text-3xl font-bold tabular-nums text-slate-900">
            {value}
            <span className="text-lg font-semibold text-slate-400">
              /{goal}
            </span>
          </span>
        )}
        <span className="text-[11px] font-medium text-slate-500">
          {done ? `${value} done` : "tasks today"}
        </span>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  caption,
  icon: Icon,
  tone,
  accent,
}: {
  label: string;
  value: string;
  caption: string;
  icon: typeof Flame;
  tone: string;
  accent: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-t-4 border-slate-200 ${accent} bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{caption}</p>
        </div>
        <span className={`rounded-xl p-2.5 ${tone}`}>
          <Icon aria-hidden="true" size={20} />
        </span>
      </div>
    </div>
  );
}

function InsightTile({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  icon: typeof Flame;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <span className={`shrink-0 rounded-lg p-2 ${tone}`}>
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-lg font-bold tabular-nums leading-tight text-slate-900">
          {value}
        </p>
        <p className="truncate text-[11px] text-slate-500">{caption}</p>
      </div>
    </div>
  );
}

const GAME_EMOJIS = ["🚀", "⭐", "🔥", "🎯", "💡", "🏆"];

type MemCard = { id: number; emoji: string; matched: boolean; open: boolean };

function makeDeck(): MemCard[] {
  return [...GAME_EMOJIS, ...GAME_EMOJIS]
    .map((emoji) => ({ emoji, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((card, id) => ({
      id,
      emoji: card.emoji,
      matched: false,
      open: false,
    }));
}

function BreakGame() {
  const [cards, setCards] = useState<MemCard[]>([]);
  const [moves, setMoves] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);

  // Shuffle after mount, so server and browser HTML match.
  useEffect(() => {
    setCards(makeDeck());
  }, []);

  const won = cards.length > 0 && cards.every((card) => card.matched);

  useEffect(() => {
    if (won)
      setBest((current) =>
        current === null ? moves : Math.min(current, moves),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  const flip = (id: number) => {
    if (locked) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.open || card.matched) return;

    const next = cards.map((c) => (c.id === id ? { ...c, open: true } : c));
    setCards(next);

    const open = next.filter((c) => c.open && !c.matched);
    if (open.length < 2) return;

    setMoves((m) => m + 1);
    if (open[0].emoji === open[1].emoji) {
      setCards(next.map((c) => (c.open ? { ...c, matched: true } : c)));
    } else {
      setLocked(true);
      window.setTimeout(() => {
        setCards((current) =>
          current.map((c) => (c.matched ? c : { ...c, open: false })),
        );
        setLocked(false);
      }, 700);
    }
  };

  const reset = () => {
    setCards(makeDeck());
    setMoves(0);
    setLocked(false);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-amber-500" />
            Break time
          </h2>
          <p className="text-sm text-slate-500">
            All caught up. Match the pairs while you wait for new tasks.
          </p>
        </div>
        <div className="text-right text-xs tabular-nums text-slate-500">
          <p>Moves: {moves}</p>
          {best !== null && <p>Best: {best}</p>}
        </div>
      </div>

      <div className="mx-auto mt-4 grid max-w-xs grid-cols-4 gap-2">
        {cards.map((card) => (
          <button
            aria-label={card.open || card.matched ? card.emoji : "Hidden card"}
            className={`flex h-16 items-center justify-center rounded-xl text-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              card.matched
                ? "bg-emerald-50 ring-1 ring-emerald-200"
                : card.open
                  ? "bg-sky-50 ring-1 ring-sky-200"
                  : "bg-slate-100 hover:bg-slate-200"
            }`}
            key={card.id}
            onClick={() => flip(card.id)}
            type="button"
          >
            {card.open || card.matched ? card.emoji : ""}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        {won && (
          <p className="text-sm font-semibold text-emerald-700">
            Done in {moves} moves!
          </p>
        )}
        <button
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          onClick={reset}
          type="button"
        >
          {won ? "Play again" : "Restart"}
        </button>
      </div>
    </section>
  );
}

/* ============================================================================
 * PET
 * ========================================================================== */

const PET_SPECIES_KEY = "employee-dashboard-pet-species-v1";
const PET_STAGE_KEY = "employee-dashboard-pet-stage-v1";
const PET_XP_PER_TASK = 10;

// Stage 0 is the egg. Species icons below are for stages 1 to 4.
const PET_STAGES = [
  { name: "Egg", xp: 0 },
  { name: "Hatchling", xp: 50 },
  { name: "Young", xp: 150 },
  { name: "Grown", xp: 300 },
  { name: "Legend", xp: 600 },
];

// Images live in /public/pets. Emoji are the fallback if a file is missing.
const PET_SPECIES: Record<
  string,
  {
    label: string;
    icons: string[];
    images: string[];
    fly?: string; // stage 4 sprite sheet (optional)
    flyFrames?: number; // frames in that sheet (default 4)
    walk?: string; // walking sheet (optional)
  }
> = {
  bird: {
    label: "Bird",
    icons: ["🐣", "🐥", "🐤", "🦅"],
    images: [1, 2, 3, 4].map((n) => `/pets/bird/${n}.png`),
    fly: "/pets/bird/4-fly.png",
  },
  dragon: {
    label: "Dragon",
    icons: ["🦎", "🐊", "🐉", "🐲"],
    images: [1, 2, 3, 4].map((n) => `/pets/dragon/${n}.png`),
    fly: "/pets/dragon/4-fly.png",
  },
  cat: {
    label: "Cat",
    icons: ["🐱", "🐈", "😺", "🦁"],
    images: [1, 2, 3, 4].map((n) => `/pets/cat/${n}.png`),
    walk: "/pets/cat/4-walk.png",
  },
};
const PET_EGG_IMAGE = "/pets/egg.png";
const PET_EGG_CRACKING_IMAGE = "/pets/egg-cracking.png";
const PET_SPECIES_KEYS = Object.keys(PET_SPECIES);

// Shows the image; falls back to the emoji if the file is missing.
function PetImage({
  src,
  fallback,
  className,
}: {
  src: string;
  fallback: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block text-5xl ${className ?? ""}`}
      >
        {fallback}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      aria-hidden="true"
      className={`inline-block h-20 w-20 object-contain drop-shadow-md ${className ?? ""}`}
      onError={() => setFailed(true)}
      src={src}
    />
  );
}

// Sprite sheet na pahalang ang mga frame. Lumilipad habang nagpapagaspas.
function FlyingPet({
  sheet,
  frames = 4,
  size = 80,
}: {
  sheet: string;
  frames?: number;
  size?: number;
}) {
  return (
    <>
      <style>{`
        @keyframes pet-flap {
          from { background-position: 0 0; }
          to   { background-position: -${size * frames}px 0; }
        }
        @keyframes pet-float {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(8px, -6px); }
          50%      { transform: translate(0, -10px); }
          75%      { transform: translate(-8px, -5px); }
        }
        .pet-fly {
          animation:
            pet-flap 0.6s steps(${frames}) infinite,
            pet-float 4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .pet-fly { animation: none; }
        }
      `}</style>
      <div
        aria-hidden="true"
        className="pet-fly drop-shadow-md"
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${sheet})`,
          backgroundSize: `${size * frames}px ${size}px`,
          backgroundRepeat: "no-repeat",
        }}
      />
    </>
  );
}
function WalkingPet({
  sheet,
  frames = 4,
  size = 80,
}: {
  sheet: string;
  frames?: number;
  size?: number;
}) {
  return (
    <>
      <style>{`
        @keyframes pet-step { from { background-position: 0 0; } to { background-position: -${size * frames}px 0; } }
        @keyframes pet-pace {
          0%   { transform: translateX(-6px) scaleX(1); }
          45%  { transform: translateX(6px) scaleX(1); }
          50%  { transform: translateX(6px) scaleX(-1); }
          95%  { transform: translateX(-6px) scaleX(-1); }
          100% { transform: translateX(-6px) scaleX(1); }
        }
        .pet-pace { animation: pet-pace 6s linear infinite; }
        .pet-step { animation: pet-step 0.6s steps(${frames}) infinite; }
        @media (prefers-reduced-motion: reduce) { .pet-pace, .pet-step { animation: none; } }
      `}</style>
      <div className="pet-pace" aria-hidden="true">
        <div
          className="pet-step drop-shadow-md"
          style={{
            width: size,
            height: size,
            backgroundImage: `url(${sheet})`,
            backgroundSize: `${size * frames}px ${size}px`,
            backgroundRepeat: "no-repeat",
          }}
        />
      </div>
    </>
  );
}
function PetCard({
  xp,
  streak,
  todayActive,
  goalReached,
  onEvolve,
}: {
  xp: number;
  streak: number;
  todayActive: boolean;
  goalReached: boolean;
  onEvolve: (text: string) => void;
}) {
  const [species, setSpecies] = useState<string | null>(null);

  let stage = 0;
  PET_STAGES.forEach((entry, index) => {
    if (xp >= entry.xp) stage = index;
  });
  const next = PET_STAGES[stage + 1] ?? null;
  const isEgg = stage === 0;
  const cracking = isEgg && xp >= 40;

  // Load the saved species after mount (avoids server/browser mismatch).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PET_SPECIES_KEY);
      if (saved && PET_SPECIES[saved]) setSpecies(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // The egg hatches into a random species the first time.
  useEffect(() => {
    if (stage >= 1 && !species) {
      const pick =
        PET_SPECIES_KEYS[Math.floor(Math.random() * PET_SPECIES_KEYS.length)];
      setSpecies(pick);
      try {
        window.localStorage.setItem(PET_SPECIES_KEY, pick);
      } catch {
        /* ignore */
      }
    }
  }, [stage, species]);

  // Celebrate when the pet grows. First visit just remembers the stage.
  useEffect(() => {
    let saved: number | null = null;
    try {
      const raw = window.localStorage.getItem(PET_STAGE_KEY);
      saved = raw === null ? null : Number(raw);
    } catch {
      saved = null;
    }
    if (saved !== null && stage > saved) {
      onEvolve(
        stage === 1
          ? "🐣 Your egg hatched!"
          : `✨ Your pet grew into a ${PET_STAGES[stage].name}!`,
      );
    }
    if (saved === null || stage > saved) {
      try {
        window.localStorage.setItem(PET_STAGE_KEY, String(stage));
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const swapSpecies = () => {
    const current = species ?? PET_SPECIES_KEYS[0];
    const nextKey =
      PET_SPECIES_KEYS[
        (PET_SPECIES_KEYS.indexOf(current) + 1) % PET_SPECIES_KEYS.length
      ];
    setSpecies(nextKey);
    try {
      window.localStorage.setItem(PET_SPECIES_KEY, nextKey);
    } catch {
      /* ignore */
    }
  };

  const speciesKey = species ?? PET_SPECIES_KEYS[0];
  const current = PET_SPECIES[speciesKey];
  const faceEmoji = isEgg ? "🥚" : current.icons[stage - 1];

  // May flying sheet pa lang ang bird sa stage 4 (Legend).
  // Lilipad lang kapag masaya ang pet.
  const canFly =
    Boolean(current.fly) &&
    stage === 4 &&
    (goalReached || (todayActive && streak > 0));
  const canWalk =
    Boolean(current.walk) &&
    stage === 4 &&
    (goalReached || (todayActive && streak > 0));
  const faceSrc = isEgg
    ? cracking
      ? PET_EGG_CRACKING_IMAGE
      : PET_EGG_IMAGE
    : current.images[stage - 1];

  // Mood comes from the streak. It never dies, it only gets sleepy.
  const streakAtRisk = streak > 0 && !todayActive;
  let mood = "";
  let badge = "";
  let animation = "";
  if (cracking) animation = "pet-wobble";
  else if (goalReached) {
    mood = "Your pet is celebrating your goal!";
    badge = "🎉";
    animation = "pet-bounce";
  } else if (todayActive && streak > 0) {
    mood = "Happy. Your streak is safe today.";
    badge = "💖";
    animation = "pet-bounce";
  } else if (streakAtRisk) {
    mood = "Sleepy. Finish a task to wake it up.";
    badge = "💤";
  } else if (!isEgg) {
    mood = "Waiting for you. One task and it perks up.";
  }
  if (isEgg) {
    mood = cracking
      ? "It’s shaking. It’s about to hatch!"
      : "Finish tasks to keep the egg warm.";
  }

  const tasksToNext = next ? Math.ceil((next.xp - xp) / PET_XP_PER_TASK) : 0;
  const stageStart = PET_STAGES[stage].xp;
  const ratio = next
    ? Math.min(1, (xp - stageStart) / (next.xp - stageStart))
    : 1;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <style>{`
        @keyframes pet-wobble {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(-12deg); }
          40% { transform: rotate(10deg); }
          60% { transform: rotate(-8deg); }
          80% { transform: rotate(6deg); }
        }
        @keyframes pet-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .pet-wobble { animation: pet-wobble 0.9s ease-in-out infinite; }
        .pet-bounce { animation: pet-bounce 1.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .pet-wobble, .pet-bounce { animation: none; }
        }
      `}</style>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Your pet</h2>
          <p className="text-sm text-slate-500">
            {isEgg ? "Egg" : `${current.label} · ${PET_STAGES[stage].name}`}
          </p>
        </div>
        {!isEgg && (
          <button
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={swapSpecies}
            type="button"
          >
            Swap
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-sky-50 ring-1 ring-sky-100">
          {canFly ? (
            <FlyingPet sheet={current.fly!} frames={current.flyFrames} />
          ) : canWalk ? (
            <WalkingPet sheet={current.walk!} />
          ) : (
            <PetImage
              className={animation}
              fallback={faceEmoji}
              src={faceSrc}
            />
          )}
          {badge && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 text-lg"
            >
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{mood}</p>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium text-slate-700">
            {next
              ? `To ${next.name === "Hatchling" ? "hatch" : next.name}`
              : "Max level"}
          </span>
          <span className="tabular-nums text-slate-500">
            {next
              ? `${plural(tasksToNext, "task", "tasks")} to go`
              : "Fully grown"}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-700"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * DASHBOARD
 * ========================================================================== */

export default function EmployeeDashboard({
  showAccountPanel = true,
}: {
  showAccountPanel?: boolean;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [daySegments, setDaySegments] = useState<
    { key: string; label: string; segments: Segment[] }[]
  >([]);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [freshKudos, setFreshKudos] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [startError, setStartError] = useState("");
  const [startingId, setStartingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [badgePage, setBadgePage] = useState(0);
  const [badgeFilter, setBadgeFilter] = useState<"all" | "unlocked" | "locked">(
    "all",
  );
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({
    daily: "",
    weekly: "",
    focus: "",
  });
  const [goalError, setGoalError] = useState("");
  const [savingGoals, setSavingGoals] = useState(false);
  const [boardBusy, setBoardBusy] = useState(false);
  const [offset, setOffset] = useState(0); // server clock minus browser clock
  const [, setTick] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [burst, setBurst] = useState(0); // +1 = fire confetti
  const announcedKudos = useRef(false);
  const [kudosPopup, setKudosPopup] = useState<Kudos[]>([]);
  const [kudosIndex, setKudosIndex] = useState(0);

  const pushToasts = useCallback((texts: string[]) => {
    const stamp = Date.now();
    const shown = texts.map((text, index) => ({
      id: stamp + index + Math.random(),
      text,
    }));
    setToasts((current) => [...current, ...shown]);
    for (const toast of shown) {
      window.setTimeout(
        () => setToasts((current) => current.filter((t) => t.id !== toast.id)),
        6000,
      );
    }
  }, []);

  // Pet grew: toast + confetti.
  const handleEvolve = useCallback(
    (text: string) => {
      pushToasts([text]);
      setBurst((n) => n + 1);
    },
    [pushToasts],
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setError("");

      const today = new Date();
      const days = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(today);
        day.setDate(day.getDate() - (6 - index));
        return {
          key: dateKey(day),
          label: day.toLocaleDateString("en-US", { weekday: "short" }),
        };
      });

      const [taskResult, extrasResult, ...timelines] = await Promise.all([
        adminFetch("/api/admin/my-tasks?with_completed=1", {
          cache: "no-store",
        }).then(readJson),
        // Optional: a failure here must never break the dashboard.
        adminFetch("/api/admin/my-tasks/extras", { cache: "no-store" })
          .then(readJson)
          .catch(() => null),
        ...days.map((day) =>
          adminFetch(`/api/admin/my-tasks/timeline?date=${day.key}`, {
            cache: "no-store",
          }).then(readJson),
        ),
      ]);

      const extrasData = (extrasResult?.data ?? null) as Extras | null;

      setOffset(Date.parse(taskResult.server_now) - Date.now());
      setTasks(taskResult.data as Task[]);
      setExtras(extrasData);
      setDaySegments(
        days.map((day, index) => ({
          ...day,
          segments: (timelines[index]?.data ?? []) as Segment[],
        })),
      );

      // New kudos: celebrate once, then mark them as read.
      if (
        extrasData &&
        extrasData.unread_kudos > 0 &&
        !announcedKudos.current
      ) {
        announcedKudos.current = true;
        const fresh = extrasData.kudos.filter((kudos) => kudos.is_new);
        setFreshKudos(fresh.map((kudos) => kudos.id));
        setKudosPopup(fresh);
        setKudosIndex(0);
        setBurst((n) => n + 1);
        void adminFetch("/api/admin/my-tasks/kudos/read", {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: "{}",
        }).catch(() => undefined);
      }
    } catch (failure) {
      setTasks((current) => current ?? []);
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to load your dashboard.",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currentKudos = kudosPopup[kudosIndex] ?? null;
  const closeKudos = useCallback(() => {
    if (kudosIndex < kudosPopup.length - 1) {
      setKudosIndex((i) => i + 1);
    } else {
      setKudosPopup([]);
      setKudosIndex(0);
    }
  }, [kudosIndex, kudosPopup.length]);

  useEffect(() => {
    if (!currentKudos) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeKudos();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentKudos, closeKudos]);

  // Tick every second for the live timer; resync every minute and when the
  // tab comes back into view.
  useEffect(() => {
    const clock = window.setInterval(() => setTick((n) => n + 1), 1000);
    const sync = window.setInterval(() => void load(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // First name for the greeting. Optional: falls back to no name.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await readJson(
          await adminFetch("/api/admin/session", { cache: "no-store" }),
        );
        if (!active) return;
        const raw =
          session?.name ??
          session?.user?.name ??
          session?.employee_name ??
          session?.employee?.first_name ??
          "";
        setName(String(raw).trim().split(/\s+/)[0] ?? "");
      } catch {
        /* greeting works without a name */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /* ── actions ── */

  // Start a pending task, resume a paused one, or switch to it.
  const startTask = async (id: number) => {
    setStartingId(id);
    setStartError("");
    try {
      await readJson(
        await adminFetch(`/api/admin/my-tasks/${id}/start`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: "{}",
        }),
      );
      await load();
    } catch (failure) {
      setStartError(
        failure instanceof Error
          ? failure.message
          : "Unable to start the task.",
      );
    } finally {
      setStartingId(null);
    }
  };

  const openGoalEditor = () => {
    const goals = extras?.goals;
    setGoalForm({
      daily: String(goals?.daily_tasks ?? DEFAULT_DAILY_GOAL),
      weekly: String(goals?.weekly_tasks ?? DEFAULT_WEEKLY_GOAL),
      focus: String(goals?.daily_focus_minutes ?? DEFAULT_FOCUS_MINUTES),
    });
    setGoalError("");
    setGoalsOpen(true);
  };

  const saveGoals = async () => {
    setSavingGoals(true);
    setGoalError("");
    try {
      await readJson(
        await adminFetch("/api/admin/my-tasks/goals", {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            daily_tasks: Number(goalForm.daily),
            weekly_tasks: Number(goalForm.weekly),
            daily_focus_minutes: Number(goalForm.focus),
          }),
        }),
      );
      setGoalsOpen(false);
      await load();
    } catch (failure) {
      setGoalError(
        failure instanceof Error ? failure.message : "Unable to save targets.",
      );
    } finally {
      setSavingGoals(false);
    }
  };

  const setLeaderboard = async (optIn: boolean) => {
    setBoardBusy(true);
    try {
      await readJson(
        await adminFetch("/api/admin/my-tasks/leaderboard", {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ opt_in: optIn }),
        }),
      );
      await load();
    } catch {
      /* the button simply stays as it was */
    } finally {
      setBoardBusy(false);
    }
  };

  /* ── derived ── */

  const dailyGoal = extras?.goals.daily_tasks ?? DEFAULT_DAILY_GOAL;
  const weeklyGoal = extras?.goals.weekly_tasks ?? DEFAULT_WEEKLY_GOAL;
  const focusGoalMinutes =
    extras?.goals.daily_focus_minutes ?? DEFAULT_FOCUS_MINUTES;

  const nowMs = Date.now() + offset;
  const now = new Date(nowMs);
  const todayKey = dateKey(now);

  const running = tasks?.find((task) => task.status === "in_progress");
  const completed = useMemo(
    () => (tasks ?? []).filter((task) => task.status === "completed"),
    [tasks],
  );

  const todo = useMemo(
    () =>
      (tasks ?? [])
        .filter((task) => task.status === "paused" || task.status === "pending")
        .sort((a, b) => {
          if (a.priority !== b.priority)
            return a.priority === "urgent" ? -1 : 1;
          const aDue = a.due_date ? a.due_date.slice(0, 10) : "9999-12-31";
          const bDue = b.due_date ? b.due_date.slice(0, 10) : "9999-12-31";
          if (aDue !== bDue) return aDue < bDue ? -1 : 1;
          return a.id - b.id;
        }),
    [tasks],
  );

  const liveSeconds = (task: Task) =>
    task.worked_seconds +
    (task.running_since
      ? Math.max(0, (nowMs - Date.parse(task.running_since)) / 1000)
      : 0);

  // Completed tasks per local day.
  const completedByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of completed) {
      if (!task.completed_at) continue;
      const key = dateKey(new Date(task.completed_at));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [completed]);

  // Focus seconds per day (last 7), clipped to each day. Open logs run to now.
  const focusDays = daySegments.map((day) => {
    const from = new Date(`${day.key}T00:00:00`).getTime();
    const to = from + 24 * 3_600_000;
    const seconds = day.segments.reduce((sum, segment) => {
      const start = Math.max(Date.parse(segment.start), from);
      const end = Math.min(segment.end ? Date.parse(segment.end) : nowMs, to);
      return sum + Math.max(0, end - start) / 1000;
    }, 0);
    return {
      key: day.key,
      label: day.key === todayKey ? "Today" : day.label,
      seconds,
      done: completedByDay.get(day.key) ?? 0,
    };
  });

  const focusToday =
    focusDays.find((day) => day.key === todayKey)?.seconds ?? 0;
  const focusWeek = focusDays.reduce((sum, day) => sum + day.seconds, 0);
  const doneToday = completedByDay.get(todayKey) ?? 0;
  const doneWeek = focusDays.reduce((sum, day) => sum + day.done, 0);
  const focusGoalRatio = Math.min(
    1,
    focusGoalMinutes > 0 ? focusToday / 60 / focusGoalMinutes : 0,
  );
  const focusGoalReached = focusToday / 60 >= focusGoalMinutes;

  // Week at a glance (Monday to Sunday).
  const weekStart = startOfDay(now);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekKey = dateKey(weekStart);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + index);
    const key = dateKey(day);
    return {
      key,
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      done: completedByDay.get(key) ?? 0,
      seconds: focusDays.find((f) => f.key === key)?.seconds ?? 0,
      isToday: key === todayKey,
      isFuture: key > todayKey,
    };
  });
  const weekDone = weekDays.reduce((sum, day) => sum + day.done, 0);
  const weeklyLeft = Math.max(0, weeklyGoal - weekDone);
  const daysLeft = weekDays.filter((day) => day.key >= todayKey).length;
  const weeklyMessage =
    weeklyLeft === 0
      ? "Weekly goal reached. Everything else is a bonus."
      : `${weeklyLeft} to go. About ${Math.ceil(weeklyLeft / daysLeft)} a day for the rest of the week.`;

  // This week vs the same days last week.
  const todayIndex = weekDays.findIndex((day) => day.isToday);
  const lastWeekSoFar = Array.from({ length: todayIndex + 1 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() - 7 + index);
    return completedByDay.get(dateKey(day)) ?? 0;
  }).reduce((sum, n) => sum + n, 0);
  const weekDiff = weekDone - lastWeekSoFar;

  // Last week recap (shown on Monday and Tuesday).
  const lastWeekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() - 7 + index);
    const key = dateKey(day);
    return {
      key,
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      done: completedByDay.get(key) ?? 0,
    };
  });
  const lastWeekTotal = lastWeekDays.reduce((sum, day) => sum + day.done, 0);
  const lastWeekBest = lastWeekDays.reduce(
    (best, day) => (day.done > best.done ? day : best),
    lastWeekDays[0],
  );
  const lastWeekGoalDays = lastWeekDays.filter(
    (day) => day.done >= dailyGoal,
  ).length;
  const showRecap =
    (now.getDay() === 1 || now.getDay() === 2) && lastWeekTotal > 0;

  // Personal best: best day before today, over the last 30 days.
  const bestBefore = Math.max(
    0,
    ...Array.from(completedByDay.entries())
      .filter(([key]) => key !== todayKey)
      .map(([, count]) => count),
  );
  const recordMessage =
    doneToday > 0 && doneToday > bestBefore
      ? `New personal best! ${plural(doneToday, "task", "tasks")} today${bestBefore > 0 ? ` (old record: ${bestBefore})` : ""}.`
      : bestBefore === 0
        ? "Finish a task today to set your first record."
        : `Your best day: ${bestBefore}. Today: ${doneToday}. ${bestBefore + 1 - doneToday} more to beat it.`;
  const recordRatio =
    bestBefore > 0
      ? Math.min(1, doneToday / (bestBefore + 1))
      : doneToday > 0
        ? 1
        : 0;
  const { streak, freezesUsed } = useMemo(() => {
    const active = new Set<string>();
    completedByDay.forEach((_, key) => active.add(key));
    for (const day of focusDays) if (day.seconds >= 60) active.add(day.key);

    const cursor = startOfDay(new Date(nowMs));
    if (!active.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);

    let count = 0;
    let freezes = 0;
    let lastFreezeStep = -99;
    for (let step = 0; step < 60; step += 1) {
      if (active.has(dateKey(cursor))) {
        count += 1;
      } else {
        const older = new Date(cursor);
        older.setDate(older.getDate() - 1);
        const canFreeze =
          count > 0 && active.has(dateKey(older)) && step - lastFreezeStep > 7;
        if (!canFreeze) break;
        freezes += 1;
        lastFreezeStep = step;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return { streak: count, freezesUsed: freezes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedByDay, daySegments, todayKey]);

  // The streak only counts today once a task is done or focus is tracked.
  const todayActive = doneToday > 0 || focusToday >= 60;
  const streakAtRisk = streak > 0 && !todayActive;

  // XP and level from the last 30 days of real work.
  const urgentDone = completed.filter((t) => t.priority === "urgent").length;
  const onTimeDone = completed.filter(
    (t) =>
      t.due_date &&
      t.completed_at &&
      dateKey(new Date(t.completed_at)) <= t.due_date.slice(0, 10),
  ).length;
  const xp =
    completed.length * 10 +
    urgentDone * 5 +
    onTimeDone * 5 +
    Math.floor(focusWeek / 3600) * 3;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelProgress = ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100;
  const levelTitle = titleFor(level);
  const nextTitle = nextTitleFor(level);

  // Pet XP: lifetime from the server, so the pet never shrinks.
  // Falls back to the 30-day count if /extras has no lifetime field yet.
  const petXp =
    (extras?.lifetime_completed ?? completed.length) * PET_XP_PER_TASK;

  // Extra numbers for the badges (all from the last 30 days of real tasks).
  const bestDay = Math.max(0, ...Array.from(completedByDay.values()));
  const bestFocusSeconds = Math.max(0, ...focusDays.map((day) => day.seconds));
  const bestFocusHours = bestFocusSeconds / 3600;
  const hourOf = (task: Task) =>
    task.completed_at ? new Date(task.completed_at).getHours() : -1;
  const earlyBirdDone = completed.filter(
    (t) => hourOf(t) >= 0 && hourOf(t) < 9,
  ).length;
  const nightOwlDone = completed.filter((t) => hourOf(t) >= 20).length;
  // "Completed" is the automatic remark, so it doesn't count as a note.
  const withNotes = completed.filter(
    (t) => t.last_remark && t.last_remark !== "Completed",
  ).length;

  // Insights: on-time rate, estimate accuracy, peak hour.
  const dueCompleted = completed.filter(
    (t) => t.due_date && t.completed_at,
  ).length;
  const onTimeRate =
    dueCompleted > 0 ? Math.round((onTimeDone / dueCompleted) * 100) : null;

  const estimated = completed.filter(
    (t) => t.estimated_minutes && t.worked_seconds > 0,
  );
  const withinEstimate = estimated.filter(
    (t) => t.worked_seconds <= (t.estimated_minutes ?? 0) * 60 * 1.1,
  ).length;
  const estimateRate =
    estimated.length > 0
      ? Math.round((withinEstimate / estimated.length) * 100)
      : null;

  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const task of completed) {
    const hour = hourOf(task);
    if (hour >= 0) hourCounts[hour] += 1;
  }
  const peakCount = Math.max(0, ...hourCounts);
  const peakHour = peakCount > 0 ? hourCounts.indexOf(peakCount) : -1;
  const peakShare =
    completed.length > 0 ? Math.round((peakCount / completed.length) * 100) : 0;

  // 30-day heatmap, one column per week (Monday to Sunday).
  const heatStart = startOfDay(now);
  heatStart.setDate(heatStart.getDate() - 29);
  const heatOffset = (heatStart.getDay() + 6) % 7;
  const heatGridStart = new Date(heatStart);
  heatGridStart.setDate(heatGridStart.getDate() - heatOffset);
  const heatCutoff = dateKey(heatStart);
  const heatWeeks = Math.ceil((heatOffset + 30) / 7);
  const heatCells = Array.from({ length: heatWeeks * 7 }, (_, index) => {
    const day = new Date(heatGridStart);
    day.setDate(day.getDate() + index);
    const key = dateKey(day);
    return {
      key,
      count: completedByDay.get(key) ?? 0,
      hidden: key < heatCutoff || key > todayKey,
      label: day.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    };
  });
  const heatTotal = heatCells.reduce(
    (sum, cell) => sum + (cell.hidden ? 0 : cell.count),
    0,
  );
  const heatActiveDays = heatCells.filter(
    (cell) => !cell.hidden && cell.count > 0,
  ).length;
  const heatClass = (count: number) =>
    count >= dailyGoal * 2
      ? "bg-emerald-800 text-white"
      : count >= dailyGoal
        ? "bg-emerald-600 text-white"
        : count >= Math.ceil(dailyGoal / 2)
          ? "bg-emerald-400 text-emerald-950"
          : count > 0
            ? "bg-emerald-200 text-emerald-900"
            : "bg-slate-100 text-transparent";

  // Deadlines: overdue first, then due today.
  const openTasks = [...(running ? [running] : []), ...todo];
  const dueOf = (task: Task) =>
    task.due_date ? task.due_date.slice(0, 10) : null;
  const overdueTasks = openTasks
    .filter((task) => {
      const due = dueOf(task);
      return due !== null && due < todayKey;
    })
    .sort((a, b) => (dueOf(a) ?? "").localeCompare(dueOf(b) ?? ""));
  const dueTodayTasks = openTasks.filter((task) => dueOf(task) === todayKey);
  const deadlineList = [...overdueTasks, ...dueTodayTasks].slice(0, 5);
  const deadlineTotal = overdueTasks.length + dueTodayTasks.length;
  const daysLate = (task: Task) => {
    const due = dueOf(task);
    if (!due) return 0;
    return Math.round((Date.parse(todayKey) - Date.parse(due)) / 86_400_000);
  };

  type Badge = {
    key: string;
    label: string;
    hint: string;
    icon: typeof Flame;
    current: number;
    target: number;
  };

  // Tiered goals, so there is always something bigger to aim for.
  const badges: Badge[] = [
    // Tasks finished (last 30 days)
    {
      key: "first",
      label: "First win",
      hint: "Finish a task",
      icon: CheckCircle2,
      current: completed.length,
      target: 1,
    },
    {
      key: "five",
      label: "High five",
      hint: "Finish 5 tasks",
      icon: Award,
      current: completed.length,
      target: 5,
    },
    {
      key: "ten",
      label: "Double digits",
      hint: "Finish 10 tasks",
      icon: Star,
      current: completed.length,
      target: 10,
    },
    {
      key: "twentyfive",
      label: "Task master",
      hint: "Finish 25 tasks",
      icon: Medal,
      current: completed.length,
      target: 25,
    },
    {
      key: "fifty",
      label: "Powerhouse",
      hint: "Finish 50 tasks",
      icon: Zap,
      current: completed.length,
      target: 50,
    },
    {
      key: "hundred",
      label: "Legend",
      hint: "Finish 100 tasks",
      icon: Crown,
      current: completed.length,
      target: 100,
    },

    // Best single day
    {
      key: "day5",
      label: "Big day",
      hint: "Finish 5 tasks in one day",
      icon: TrendingUp,
      current: bestDay,
      target: 5,
    },
    {
      key: "day10",
      label: "Overdrive",
      hint: "Finish 10 tasks in one day",
      icon: Rocket,
      current: bestDay,
      target: 10,
    },
    {
      key: "day15",
      label: "Unstoppable",
      hint: "Finish 15 tasks in one day",
      icon: Gem,
      current: bestDay,
      target: 15,
    },

    // Streaks
    {
      key: "streak3",
      label: "On a roll",
      hint: "3-day streak",
      icon: Flame,
      current: streak,
      target: 3,
    },
    {
      key: "streak7",
      label: "Week warrior",
      hint: "7-day streak",
      icon: Flame,
      current: streak,
      target: 7,
    },
    {
      key: "streak14",
      label: "Two weeks strong",
      hint: "14-day streak",
      icon: Flame,
      current: streak,
      target: 14,
    },
    {
      key: "streak30",
      label: "Habit machine",
      hint: "30-day streak",
      icon: Flame,
      current: streak,
      target: 30,
    },

    // Focus time
    {
      key: "focus4",
      label: "Deep focus",
      hint: "4 hours tracked in a day",
      icon: Clock3,
      current: bestFocusHours,
      target: 4,
    },
    {
      key: "focus6",
      label: "Marathoner",
      hint: "6 hours tracked in a day",
      icon: Timer,
      current: bestFocusHours,
      target: 6,
    },
    {
      key: "week20",
      label: "Weekly grind",
      hint: "20 hours tracked in 7 days",
      icon: Clock3,
      current: focusWeek / 3600,
      target: 20,
    },
    {
      key: "focusgoal",
      label: "Goal getter",
      hint: "Hit your daily focus goal",
      icon: Gauge,
      current: bestFocusSeconds / 60,
      target: focusGoalMinutes,
    },

    // Urgent + deadlines
    {
      key: "urgent1",
      label: "Fire fighter",
      hint: "Finish an urgent task",
      icon: AlertTriangle,
      current: urgentDone,
      target: 1,
    },
    {
      key: "urgent5",
      label: "Crisis crusher",
      hint: "Finish 5 urgent tasks",
      icon: AlertTriangle,
      current: urgentDone,
      target: 5,
    },
    {
      key: "ontime1",
      label: "Right on time",
      hint: "Finish before the due date",
      icon: Target,
      current: onTimeDone,
      target: 1,
    },
    {
      key: "ontime5",
      label: "Deadline pro",
      hint: "Finish 5 tasks on time",
      icon: Target,
      current: onTimeDone,
      target: 5,
    },
    {
      key: "neverlate",
      label: "Never late",
      hint: "90% on time (5+ deadlines)",
      icon: CalendarClock,
      current: dueCompleted >= 5 ? (onTimeRate ?? 0) : 0,
      target: 90,
    },

    // Habits
    {
      key: "early",
      label: "Early bird",
      hint: "Finish a task before 9 AM",
      icon: Sunrise,
      current: earlyBirdDone,
      target: 1,
    },
    {
      key: "night",
      label: "Night owl",
      hint: "Finish a task after 8 PM",
      icon: Moon,
      current: nightOwlDone,
      target: 1,
    },
    {
      key: "notes",
      label: "Storyteller",
      hint: "Add notes to 5 finished tasks",
      icon: MessageSquareText,
      current: withNotes,
      target: 5,
    },
    {
      key: "kudos",
      label: "Appreciated",
      hint: "Receive kudos from a manager",
      icon: Heart,
      current: extras?.kudos.length ?? 0,
      target: 1,
    },

    // Levels
    {
      key: "level3",
      label: "Rising star",
      hint: "Reach level 3",
      icon: Star,
      current: level,
      target: 3,
    },
    {
      key: "level5",
      label: "Pro",
      hint: "Reach level 5",
      icon: Medal,
      current: level,
      target: 5,
    },
    {
      key: "level10",
      label: "Elite",
      hint: "Reach level 10",
      icon: Crown,
      current: level,
      target: 10,
    },
  ];
  const isUnlocked = (badge: Badge) => badge.current >= badge.target;
  const unlockedCount = badges.filter(isUnlocked).length;

  // Celebrate new wins. What was already celebrated is remembered in this
  // browser, so a win you get on My Tasks still pops up when you open the
  // dashboard, and a refresh never repeats it.
  const unlockedSig = badges
    .filter(isUnlocked)
    .map((badge) => badge.key)
    .join(",");
  const streakMilestone = STREAK_MILESTONES.find((m) => streak >= m) ?? 0;

  useEffect(() => {
    if (tasks === null || error) return;

    const unlocked = unlockedSig ? unlockedSig.split(",") : [];
    const goalHit = doneToday >= dailyGoal;
    const weekHit = weekDone >= weeklyGoal;

    let saved: Celebrated | null = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(CELEBRATED_KEY) ?? "null");
    } catch {
      saved = null;
    }

    const next: Celebrated = {
      badges: unlocked,
      goalDay: goalHit ? todayKey : (saved?.goalDay ?? ""),
      weekKey: weekHit ? weekKey : (saved?.weekKey ?? ""),
      streak: streakMilestone,
    };
    try {
      window.localStorage.setItem(CELEBRATED_KEY, JSON.stringify(next));
    } catch {
      /* private mode: just skip remembering */
    }

    // First ever visit: remember what exists, don't celebrate old stuff.
    if (!saved) return;

    const wins: { text: string; big: boolean }[] = [];
    for (const key of unlocked) {
      if (saved.badges?.includes(key)) continue;
      const badge = badges.find((b) => b.key === key);
      if (badge)
        wins.push({ text: `🏅 Badge unlocked: ${badge.label}`, big: false });
    }
    if (goalHit && saved.goalDay !== todayKey)
      wins.push({
        text: `🎯 Daily goal reached: ${dailyGoal} tasks!`,
        big: true,
      });
    if (weekHit && saved.weekKey !== weekKey)
      wins.push({
        text: `🏆 Weekly goal reached: ${weeklyGoal} tasks!`,
        big: true,
      });
    if (streakMilestone > (saved.streak ?? 0))
      wins.push({ text: `🔥 ${streakMilestone}-day streak!`, big: true });

    if (wins.length === 0) return;

    pushToasts(wins.slice(0, 4).map((win) => win.text));
    if (wins.some((win) => win.big)) setBurst((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tasks,
    error,
    unlockedSig,
    doneToday,
    weekDone,
    dailyGoal,
    weeklyGoal,
    streakMilestone,
    todayKey,
    weekKey,
  ]);

  // Unlocked first, then the locked ones closest to being earned.
  const sortedBadges = [
    ...badges.filter(isUnlocked),
    ...badges
      .filter((badge) => !isUnlocked(badge))
      .sort((a, b) => b.current / b.target - a.current / a.target),
  ];
  const filteredBadges = sortedBadges.filter((badge) =>
    badgeFilter === "all"
      ? true
      : badgeFilter === "unlocked"
        ? isUnlocked(badge)
        : !isUnlocked(badge),
  );
  const badgePages = Math.max(
    1,
    Math.ceil(filteredBadges.length / BADGES_PER_PAGE),
  );
  const safePage = Math.min(badgePage, badgePages - 1);
  const visibleBadges = filteredBadges.slice(
    safePage * BADGES_PER_PAGE,
    safePage * BADGES_PER_PAGE + BADGES_PER_PAGE,
  );

  const recentWins = [...completed]
    .sort(
      (a, b) =>
        Date.parse(b.completed_at ?? "0") - Date.parse(a.completed_at ?? "0"),
    )
    .slice(0, 5);

  const goalReached = doneToday >= dailyGoal;
  const quote =
    QUOTES[
      Math.floor(
        (startOfDay(now).getTime() -
          new Date(now.getFullYear(), 0, 0).getTime()) /
          86_400_000,
      ) % QUOTES.length
    ];

  let message = "";
  if (tasks === null) message = "Getting your day ready…";
  else if (goalReached)
    message = `Goal smashed. ${plural(doneToday, "task", "tasks")} done today. You earned a breather.`;
  else if (running)
    message = "You’re in the zone. Keep going, every minute counts.";
  else if (doneToday > 0)
    message = `${plural(doneToday, "task", "tasks")} done today. ${dailyGoal - doneToday} more to hit your goal.`;
  else if (todo.length > 0)
    message = "Pick one task and start the timer. Momentum builds fast.";
  else message = "You’re all caught up. Enjoy it, you’ve earned it.";

  const startButton = (task: Task) => (
    <button
      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
      disabled={startingId !== null}
      onClick={() => void startTask(task.id)}
      type="button"
    >
      <Play aria-hidden="true" className="h-3 w-3" />
      {startingId === task.id
        ? "…"
        : running
          ? "Switch"
          : task.status === "paused"
            ? "Resume"
            : "Start"}
    </button>
  );

  const goalsLocked = extras?.goals.is_manager_set === true;

  /* ── render ── */

  return (
    <div className="space-y-6 pb-8">
      <header className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-r from-sky-600 to-indigo-600 px-6 py-8 text-white shadow-lg sm:px-9">
        <div className="absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              My dashboard
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
              {greeting(now.getHours())}
              {name ? `, ${name}` : ""}!
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/90 sm:text-base">
              {message}
            </p>
            <p className="mt-1 text-xs italic text-white/70">“{quote}”</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
              disabled={refreshing}
              onClick={() => void load()}
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={refreshing ? "animate-spin" : ""}
                size={16}
              />
              Refresh
            </button>
            <div className="w-52 rounded-xl bg-white/15 px-3 py-2 ring-1 ring-white/20">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1">
                  <Zap aria-hidden="true" className="h-3.5 w-3.5" />
                  Level {level} · {levelTitle.title}
                </span>
                <span className="tabular-nums">{xp} XP</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700"
                  style={{ width: `${levelProgress}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-white/80">
                {XP_PER_LEVEL - (xp % XP_PER_LEVEL)} XP to level {level + 1}
              </p>
              {nextTitle && (
                <p className="text-[11px] text-white/70">
                  Next title: {nextTitle.title} (level {nextTitle.level})
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Announcements: fetch only, employees cannot post */}
      <AnnouncementPanel />

      {error && (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {startError && (
        <p
          className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {startError}
        </p>
      )}

      {tasks === null ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="h-28 animate-pulse rounded-2xl bg-slate-100"
              key={index}
            />
          ))}
        </div>
      ) : (
        <>
          {/* Streak at risk */}
          {streakAtRisk && (
            <div className="flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              <Flame
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-orange-500"
              />
              <p>
                <span className="font-semibold">
                  Your {streak}-day streak is at risk.
                </span>{" "}
                Finish a task or track some focus time today to keep it alive.
              </p>
            </div>
          )}

          {/* Last week recap (Mon / Tue) */}
          {showRecap && (
            <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 ring-1 ring-indigo-100">
              <h2 className="flex items-center gap-2 text-base font-semibold text-indigo-900">
                <CalendarDays aria-hidden="true" className="h-4 w-4" />
                Last week recap
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-2xl font-bold tabular-nums text-indigo-950">
                    {lastWeekTotal}
                  </p>
                  <p className="text-xs text-indigo-800">
                    tasks finished ({weeklyGoal} goal)
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-indigo-950">
                    {lastWeekBest.done}
                  </p>
                  <p className="text-xs text-indigo-800">
                    best day ({lastWeekBest.label})
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-indigo-950">
                    {lastWeekGoalDays}
                  </p>
                  <p className="text-xs text-indigo-800">
                    days you hit the daily goal
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-indigo-950">
                    {lastWeekTotal >= weeklyGoal ? "Goal hit" : "Next one"}
                  </p>
                  <p className="text-xs text-indigo-800">
                    {lastWeekTotal >= weeklyGoal
                      ? "You beat the weekly target."
                      : `${weeklyGoal - lastWeekTotal} short. Fresh week, fresh start.`}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Stat tiles */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              accent="border-t-emerald-500"
              caption={`${plural(doneWeek, "task", "tasks")} in the last 7 days`}
              icon={CheckCircle2}
              label="Done today"
              tone="bg-emerald-50 text-emerald-700"
              value={String(doneToday)}
            />
            <StatTile
              accent="border-t-blue-500"
              caption={`${fmtShort(focusWeek)} in the last 7 days`}
              icon={Clock3}
              label="Focus time today"
              tone="bg-blue-50 text-blue-700"
              value={fmtShort(focusToday)}
            />
            <StatTile
              accent="border-t-orange-500"
              caption={
                streak === 0
                  ? "Finish a task to start one"
                  : freezesUsed > 0
                    ? `❄ Freeze saved your streak (${freezesUsed} used)`
                    : todayActive
                      ? "Safe for today. Nice!"
                      : "Keep it alive today!"
              }
              icon={freezesUsed > 0 ? Snowflake : Flame}
              label="Day streak"
              tone="bg-orange-50 text-orange-600"
              value={String(streak)}
            />
            <StatTile
              accent="border-t-violet-500"
              caption={running ? "1 running now" : "Nothing running right now"}
              icon={ListChecks}
              label="Open tasks"
              tone="bg-violet-50 text-violet-700"
              value={String(todo.length + (running ? 1 : 0))}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Focus + deadlines + up next */}
            <div className="space-y-5 lg:col-span-2">
              {running ? (
                <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm ring-1 ring-emerald-100">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    Working on
                  </span>
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-slate-900">
                        <span className="text-slate-400">#{running.id}</span>{" "}
                        {running.particulars}
                      </h2>
                      {running.last_remark && (
                        <p className="mt-0.5 text-xs italic text-slate-500">
                          Latest: “{running.last_remark}”
                        </p>
                      )}
                    </div>
                    <p className="text-3xl font-bold tabular-nums text-slate-900">
                      {fmtClock(liveSeconds(running))}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${running.progress}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-sm tabular-nums text-slate-500">
                      {running.progress}%
                    </span>
                  </div>
                  <Link
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
                    href={MY_TASKS_HREF}
                  >
                    Open My Tasks{" "}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </section>
              ) : (
                <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="rounded-xl bg-sky-50 p-3 text-sky-600">
                        <Rocket aria-hidden="true" className="h-6 w-6" />
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">
                          Ready when you are
                        </p>
                        <p className="text-sm text-slate-500">
                          {todo.length > 0
                            ? "No timer running. Pick a task and go."
                            : "You have no open tasks right now."}
                        </p>
                      </div>
                    </div>
                    <Link
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      href={MY_TASKS_HREF}
                    >
                      <Play aria-hidden="true" className="h-4 w-4" />
                      {todo.length > 0 ? "Start a task" : "Open My Tasks"}
                    </Link>
                  </div>
                </section>
              )}

              {todo.length === 0 && !running && <BreakGame />}

              {deadlineList.length > 0 && (
                <section
                  className={`rounded-2xl border bg-white p-5 shadow-sm ${
                    overdueTasks.length > 0
                      ? "border-rose-200 ring-1 ring-rose-100"
                      : "border-amber-200 ring-1 ring-amber-100"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                      <CalendarClock
                        aria-hidden="true"
                        className={`h-4 w-4 ${
                          overdueTasks.length > 0
                            ? "text-rose-600"
                            : "text-amber-600"
                        }`}
                      />
                      Deadlines
                    </h2>
                    <span className="text-xs text-slate-500">
                      {overdueTasks.length > 0 &&
                        `${overdueTasks.length} overdue`}
                      {overdueTasks.length > 0 &&
                        dueTodayTasks.length > 0 &&
                        " · "}
                      {dueTodayTasks.length > 0 &&
                        `${dueTodayTasks.length} due today`}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {deadlineList.map((task) => {
                      const late = daysLate(task);
                      return (
                        <li
                          className="flex items-center justify-between gap-3 py-2.5"
                          key={task.id}
                        >
                          <p className="min-w-0 truncate text-sm text-slate-800">
                            <span className="text-slate-400">#{task.id}</span>{" "}
                            {task.particulars}
                          </p>
                          <span className="flex shrink-0 items-center gap-2 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                late > 0
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {late > 0
                                ? `${plural(late, "day", "days")} late`
                                : "Due today"}
                            </span>
                            {task.status === "in_progress" ? (
                              <span className="text-xs font-semibold text-emerald-700">
                                Running
                              </span>
                            ) : (
                              startButton(task)
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {deadlineTotal > deadlineList.length && (
                    <Link
                      className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline"
                      href={MY_TASKS_HREF}
                    >
                      See {deadlineTotal - deadlineList.length} more
                    </Link>
                  )}
                </section>
              )}

              {todo.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-900">
                      Up next
                    </h2>
                    <Link
                      className="text-sm font-medium text-blue-700 hover:underline"
                      href={MY_TASKS_HREF}
                    >
                      See all {todo.length}
                    </Link>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {todo.slice(0, 3).map((task) => (
                      <li
                        className="flex items-center justify-between gap-3 py-2.5"
                        key={task.id}
                      >
                        <p className="min-w-0 truncate text-sm text-slate-800">
                          <span className="text-slate-400">#{task.id}</span>{" "}
                          {task.particulars}
                        </p>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                          {task.priority === "urgent" && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                              Urgent
                            </span>
                          )}
                          {task.progress}%{startButton(task)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {/* Targets + pet + kudos */}
            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Today’s goal
                    </h2>
                    <p className="text-sm text-slate-500">
                      Finish {dailyGoal} tasks today.
                    </p>
                  </div>
                  {extras && !goalsLocked && !goalsOpen && (
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      onClick={openGoalEditor}
                      type="button"
                    >
                      <Pencil aria-hidden="true" className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-5">
                  <Ring goal={dailyGoal} value={doneToday} />
                  <p className="text-sm leading-relaxed text-slate-600">
                    {goalReached
                      ? "You hit your goal. Anything more is a bonus."
                      : doneToday === 0
                        ? "One task gets you rolling."
                        : `${dailyGoal - doneToday} more to go. You’re close.`}
                  </p>
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <Gauge aria-hidden="true" className="h-3.5 w-3.5" />
                      Focus goal
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {fmtShort(focusToday)} / {fmtShort(focusGoalMinutes * 60)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        focusGoalReached ? "bg-emerald-500" : "bg-sky-500"
                      }`}
                      style={{ width: `${focusGoalRatio * 100}%` }}
                    />
                  </div>
                </div>

                {extras && (
                  <p className="mt-3 text-[11px] text-slate-400">
                    {goalsLocked
                      ? `Targets set by ${extras.goals.set_by_name ?? "your manager"}.`
                      : "Targets you set yourself."}
                  </p>
                )}

                {goalsOpen && (
                  <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    {[
                      { key: "daily", label: "Tasks per day" },
                      { key: "weekly", label: "Tasks per week" },
                      { key: "focus", label: "Focus minutes per day" },
                    ].map((field) => (
                      <label
                        className="flex items-center justify-between gap-3 text-xs text-slate-600"
                        key={field.key}
                      >
                        {field.label}
                        <input
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          min={1}
                          onChange={(event) =>
                            setGoalForm((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          type="number"
                          value={
                            goalForm[field.key as "daily" | "weekly" | "focus"]
                          }
                        />
                      </label>
                    ))}
                    {goalError && (
                      <p className="text-xs text-rose-700" role="alert">
                        {goalError}
                      </p>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        disabled={savingGoals}
                        onClick={() => setGoalsOpen(false)}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        disabled={savingGoals}
                        onClick={() => void saveGoals()}
                        type="button"
                      >
                        {savingGoals ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <PetCard
                goalReached={goalReached}
                onEvolve={handleEvolve}
                streak={streak}
                todayActive={todayActive}
                xp={petXp}
              />

              {extras && extras.kudos.length > 0 && (
                <section className="rounded-2xl border border-pink-200 bg-white p-5 shadow-sm">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <Heart
                      aria-hidden="true"
                      className="h-4 w-4 text-pink-500"
                    />
                    Kudos
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {extras.kudos.slice(0, 4).map((kudos) => (
                      <li
                        className={`rounded-xl px-3 py-2 text-sm ${
                          freshKudos.includes(kudos.id)
                            ? "bg-pink-50 ring-1 ring-pink-200"
                            : "bg-slate-50"
                        }`}
                        key={kudos.id}
                      >
                        <p className="text-slate-800">
                          <span aria-hidden="true">{kudos.emoji}</span>{" "}
                          {kudos.message}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {kudos.from_name ?? "Your manager"} ·{" "}
                          {fmtWhen(kudos.created_at)}
                          {kudos.task_title ? ` · ${kudos.task_title}` : ""}
                          {freshKudos.includes(kudos.id) && (
                            <span className="ml-1 font-semibold text-pink-600">
                              New
                            </span>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>

          {/* This week */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-base font-semibold text-slate-900">
                    Weekly goal
                  </h2>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {weekDone}
                    <span className="text-slate-400">/{weeklyGoal}</span>
                  </span>
                </div>
                <p className="text-sm text-slate-500">{weeklyMessage}</p>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      weekDone >= weeklyGoal ? "bg-emerald-500" : "bg-blue-600"
                    }`}
                    style={{
                      width: `${Math.min(100, (weekDone / weeklyGoal) * 100)}%`,
                    }}
                  />
                </div>

                <div className="mt-5 grid grid-cols-7 gap-2">
                  {weekDays.map((day) => (
                    <div
                      className="flex flex-col items-center gap-1.5"
                      key={day.key}
                    >
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                          day.isFuture
                            ? "border border-dashed border-slate-200 text-slate-300"
                            : day.done >= dailyGoal
                              ? "bg-emerald-500 text-white"
                              : day.done > 0
                                ? "bg-emerald-100 text-emerald-700"
                                : day.seconds >= 60
                                  ? "bg-sky-100 text-sky-700"
                                  : "bg-slate-100 text-slate-400"
                        } ${day.isToday ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
                      >
                        {day.done >= dailyGoal ? (
                          <CheckCircle2
                            aria-hidden="true"
                            className="h-5 w-5"
                          />
                        ) : day.done > 0 ? (
                          day.done
                        ) : day.seconds >= 60 ? (
                          <Clock3 aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          ""
                        )}
                      </span>
                      <span
                        className={`text-[11px] ${
                          day.isToday
                            ? "font-semibold text-blue-700"
                            : "text-slate-500"
                        }`}
                      >
                        {day.label}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-slate-400">
                  Number = tasks finished · Clock = time tracked · Check = daily
                  goal hit
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                    <Trophy aria-hidden="true" className="h-4 w-4" />
                    Beat your record
                  </p>
                  <p className="mt-1 text-sm text-amber-900">{recordMessage}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-100">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-700"
                      style={{ width: `${recordRatio * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      This week vs last week
                    </p>
                    <p className="text-xs text-slate-500">
                      {weekDone} now vs {lastWeekSoFar} on the same days
                    </p>
                  </div>
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      weekDiff > 0
                        ? "text-emerald-600"
                        : weekDiff < 0
                          ? "text-rose-600"
                          : "text-slate-500"
                    }`}
                  >
                    {weekDiff > 0 ? "▲ +" : weekDiff < 0 ? "▼ " : "= "}
                    {weekDiff}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Heatmap + insights */}
          <div className="grid gap-5 lg:grid-cols-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
              <h2 className="text-base font-semibold text-slate-900">
                Last 30 days
              </h2>
              <p className="text-sm text-slate-500">
                {heatTotal === 0
                  ? "Finish a task and your calendar starts to fill in."
                  : `${plural(heatTotal, "task", "tasks")} finished across ${plural(heatActiveDays, "day", "days")}.`}
              </p>
              <div className="mt-4 flex gap-2">
                <div className="grid grid-rows-7 gap-1.5 text-[11px] text-slate-400">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (label) => (
                      <span className="flex h-9 items-center" key={label}>
                        {label}
                      </span>
                    ),
                  )}
                </div>
                <div className="grid flex-1 grid-flow-col grid-rows-7 gap-1.5">
                  {heatCells.map((cell) => (
                    <span
                      className={`flex h-9 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${
                        cell.hidden ? "bg-transparent" : heatClass(cell.count)
                      } ${cell.key === todayKey ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
                      key={cell.key}
                      title={
                        cell.hidden
                          ? ""
                          : `${cell.label}: ${plural(cell.count, "task", "tasks")}`
                      }
                    >
                      {cell.hidden || cell.count === 0 ? "" : cell.count}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                Less
                <span className="h-3 w-3 rounded-[3px] bg-slate-100" />
                <span className="h-3 w-3 rounded-[3px] bg-emerald-200" />
                <span className="h-3 w-3 rounded-[3px] bg-emerald-400" />
                <span className="h-3 w-3 rounded-[3px] bg-emerald-600" />
                <span className="h-3 w-3 rounded-[3px] bg-emerald-800" />
                {dailyGoal}+ goal · {dailyGoal * 2}+ double
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Lightbulb
                  aria-hidden="true"
                  className="h-4 w-4 text-amber-500"
                />
                Insights
              </h2>
              <div className="mt-3 space-y-2">
                <InsightTile
                  caption={
                    onTimeRate === null
                      ? "Finish a task that has a due date"
                      : `${onTimeDone} of ${dueCompleted} finished on time`
                  }
                  icon={Target}
                  label="On-time rate"
                  tone="bg-emerald-100 text-emerald-700"
                  value={onTimeRate === null ? "–" : `${onTimeRate}%`}
                />
                <InsightTile
                  caption={
                    estimateRate === null
                      ? "Add estimates to your tasks to see this"
                      : `${withinEstimate} of ${estimated.length} tasks within your estimate`
                  }
                  icon={Hourglass}
                  label="Estimate accuracy"
                  tone="bg-sky-100 text-sky-700"
                  value={estimateRate === null ? "–" : `${estimateRate}%`}
                />
                <InsightTile
                  caption={
                    peakHour < 0 || completed.length < 3
                      ? "Finish a few more tasks to see this"
                      : `${peakShare}% of your tasks finish in this hour`
                  }
                  icon={Sunrise}
                  label="Peak hour"
                  tone="bg-amber-100 text-amber-700"
                  value={
                    peakHour < 0 || completed.length < 3
                      ? "–"
                      : `${hourLabel(peakHour)}–${hourLabel(peakHour + 1)}`
                  }
                />
              </div>
            </section>
          </div>

          {/* Focus chart + badges */}
          <div className="grid gap-5 lg:grid-cols-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
              <h2 className="text-base font-semibold text-slate-900">
                Your week
              </h2>
              <p className="text-sm text-slate-500">
                Hours of tracked focus time per day
              </p>
              {focusWeek < 60 ? (
                <p className="py-16 text-center text-sm text-slate-500">
                  Start a task and your week fills in here.
                </p>
              ) : (
                <div className="mt-4 h-60">
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart
                      data={focusDays.map((day) => ({
                        name: day.label,
                        hours: Math.round((day.seconds / 3600) * 10) / 10,
                        today: day.key === todayKey,
                      }))}
                      margin={{ top: 8, right: 8, left: -18, bottom: 4 }}
                    >
                      <CartesianGrid
                        stroke="#e2e8f0"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        axisLine={false}
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                      />
                      <YAxis
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                      />
                      <Tooltip />
                      <Bar
                        dataKey="hours"
                        name="Hours"
                        radius={[6, 6, 0, 0]}
                        barSize={28}
                      >
                        {focusDays.map((day) => (
                          <Cell
                            fill={day.key === todayKey ? "#2563eb" : "#93c5fd"}
                            key={day.key}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="text-base font-semibold text-slate-900">Badges</h2>
              <p className="text-sm text-slate-500">
                {unlockedCount} of {badges.length} unlocked
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(["all", "unlocked", "locked"] as const).map((filter) => (
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      badgeFilter === filter
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                    key={filter}
                    onClick={() => {
                      setBadgeFilter(filter);
                      setBadgePage(0);
                    }}
                    type="button"
                  >
                    {filter === "all"
                      ? `All ${badges.length}`
                      : filter === "unlocked"
                        ? `Unlocked ${unlockedCount}`
                        : `In progress ${badges.length - unlockedCount}`}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid min-h-[220px] grid-cols-1 content-start gap-2 sm:grid-cols-2">
                {visibleBadges.map((badge) => {
                  const Icon = badge.icon;
                  const unlocked = isUnlocked(badge);
                  const ratio = Math.min(1, badge.current / badge.target);
                  return (
                    <div
                      className={`flex h-[68px] items-center gap-2.5 rounded-xl border px-2.5 transition ${
                        unlocked
                          ? "border-amber-200 bg-amber-50"
                          : "border-slate-200 bg-slate-50"
                      }`}
                      key={badge.key}
                      title={badge.hint}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          unlocked
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {unlocked ? (
                          <Icon aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <Lock aria-hidden="true" className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-[13px] font-semibold ${
                            unlocked ? "text-slate-900" : "text-slate-600"
                          }`}
                        >
                          {badge.label}
                        </p>
                        {unlocked ? (
                          <p className="truncate text-[11px] text-amber-700">
                            {badge.hint}
                          </p>
                        ) : (
                          <>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-blue-500 transition-all"
                                style={{ width: `${ratio * 100}%` }}
                              />
                            </div>
                            <p className="mt-0.5 truncate text-[10px] tabular-nums text-slate-500">
                              {Math.floor(badge.current * 10) / 10} /{" "}
                              {badge.target} · {badge.hint}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {visibleBadges.length === 0 && (
                  <p className="col-span-full py-10 text-center text-sm text-slate-500">
                    {badgeFilter === "unlocked"
                      ? "No badges yet. Finish a task to earn your first."
                      : "You’ve unlocked everything. Legend."}
                  </p>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button
                  aria-label="Previous badges"
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
                  disabled={safePage === 0}
                  onClick={() => setBadgePage(safePage - 1)}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
                <span className="text-xs tabular-nums text-slate-500">
                  Page {safePage + 1} of {badgePages}
                </span>
                <button
                  aria-label="Next badges"
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
                  disabled={safePage >= badgePages - 1}
                  onClick={() => setBadgePage(safePage + 1)}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </section>
          </div>

          {/* Level titles + weekly leaderboard */}
          <div className="grid gap-5 lg:grid-cols-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="text-base font-semibold text-slate-900">
                Level titles
              </h2>
              <p className="text-sm text-slate-500">
                Reach a level to earn its title.
              </p>
              <ul className="mt-3 space-y-1.5">
                {LEVEL_TITLES.map((entry) => {
                  const reached = level >= entry.level;
                  const current = entry.title === levelTitle.title;
                  return (
                    <li
                      className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
                        current
                          ? "bg-blue-50 font-semibold text-blue-800 ring-1 ring-blue-200"
                          : reached
                            ? "bg-slate-50 text-slate-700"
                            : "text-slate-400"
                      }`}
                      key={entry.title}
                    >
                      <span className="flex items-center gap-2">
                        {reached ? (
                          <CheckCircle2
                            aria-hidden="true"
                            className="h-4 w-4 text-emerald-500"
                          />
                        ) : (
                          <Lock aria-hidden="true" className="h-4 w-4" />
                        )}
                        {entry.title}
                      </span>
                      <span className="text-xs tabular-nums">
                        Level {entry.level}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {extras && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                      <Users aria-hidden="true" className="h-4 w-4" />
                      Weekly leaderboard
                    </h2>
                    <p className="text-sm text-slate-500">
                      Tasks finished this week
                      {extras.leaderboard.department
                        ? ` in ${extras.leaderboard.department}`
                        : ""}
                      . Optional, and only people who joined can see it.
                    </p>
                  </div>
                  {extras.leaderboard.opted_in && (
                    <button
                      className="shrink-0 text-xs font-medium text-slate-500 hover:underline disabled:opacity-60"
                      disabled={boardBusy}
                      onClick={() => void setLeaderboard(false)}
                      type="button"
                    >
                      Leave
                    </button>
                  )}
                </div>

                {!extras.leaderboard.opted_in ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-4 text-center ring-1 ring-slate-100">
                    <p className="text-sm text-slate-600">
                      Join for a friendly weekly race with your department. You
                      can leave any time.
                    </p>
                    <button
                      className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      disabled={boardBusy}
                      onClick={() => void setLeaderboard(true)}
                      type="button"
                    >
                      Join the leaderboard
                    </button>
                  </div>
                ) : extras.leaderboard.entries.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    {extras.leaderboard.department
                      ? "Nobody has finished a task yet this week."
                      : "Your department isn’t set, so there’s nobody to compare with yet."}
                  </p>
                ) : (
                  <ol className="mt-4 space-y-2">
                    {extras.leaderboard.entries.map((row) => {
                      const top = extras.leaderboard.entries[0]?.tasks || 1;
                      return (
                        <li
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                            row.is_you
                              ? "bg-blue-50 ring-1 ring-blue-200"
                              : "bg-slate-50"
                          }`}
                          key={`${row.rank}-${row.name}`}
                        >
                          <span className="w-6 text-center text-sm font-bold tabular-nums text-slate-700">
                            {row.rank === 1
                              ? "🥇"
                              : row.rank === 2
                                ? "🥈"
                                : row.rank === 3
                                  ? "🥉"
                                  : row.rank}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {row.name}
                              {row.is_you && (
                                <span className="ml-1 text-xs font-semibold text-blue-700">
                                  (you)
                                </span>
                              )}
                            </p>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${
                                  row.is_you ? "bg-blue-500" : "bg-slate-400"
                                }`}
                                style={{
                                  width: `${Math.min(100, (row.tasks / top) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-slate-700">
                            {row.tasks}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            )}
          </div>

          {/* Recent wins */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Recent wins
            </h2>
            <p className="text-sm text-slate-500">
              What you finished lately. Look how far you’ve come.
            </p>
            {recentWins.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Your first win is waiting. Complete a task and it shows up here.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {recentWins.map((task) => (
                  <li
                    className="flex items-start justify-between gap-3 py-3"
                    key={task.id}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          <span className="text-slate-400">#{task.id}</span>{" "}
                          {task.particulars}
                        </p>
                        {task.last_remark && (
                          <p className="truncate text-xs italic text-slate-500">
                            “{task.last_remark}”
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-slate-500">
                      <p>
                        {task.completed_at ? fmtWhen(task.completed_at) : ""}
                      </p>
                      <p className="tabular-nums">
                        {fmtShort(task.worked_seconds)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* OT filing, leave credits, employee milestones */}
          {showAccountPanel && <EmployeeAccountPanel />}
        </>
      )}

      <Confetti burst={burst} />

      {currentKudos && (
        <div
          aria-labelledby="kudos-popup-title"
          aria-modal="true"
          className="fixed inset-0 z-[60] !mt-0 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={closeKudos}
          role="dialog"
        >
          <div
            className="relative w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl ring-1 ring-pink-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-pink-50 text-5xl ring-4 ring-pink-100">
              <span aria-hidden="true">{currentKudos.emoji}</span>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-pink-600">
              Kudos from {currentKudos.from_name ?? "your manager"}
            </p>
            <h2
              className="mt-2 text-xl font-bold text-slate-900"
              id="kudos-popup-title"
            >
              {currentKudos.message}
            </h2>
            {currentKudos.task_title && (
              <p className="mt-2 text-sm text-slate-500">
                For: {currentKudos.task_title}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {fmtWhen(currentKudos.created_at)}
            </p>
            {kudosPopup.length > 1 && (
              <p className="mt-3 text-xs tabular-nums text-slate-500">
                {kudosIndex + 1} of {kudosPopup.length}
              </p>
            )}
            <button
              autoFocus
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
              onClick={closeKudos}
              type="button"
            >
              <Heart aria-hidden="true" className="h-4 w-4" />
              {kudosIndex < kudosPopup.length - 1 ? "Next" : "Thank you!"}
            </button>
          </div>
        </div>
      )}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-50 !mt-0 flex w-72 flex-col gap-2"
        role="status"
      >
        {toasts.map((toast) => (
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-lg"
            key={toast.id}
          >
            <Sparkles
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-amber-500"
            />
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}
