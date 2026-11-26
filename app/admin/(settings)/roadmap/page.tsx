"use client";
// app/admin/roadmap/page.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type Variants,
} from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Inbox,
  Layers3,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/* ============================================================================
 * TYPES + DATA
 * ========================================================================== */

type ModuleGroup = { label?: string; items: string[] };

type Stage = {
  title: string;
  description: string;
  icon: LucideIcon;
  groups: ModuleGroup[];
  milestone: string;
  entryId?: number;
  directoryLinks?: string[];
  legacyDirectoryLink?: string | null;
};

type RoadmapEntry = {
  id: number;
  title: string;
  description: string;
  milestone_date: string;
  roadmap_id: number;
  directory_link: string | null;
  directory_links: string[] | null;
};

type RoadmapForm = Omit<RoadmapEntry, "id" | "directory_link"> & {
  directory_link: string;
};

type DirectoryOption = {
  key: string;
  label: string;
  module: string;
  href: string;
};

const stages: Stage[] = [
  {
    title: "Submission Intake",
    description:
      "The admin panel started as one place to receive inquiries, survey responses, and other website submissions.",
    icon: Inbox,
    groups: [{ items: ["Inquiries", "Survey"] }],
    milestone: "The starting point",
  },
  {
    title: "Organized Service Workflows",
    description:
      "The system grew to cover lead generation, marketing services, customer assessments, surveys, and customer support.",
    icon: Layers3,
    groups: [
      {
        label: "Lead Generation",
        items: [
          "Website Directory",
          "Website Audit",
          "SEO Audit",
          "Client Assessment",
          "Demo Website Requirements",
        ],
      },
      {
        label: "Marketing Services",
        items: [
          "Graphic Design",
          "Social Media Management",
          "Paid Ads",
          "Market Research",
          "Blog",
          "Portal Demo",
          "TikTok Shop Opening",
        ],
      },
      {
        label: "Surveys and Support",
        items: ["Juantap Survey", "Video Survey", "Support Tickets"],
      },
    ],
    milestone: "Expanding service capabilities",
  },
  {
    title: "Structured Records",
    description:
      "Master files gave employee information and its supporting records a proper home.",
    icon: Database,
    groups: [
      { label: "Master Files", items: ["Employee Masterfile"] },
      {
        label: "Supporting Records",
        items: ["Position History", "ID Issuances"],
      },
    ],
    milestone: "Introducing master files",
  },
  {
    title: "Operational Workflows",
    description:
      "Task assignments, contracts, and HR processes arrived to run the day-to-day work.",
    icon: ClipboardList,
    groups: [
      {
        items: [
          "Task Management",
          "Contracts",
          "Clearance",
          "Leave Requests",
          "Tardiness",
          "OJT Attendance",
        ],
      },
    ],
    milestone: "Supporting daily operations",
  },
  {
    title: "Centralized Administration",
    description:
      "Account management, directory permissions, and superadmin controls were brought together in one place.",
    icon: ShieldCheck,
    groups: [
      {
        label: "Access and Permissions",
        items: [
          "Admin Accounts",
          "Directory Permissions",
          "Superadmin Assignment",
        ],
      },
    ],
    milestone: "Consolidating administration",
  },
];

/* ============================================================================
 * THE ROAD
 * A fixed S-shaped path in a 1000 x 700 box. Stops are spaced evenly along its
 * length, so adding development updates just adds more stops to the road.
 * ========================================================================== */

const W = 1000;
const H = 700;
// The U-turns bulge out by 120 + half the road width (37), so they are kept
// inside the 0–1000 box: right turn peaks at x≈997, left turn bottoms at x≈3.
const ROAD_D =
  "M60 110 H840 A120 120 0 0 1 840 350 H160 A120 120 0 0 0 160 590 H940";
// 780 + half circle + 680 + half circle + 780
const PATH_LEN = 2240 + 240 * Math.PI;
const START_PAD = 50;
const END_PAD = 0; // last stop sits at the very end of the road
const TOUR_MS = 5000;

type Point = { x: number; y: number };

const today = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const fmtMonth = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

/* ============================================================================
 * PAGE
 * ========================================================================== */

export default function AdminRoadmapPage() {
  const reduce = useReducedMotion() ?? false;

  const [[active, direction], setPage] = useState<[number, number]>([0, 0]);
  const [playing, setPlaying] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(
    null,
  );

  const [roadmapEntries, setRoadmapEntries] = useState<RoadmapEntry[]>([]);
  const [directoryOptions, setDirectoryOptions] = useState<DirectoryOption[]>(
    [],
  );
  const [roadmapId, setRoadmapId] = useState<number | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RoadmapEntry | null>(null);
  const [form, setForm] = useState<RoadmapForm>({
    title: "",
    description: "",
    milestone_date: today(),
    roadmap_id: 0,
    directory_link: "",
    directory_links: [],
  });

  const timelineStages = useMemo<Stage[]>(
    () => [
      ...stages,
      ...roadmapEntries.map((entry) => ({
        title: entry.title,
        description: entry.description,
        icon: Sparkles,
        groups: [],
        milestone: fmtMonth(entry.milestone_date),
        entryId: entry.id,
        directoryLinks: entry.directory_links || [],
        legacyDirectoryLink: entry.directory_link,
      })),
    ],
    [roadmapEntries],
  );

  const total = timelineStages.length;
  const safeActive = Math.min(active, total - 1);
  const stage = timelineStages[safeActive];
  const Icon = stage.icon;

  const go = useCallback(
    (index: number) => {
      setPage(([current]) => {
        const next = Math.max(0, Math.min(total - 1, index));
        return [next, next >= current ? 1 : -1];
      });
    },
    [total],
  );

  const manualGo = (index: number) => {
    setPlaying(false);
    setDetailOpen(true);
    go(index);
  };

  /* ── road geometry + traveler ── */

  const roadRef = useRef<SVGPathElement>(null);
  const started = useRef(false);

  const stopDist = useMemo(
    () =>
      Array.from({ length: total }, (_, i) =>
        total === 1
          ? PATH_LEN / 2
          : START_PAD + (i * (PATH_LEN - START_PAD - END_PAD)) / (total - 1),
      ),
    [total],
  );

  // Where each stop sits on the screen.
  useEffect(() => {
    const path = roadRef.current;
    if (!path) return;
    setPoints(
      stopDist.map((d) => {
        const p = path.getPointAtLength(d);
        return { x: p.x, y: p.y };
      }),
    );
  }, [stopDist]);

  // Distance travelled along the road. The traveler and the glowing fill both
  // follow this one value.
  const dist = useMotionValue(0);
  const tx = useMotionValue(60);
  const ty = useMotionValue(110);
  const fill = useTransform(dist, (d) => d / PATH_LEN);
  const leftPct = useTransform(tx, (v) => `${(v / W) * 100}%`);
  const topPct = useTransform(ty, (v) => `${(v / H) * 100}%`);

  useMotionValueEvent(dist, "change", (d) => {
    const p = roadRef.current?.getPointAtLength(d);
    if (p) {
      tx.set(p.x);
      ty.set(p.y);
    }
  });

  useEffect(() => {
    const target = stopDist[safeActive];
    if (target === undefined) return;
    if (!started.current || reduce) {
      dist.set(target);
      started.current = true;
      return;
    }
    const controls = animate(dist, target, {
      duration: Math.min(2.4, 0.7 + Math.abs(target - dist.get()) / 1300),
      ease: [0.65, 0, 0.35, 1],
    });
    return () => controls.stop();
  }, [stopDist, safeActive, reduce, dist]);

  /* ── data ── */

  const loadEntries = useCallback(async () => {
    const response = await fetch("/api/admin/roadmap", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "Unable to load roadmap updates.");
    }
    setRoadmapId(result.roadmap_id);
    setRoadmapEntries(result.data);
    setDirectoryOptions(result.directories || []);
  }, []);

  useEffect(() => {
    void loadEntries()
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load roadmap updates.",
        );
      })
      .finally(() => setLoadingEntries(false));

    void fetch("/api/admin/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const session = await response.json();
        setIsSuperadmin(session.is_superadmin === true);
      })
      .catch(() => setIsSuperadmin(false));
  }, [loadEntries]);

  /* ── tour + keyboard ── */

  useEffect(() => {
    if (!playing) return;
    if (safeActive >= total - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => go(safeActive + 1), TOUR_MS);
    return () => window.clearTimeout(timer);
  }, [playing, safeActive, total, go]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (entryDialogOpen) return;
      const el = event.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (event.key === "ArrowRight") manualGo(safeActive + 1);
      if (event.key === "ArrowLeft") manualGo(safeActive - 1);
      if (event.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDialogOpen, safeActive, total]);

  const toggleTour = () => {
    if (!playing && safeActive >= total - 1) go(0);
    if (!playing) setDetailOpen(true);
    setPlaying((value) => !value);
  };

  /* ── entry CRUD ── */

  const openNewEntry = () => {
    setEditingEntry(null);
    setForm({
      title: "",
      description: "",
      milestone_date: today(),
      roadmap_id: roadmapId || 0,
      directory_link: "",
      directory_links: [],
    });
    setEntryDialogOpen(true);
  };

  const openEditEntry = (entryId: number) => {
    const entry = roadmapEntries.find((item) => item.id === entryId);
    if (!entry) return;
    setEditingEntry(entry);
    setForm({
      title: entry.title,
      description: entry.description,
      milestone_date: entry.milestone_date.slice(0, 10),
      roadmap_id: entry.roadmap_id,
      directory_link: entry.directory_link || "",
      directory_links: entry.directory_links || [],
    });
    setEntryDialogOpen(true);
  };

  const saveEntry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.roadmap_id) {
      toast.error("The system roadmap is not ready. Reload and try again.");
      return;
    }
    setSavingEntry(true);
    try {
      const response = await fetch(
        editingEntry
          ? `/api/admin/roadmap/${editingEntry.id}`
          : "/api/admin/roadmap",
        {
          method: editingEntry ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Unable to save roadmap update.");
      }
      await loadEntries();
      setEntryDialogOpen(false);
      toast.success(
        editingEntry ? "Roadmap update saved." : "Roadmap update added.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save roadmap update.",
      );
    } finally {
      setSavingEntry(false);
    }
  };

  const deleteEntry = async (entryId: number) => {
    if (!window.confirm("Delete this roadmap update?")) return;
    try {
      const response = await fetch(`/api/admin/roadmap/${entryId}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Unable to delete roadmap update.");
      }
      await loadEntries();
      toast.success("Roadmap update deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete roadmap update.",
      );
    }
  };

  /* ── motion for the detail card ── */

  const popVariants: Variants = {
    hidden: { opacity: 0, scale: reduce ? 1 : 0.96, y: reduce ? 0 : 8 },
    show: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] },
    },
    leave: {
      opacity: 0,
      scale: reduce ? 1 : 0.96,
      transition: { duration: reduce ? 0 : 0.15, ease: "easeIn" },
    },
  };

  const contentVariants: Variants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: reduce ? 0 : dir * 30,
    }),
    center: {
      opacity: 1,
      x: 0,
      transition: { duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] },
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: reduce ? 0 : dir * -30,
      transition: { duration: reduce ? 0 : 0.15, ease: "easeIn" },
    }),
  };

  const chipList: Variants = {
    center: { transition: { staggerChildren: reduce ? 0 : 0.035 } },
  };
  const chip: Variants = {
    enter: { opacity: 0, y: 8, scale: 0.9 },
    center: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: "spring", stiffness: 420, damping: 24 },
    },
  };

  const hasLinks =
    (stage.directoryLinks?.length || 0) > 0 ||
    Boolean(stage.legacyDirectoryLink);
  const ready = points.length === total;
  const activePoint = ready ? points[safeActive] : undefined;

  // Place the card next to the selected stop and keep it fully inside the
  // road area: below the stop if it fits, else above, else beside it.
  const placeCard = useCallback(() => {
    const stageEl = stageRef.current;
    const cardEl = cardRef.current;
    if (!stageEl || !cardEl || !activePoint) return;
    const cw = stageEl.clientWidth;
    const ch = stageEl.clientHeight;
    const w = cardEl.offsetWidth;
    const h = cardEl.offsetHeight;
    const px = (activePoint.x / W) * cw;
    const py = (activePoint.y / H) * ch;
    const gap = 40;
    const side = 44;
    const pad = 8;
    const clampX = (v: number) => Math.max(pad, Math.min(cw - w - pad, v));
    const clampY = (v: number) => Math.max(pad, Math.min(ch - h - pad, v));

    let left: number;
    let top: number;
    if (py + gap + h + pad <= ch) {
      left = clampX(px - w / 2);
      top = py + gap;
    } else if (py - gap - h >= pad) {
      left = clampX(px - w / 2);
      top = py - gap - h;
    } else {
      left = clampX(px > cw / 2 ? px - side - w : px + side);
      top = clampY(py - h / 2);
    }
    setCardPos((prev) =>
      prev && prev.left === left && prev.top === top ? prev : { left, top },
    );
  }, [activePoint]);

  useEffect(() => {
    if (!detailOpen) return;
    placeCard();
    const stageEl = stageRef.current;
    const cardEl = cardRef.current;
    if (!stageEl || !cardEl || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => placeCard());
    observer.observe(stageEl);
    observer.observe(cardEl);
    return () => observer.disconnect();
  }, [detailOpen, placeCard, safeActive]);

  return (
    <main className="relative min-h-full overflow-hidden bg-sky-50 pb-12 text-slate-900">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg">
        <div className="mx-auto flex w-full flex-col gap-5 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-8 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12">
              <Layers3 aria-hidden="true" className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                The Evolution of Infinitech Admin
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-blue-100">
                Follow the road from the first submission inbox to a full
                operations platform. Pick a stop to see what shipped there.
              </p>
            </div>
          </div>
          {isSuperadmin && (
            <Button
              className="h-11 w-full shrink-0 bg-white px-5 font-semibold text-blue-700 shadow-md hover:bg-blue-50 sm:w-auto"
              disabled={loadingEntries || !roadmapId}
              onClick={openNewEntry}
              type="button"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add development update
            </Button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-8 sm:px-6 lg:px-8">
        {/* ── The road ── */}
        <section
          aria-label="Roadmap"
          className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-sky-300 via-sky-200 to-cyan-100 shadow-xl shadow-sky-900/10 ring-1 ring-sky-300"
        >
          {/* drifting clouds */}
          {[
            { top: "6%", w: 180, dur: 60, from: "-20%", to: "110%" },
            { top: "46%", w: 140, dur: 80, from: "110%", to: "-20%" },
            { top: "84%", w: 200, dur: 70, from: "-25%", to: "110%" },
          ].map((cloud, i) => (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute h-10 rounded-full bg-white/50 blur-md"
              initial={{ left: cloud.from }}
              animate={reduce ? undefined : { left: cloud.to }}
              key={i}
              style={{ top: cloud.top, width: cloud.w }}
              transition={{
                duration: cloud.dur,
                ease: "linear",
                repeat: Infinity,
              }}
            />
          ))}

          {/* tour controls */}
          <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
            {loadingEntries && (
              <Loader2
                aria-label="Loading development updates"
                className="h-4 w-4 animate-spin text-blue-900/60"
              />
            )}
            <Button
              className="bg-white/85 text-blue-900 shadow-md backdrop-blur hover:bg-white"
              onClick={toggleTour}
              size="sm"
              type="button"
              variant="ghost"
            >
              {playing ? (
                <Pause className="mr-2 h-4 w-4" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {playing ? "Pause tour" : "Play tour"}
            </Button>
          </div>

          <div
            className="relative mx-auto aspect-[1000/700] w-full max-w-5xl"
            ref={stageRef}
          >
            <svg
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${W} ${H}`}
            >
              <defs>
                <linearGradient
                  gradientUnits="userSpaceOnUse"
                  id="road-glow"
                  x1="60"
                  x2="940"
                  y1="0"
                  y2="0"
                >
                  <stop offset="0" stopColor="#22d3ee" />
                  <stop offset="0.5" stopColor="#6366f1" />
                  <stop offset="1" stopColor="#c084fc" />
                </linearGradient>
              </defs>

              {/* road edge, surface, then the part already travelled */}
              <path
                d={ROAD_D}
                fill="none"
                stroke="#7dd3fc"
                strokeLinecap="round"
                strokeWidth="74"
              />
              <path
                d={ROAD_D}
                fill="none"
                ref={roadRef}
                stroke="#1e3a8a"
                strokeLinecap="round"
                strokeWidth="58"
              />
              <motion.path
                d={ROAD_D}
                fill="none"
                stroke="url(#road-glow)"
                strokeLinecap="round"
                strokeWidth="58"
                style={{ pathLength: fill }}
              />
              {/* lane markings */}
              <path
                d={ROAD_D}
                fill="none"
                stroke="white"
                strokeDasharray="2 16"
                strokeLinecap="round"
                strokeOpacity="0.55"
                strokeWidth="3"
              />
            </svg>

            {/* stops */}
            {ready &&
              timelineStages.map((item, index) => {
                const point = points[index];
                const reached = index < safeActive;
                const current = index === safeActive;
                const above = index % 2 === 0;
                const labelLeft = Math.min(
                  90,
                  Math.max(10, (point.x / W) * 100),
                );
                return (
                  <div key={item.entryId ? `e-${item.entryId}` : item.title}>
                    <button
                      aria-current={current ? "step" : undefined}
                      aria-label={`Stop ${index + 1}: ${item.title}`}
                      className={`absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold shadow-md ring-2 transition-[transform,opacity,background-color] duration-300 hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white md:h-11 md:w-11 md:text-sm ${
                        current
                          ? "opacity-0"
                          : reached
                            ? "bg-white text-indigo-700 ring-indigo-300"
                            : "bg-blue-900 text-white/80 ring-white/40"
                      }`}
                      onClick={() => manualGo(index)}
                      style={{
                        left: `${(point.x / W) * 100}%`,
                        top: `${(point.y / H) * 100}%`,
                      }}
                      type="button"
                    >
                      {index + 1}
                    </button>

                    {/* label beside the road (tablet and up) */}
                    <button
                      className={`absolute z-10 hidden w-36 text-center text-xs font-semibold leading-snug transition-colors md:block lg:w-44 lg:text-sm ${
                        current ? "text-blue-950" : "text-blue-900/70"
                      } hover:text-blue-950`}
                      onClick={() => manualGo(index)}
                      style={{
                        left: `${labelLeft}%`,
                        top: `${(point.y / H) * 100}%`,
                        transform: above
                          ? "translate(-50%, calc(-100% - 40px))"
                          : "translate(-50%, 40px)",
                      }}
                      tabIndex={-1}
                      type="button"
                    >
                      <span className="mr-1 text-indigo-700">{index + 1}.</span>
                      {item.title}
                    </button>
                  </div>
                );
              })}

            {/* the traveler: rides the road to whichever stop is selected */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: leftPct,
                top: topPct,
                opacity: ready ? 1 : 0,
              }}
            >
              {!reduce && (
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-white"
                  animate={{ scale: [1, 1.7], opacity: [0.8, 0] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeOut",
                  }}
                />
              )}
              <motion.span
                className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-xl shadow-indigo-900/40 ring-4 ring-white md:h-14 md:w-14"
                animate={reduce ? undefined : { y: [0, -4, 0] }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Icon className="h-4 w-4 md:h-6 md:w-6" />
              </motion.span>
            </motion.div>

            {/* ── Stop details: floats next to the selected stop ── */}
            <AnimatePresence>
              {detailOpen && activePoint && (
                <div
                  className={`fixed bottom-3 left-3 right-3 z-40 md:absolute md:bottom-auto md:right-auto md:w-[24rem] md:transition-[left,top] md:duration-500 md:[left:var(--card-left)] md:[top:var(--card-top)] ${
                    cardPos ? "" : "md:invisible"
                  }`}
                  key="detail-card"
                  ref={cardRef}
                  style={
                    {
                      "--card-left": `${cardPos?.left ?? 0}px`,
                      "--card-top": `${cardPos?.top ?? 0}px`,
                    } as React.CSSProperties
                  }
                >
                  <motion.section
                    animate="show"
                    aria-live="polite"
                    className="max-h-[75vh] overflow-y-auto rounded-2xl bg-white shadow-2xl shadow-indigo-900/25 ring-1 ring-slate-200 md:max-h-none md:overflow-visible"
                    exit="leave"
                    initial="hidden"
                    variants={popVariants}
                  >
                    <div className="p-4 sm:p-5">
                      <AnimatePresence
                        custom={direction}
                        initial={false}
                        mode="wait"
                      >
                        <motion.div
                          animate="center"
                          custom={direction}
                          exit="exit"
                          initial="enter"
                          key={
                            stage.entryId ? `e-${stage.entryId}` : stage.title
                          }
                          variants={contentVariants}
                        >
                          <div className="flex items-center gap-2 pr-8 text-xs text-slate-500">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white">
                              <Icon aria-hidden="true" className="h-4 w-4" />
                            </span>
                            <span>
                              {stage.entryId ? "Development update" : "Stop"}{" "}
                              {safeActive + 1} of {total}
                            </span>
                            {safeActive === total - 1 && (
                              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                                Latest
                              </span>
                            )}
                          </div>

                          <h2 className="mt-3 text-xl font-extrabold leading-tight tracking-tight text-slate-900">
                            {stage.title}
                          </h2>
                          <p className="mt-1 text-xs font-semibold text-indigo-700">
                            {stage.milestone}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {stage.description}
                          </p>

                          {stage.groups.length > 0 && (
                            <motion.div
                              animate="center"
                              className="mt-4 max-h-52 space-y-3 overflow-y-auto pr-1"
                              initial="enter"
                              variants={chipList}
                            >
                              {stage.groups.map((group, groupIndex) => (
                                <div key={group.label ?? `group-${groupIndex}`}>
                                  {group.label && (
                                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                      {group.label}
                                    </p>
                                  )}
                                  <ul className="flex flex-wrap gap-1.5">
                                    {group.items.map((item) => (
                                      <motion.li
                                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                        key={item}
                                        variants={chip}
                                      >
                                        {item}
                                      </motion.li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </motion.div>
                          )}

                          {hasLinks && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {stage.directoryLinks?.map((key) => {
                                const directory = directoryOptions.find(
                                  (option) => option.key === key,
                                );
                                if (!directory) return null;
                                return (
                                  <a
                                    className="inline-flex items-center rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700"
                                    href={directory.href}
                                    key={key}
                                  >
                                    {directory.label}
                                  </a>
                                );
                              })}
                              {stage.legacyDirectoryLink && (
                                <a
                                  className="inline-flex items-center rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700"
                                  href={stage.legacyDirectoryLink}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                >
                                  Related link
                                </a>
                              )}
                            </div>
                          )}

                          {isSuperadmin && stage.entryId && (
                            <div className="mt-4 flex gap-2">
                              <Button
                                onClick={() => openEditEntry(stage.entryId!)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button
                                className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                onClick={() => void deleteEntry(stage.entryId!)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Delete
                              </Button>
                            </div>
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {/* close */}
                    <button
                      aria-label="Close details"
                      className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => {
                        setPlaying(false);
                        setDetailOpen(false);
                      }}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>

                    {/* prev / next */}
                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-2 py-1.5">
                      <Button
                        disabled={safeActive === 0}
                        onClick={() => manualGo(safeActive - 1)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        disabled={safeActive >= total - 1}
                        onClick={() => manualGo(safeActive + 1)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Next
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </motion.section>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* tour progress */}
          {playing && !reduce && (
            <motion.div
              animate={{ width: "100%" }}
              aria-hidden="true"
              className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-cyan-400 to-purple-500"
              initial={{ width: "0%" }}
              key={`tour-${safeActive}`}
              transition={{ duration: TOUR_MS / 1000, ease: "linear" }}
            />
          )}
        </section>

        <p className="text-center text-xs text-slate-400">
          Click a stop on the road, or use the left and right arrow keys. Press
          Esc to close the details.
        </p>
      </div>

      {/* ── Add / edit dialog ── */}
      <Dialog
        onOpenChange={(open) => !savingEntry && setEntryDialogOpen(open)}
        open={entryDialogOpen}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border-slate-200 bg-white shadow-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingEntry
                ? "Edit development update"
                : "Add development update"}
            </DialogTitle>
            <DialogDescription>
              Record a system milestone to add it as a new stop on the road.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={saveEntry}>
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="roadmap-title"
              >
                Title
              </label>
              <Input
                id="roadmap-title"
                maxLength={160}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="e.g. Inventory management"
                required
                value={form.title}
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="roadmap-date"
              >
                Development date
              </label>
              <Input
                id="roadmap-date"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    milestone_date: event.target.value,
                  }))
                }
                required
                type="date"
                value={form.milestone_date}
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="roadmap-description"
              >
                Description
              </label>
              <textarea
                className="w-full resize-y rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                id="roadmap-description"
                maxLength={2000}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Describe what changed in the system."
                required
                rows={5}
                value={form.description}
              />
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">
                Related directories{" "}
                <span className="font-normal text-slate-400">
                  (select any that apply)
                </span>
              </legend>
              <div className="mt-2 max-h-48 space-y-4 overflow-y-auto rounded-md border border-slate-200 p-3">
                {Array.from(
                  new Set(directoryOptions.map((option) => option.module)),
                ).map((module) => (
                  <div key={module}>
                    <p className="mb-2 text-xs font-semibold text-slate-500">
                      {module}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {directoryOptions
                        .filter((option) => option.module === module)
                        .map((option) => (
                          <label
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-blue-50"
                            key={option.key}
                          >
                            <input
                              checked={
                                form.directory_links?.includes(option.key) ??
                                false
                              }
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  directory_links: event.target.checked
                                    ? [
                                        ...(current.directory_links || []),
                                        option.key,
                                      ]
                                    : (current.directory_links || []).filter(
                                        (key) => key !== option.key,
                                      ),
                                }))
                              }
                              type="checkbox"
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
                {directoryOptions.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No admin directories are available.
                  </p>
                )}
              </div>
            </fieldset>
            <DialogFooter>
              <Button
                disabled={savingEntry}
                onClick={() => setEntryDialogOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="bg-blue-600 text-white hover:bg-blue-700"
                disabled={savingEntry}
                type="submit"
              >
                {savingEntry && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingEntry ? "Save update" : "Add update"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
