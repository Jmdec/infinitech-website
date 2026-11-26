"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  ChevronDown,
  Lock,
  Menu,
  Search,
  X,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
LogOut,
  Settings,
  Bell,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import AutoPushSubscribe from "@/components/tasks/AutoPushSubscribe";
import {
  ADMIN_NAV_ITEMS,
  NAV_SECTIONS,
  getDirectoryKeyForHref,
  getAuthorizedNavSections,
  getNavGroups,
  hasDirectoryAccess,
  type NavItem,
} from "@/lib/admin-navigation";
import { dashboardPathFor } from "@/lib/role-dashboards";
import {
  useApprovalNotifications,
  type ApprovalNotif,
} from "@/lib/pending-approvals";

/* ============================================================================
 * Theme
 * Dapat tugma sa THEME_KEY sa components/admin/settings-page.tsx
 * ========================================================================== */

const THEME_KEY = "admin_theme";

/* ============================================================================
 * Pending gov ID badge config
 * ========================================================================== */

// Dapat eksaktong tugma sa href sa lib/admin-navigation.ts
const MASTERFILE_HREF = "/admin/masterfile";
// Dapat eksaktong tugma sa href ng "For Approval" sa lib/admin-navigation.ts
const FOR_APPROVAL_HREF = "/admin/for-approval";

const GOV_ID_KEYS = [
  "sss_number",
  "philhealth_number",
  "pagibig_number",
  "tin_number",
] as const;

// true = Active employees lang ang binibilang sa red dot.
// false = lahat ng status (tugma sa "pending gov IDs" count sa masterfile page).
const COUNT_ONLY_ACTIVE = true;

// ── Work anniversary (galing sa date_hired, "YYYY-MM-DD") ──
// True kung ngayon ang anniversary at at least 1 taon na siya.
const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const isAnniversaryToday = (dateHired: unknown): boolean => {
  const match = String(dateHired ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;

  const now = new Date();
  const years = now.getFullYear() - Number(match[1]);
  if (years < 1) return false;

  const month = Number(match[2]);
  // Feb 29 hires: Feb 28 ang anniversary kapag hindi leap year.
  const day =
    month === 2 && Number(match[3]) === 29 && !isLeapYear(now.getFullYear())
      ? 28
      : Number(match[3]);

  return month === now.getMonth() + 1 && day === now.getDate();
};

/* ============================================================================
 * SECTION: Loader
 * Full-screen loader shown while the admin session is being verified.
 * Text only (company name), no logo.
 * ========================================================================== */

const COMPANY_NAME = "INFINITECH ADVERTISING CORPORATION";
const NAME_MAIN = "INFINITECH";
const NAME_SUB = "ADVERTISING CORPORATION";
const LOADER_MESSAGES = [
  "Verifying your session",
  "Checking your permissions",
  "Preparing your workspace",
];

// Marquee bulbs: even and odd bulbs trade places on and off, like a lit sign.
function Bulb({ phase, still }: { phase: 0 | 1; still: boolean }) {
  return (
    <motion.span
      aria-hidden="true"
      className="block h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_2px_rgba(252,211,77,0.55)]"
      initial={false}
      animate={
        still
          ? { opacity: phase === 0 ? 1 : 0.3 }
          : { opacity: phase === 0 ? [1, 0.15, 1] : [0.15, 1, 0.15] }
      }
      transition={
        still
          ? undefined
          : { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
      }
    />
  );
}

function BulbRow({
  count,
  vertical = false,
  still,
  className,
}: {
  count: number;
  vertical?: boolean;
  still: boolean;
  className: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`absolute flex justify-between ${
        vertical ? "flex-col" : ""
      } ${className}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <Bulb key={i} phase={(i % 2) as 0 | 1} still={still} />
      ))}
    </div>
  );
}

// Shown while the admin session is being verified. The company name powers on
// letter by letter inside a marquee-lit billboard frame. Text only, no logo.
function AdminLoader() {
  const reduceMotion = useReducedMotion() ?? false;
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(
      () =>
        setMessageIndex((current) => (current + 1) % LOADER_MESSAGES.length),
      1600,
    );
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <div
      role="status"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#04111d] px-4 text-white"
      style={{
        backgroundImage:
          "radial-gradient(rgba(125,211,252,0.12) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <span className="sr-only">
        Loading the admin portal for {COMPANY_NAME}
      </span>

      {/* Soft glow behind the sign */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-3xl"
      />

      <div className="relative w-full max-w-3xl">
        <div className="relative rounded-2xl border border-cyan-300/25 bg-[#071b2e]/80 px-8 py-12 backdrop-blur-sm sm:px-16 sm:py-16">
          {/* Marquee bulbs around the frame */}
          <BulbRow
            count={15}
            still={reduceMotion}
            className="inset-x-5 top-2"
          />
          <BulbRow
            count={15}
            still={reduceMotion}
            className="inset-x-5 bottom-2"
          />
          <BulbRow
            count={5}
            vertical
            still={reduceMotion}
            className="inset-y-5 left-2"
          />
          <BulbRow
            count={5}
            vertical
            still={reduceMotion}
            className="inset-y-5 right-2"
          />

          {/* The name, powering on like neon, with a light sweep across it */}
          <div className="relative overflow-hidden px-2 py-3 text-center">
            <div
              aria-hidden="true"
              className="flex justify-center text-[clamp(1.9rem,7.5vw,4.25rem)] font-extrabold leading-none tracking-[0.06em]"
              style={{ textShadow: "0 0 18px rgba(34,211,238,0.55)" }}
            >
              {NAME_MAIN.split("").map((char, i) => (
                <motion.span
                  key={i}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : { opacity: [0, 1, 0.25, 1, 0.55, 1] }
                  }
                  transition={{
                    duration: 0.9,
                    delay: 0.3 + i * 0.14,
                    times: [0, 0.2, 0.35, 0.55, 0.7, 1],
                  }}
                >
                  {char}
                </motion.span>
              ))}
            </div>

            <motion.p
              aria-hidden="true"
              className="mt-4 text-[clamp(0.55rem,2.1vw,0.95rem)] font-medium tracking-[0.32em] text-cyan-200"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.8 }}
            >
              {NAME_SUB}
            </motion.p>

            {!reduceMotion && (
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1/4 -skew-x-[20deg] bg-gradient-to-r from-transparent via-white/25 to-transparent"
                initial={{ x: "-150%" }}
                animate={{ x: "480%" }}
                transition={{
                  duration: 1.8,
                  delay: 2.2,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatDelay: 1.4,
                }}
              />
            )}
          </div>

          {/* Segmented LED progress, lit in a rolling wave */}
          <div
            aria-hidden="true"
            className="mx-auto mt-10 flex w-full max-w-xs gap-1"
          >
            {Array.from({ length: 14 }, (_, i) => (
              <motion.span
                key={i}
                className="h-2 flex-1 rounded-[2px] bg-cyan-300"
                initial={{ opacity: 0.15 }}
                animate={
                  reduceMotion
                    ? { opacity: i < 7 ? 1 : 0.15 }
                    : { opacity: [0.15, 1, 0.15] }
                }
                transition={
                  reduceMotion
                    ? undefined
                    : {
                        duration: 1.6,
                        repeat: Infinity,
                        delay: i * 0.09,
                        ease: "easeInOut",
                      }
                }
              />
            ))}
          </div>

          {/* Status ticker */}
          <div
            aria-hidden="true"
            className="mt-4 flex h-5 items-center justify-center overflow-hidden text-sm text-cyan-100/80"
          >
            <AnimatePresence mode="wait">
              <motion.p
                key={messageIndex}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {LOADER_MESSAGES[messageIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * SECTION: Sidebar
 * Nakagrupo sa dropdowns (My Workspace, Company Tools, Settings).
 * Ang group na kinaroroonan mo ay kusang bukas. Kapag naka-collapse ang
 * sidebar sa desktop, icons lang ang makikita at lahat ng items ay laging
 * nakalabas (walang dropdown).
 *
 * May search bar sa taas ng menu: sinasala nito ang lahat ng items (label o
 * section name). Habang may tina-type, lahat ng groups ay bukas at ang
 * tugma lang ang ipinapakita. Enter = buksan ang unang resulta, Esc = clear.
 * Kapag collapsed sa desktop, icon button ang lalabas na nag-e-expand ng
 * sidebar at nagfo-focus sa search.
 *
 * Ang items na may `standby: true` sa lib/admin-navigation.ts ay naka-lock:
 * greyed out, may lock icon, at hindi clickable.
 * ========================================================================== */

function Sidebar({
  pathname,
  search,
  isOpen,
  collapsed,
  onClose,
  onToggleCollapsed,
  onLogout,
  permissionKeys,
  isSuperadmin,
  pendingGovIdCount,
  anniversaryCount,
  pendingApprovalCount,
}: {
  pathname: string;
  search: string;
  isOpen: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapsed: () => void;
  onLogout: () => void;
  permissionKeys: string[];
  isSuperadmin: boolean;
  pendingGovIdCount: number;
  anniversaryCount: number;
  pendingApprovalCount: number;
}) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const isActive = (href: string) => {
    const [path, query = ""] = href.split("?");
    if (!(pathname === path || pathname.startsWith(`${path}/`))) return false;
    const want = new URLSearchParams(query).get("tab");
    const have = new URLSearchParams(search).get("tab");
    return want ? have === want : !have;
  };

  const groups = getNavGroups(permissionKeys, isSuperadmin);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Search: match sa label ng item o sa pangalan ng section.
  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;
  const visibleGroups = searching
    ? groups
        .map((group) => ({
          ...group,
          sections: group.sections
            .map((section) => ({
              ...section,
              items: section.items.filter(
                (item) =>
                  item.label.toLowerCase().includes(normalizedQuery) ||
                  section.title.toLowerCase().includes(normalizedQuery),
              ),
            }))
            .filter((section) => section.items.length > 0),
        }))
        .filter((group) => group.sections.length > 0)
    : groups;

  const clearSearch = () => {
    setQuery("");
    searchInputRef.current?.focus();
  };

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Escape") {
      if (query) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
      }
      return;
    }
    if (event.key === "Enter") {
      const first = visibleGroups
        .flatMap((group) => group.sections)
        .flatMap((section) => section.items)
        .find((item) => !item.standby);
      if (first) {
        event.preventDefault();
        router.push(first.href);
        setQuery("");
        onClose();
      }
    }
  };

  // Collapsed (desktop): expand the sidebar, then focus the search input.
  const handleOpenSearch = () => {
    onToggleCollapsed();
    window.setTimeout(() => searchInputRef.current?.focus(), 320);
  };

  // Kusang bubukas ang group na kinaroroonan mo (hindi kasama ang locked items).
  const activeGroupKey = groups.find((group) =>
    group.sections.some((section) =>
      section.items.some((item) => !item.standby && isActive(item.href)),
    ),
  )?.key;

  useEffect(() => {
    if (!activeGroupKey) return;
    setOpenGroups((current) =>
      current[activeGroupKey]
        ? current
        : { ...current, [activeGroupKey]: true },
    );
  }, [activeGroupKey]);

  const toggleGroup = (key: string) =>
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }));

  const renderItem = ({ href, label, icon: Icon, standby }: NavItem) => {
    // Locked (standby) item: hindi Link, kaya hindi clickable at hindi
    // nagpe-prefetch.
    if (standby) {
      return (
        <span
          key={href}
          aria-disabled="true"
          title={collapsed ? `${label} (Coming soon)` : "Coming soon"}
          className={`flex cursor-not-allowed select-none items-center gap-2.5 rounded-md px-3 py-2 text-sm leading-tight text-cyan-100/40 ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          }`}
        >
          <Icon size={16} className="shrink-0" />
          <span className={collapsed ? "lg:hidden" : ""}>{label}</span>
          <Lock
            size={12}
            aria-hidden="true"
            className={`ml-auto shrink-0 ${collapsed ? "lg:hidden" : ""}`}
          />
        </span>
      );
    }

    const showPendingDot = href === MASTERFILE_HREF && pendingGovIdCount > 0;
    const pendingText = `${pendingGovIdCount} employee${
      pendingGovIdCount === 1 ? "" : "s"
    } with pending gov IDs`;
    const showAnniversaryDot = href === MASTERFILE_HREF && anniversaryCount > 0;
    const anniversaryText = `${anniversaryCount} work anniversar${
      anniversaryCount === 1 ? "y" : "ies"
    } today`;
    const showApprovalDot =
      href === FOR_APPROVAL_HREF && pendingApprovalCount > 0;
    const approvalText = `${pendingApprovalCount} request${
      pendingApprovalCount === 1 ? "" : "s"
    } waiting for your approval`;
    const hints = [
      showPendingDot ? pendingText : null,
      showAnniversaryDot ? anniversaryText : null,
      showApprovalDot ? approvalText : null,
    ].filter(Boolean);

    return (
      <Link
        key={href}
        href={href}
        title={
          hints.length > 0
            ? `${label} — ${hints.join(" · ")}`
            : collapsed
              ? label
              : undefined
        }
        onClick={() => {
          setQuery("");
          onClose();
        }}
        className={`relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
          isActive(href)
            ? "bg-cyan-600 text-white"
            : "text-cyan-100 hover:bg-cyan-800/50"
        } ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
      >
        <span className="relative shrink-0">
          <Icon size={16} className="shrink-0" />
          {/* Collapsed (desktop only): dot on the icon corner */}
          {showPendingDot && (
            <span
              aria-hidden="true"
              className={`absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-red-500 ring-2 ring-cyan-900 ${
                collapsed ? "lg:block" : ""
              }`}
            />
          )}
          {showAnniversaryDot && (
            <span
              aria-hidden="true"
              className={`absolute -bottom-1 -right-1 hidden h-2 w-2 rounded-full bg-amber-400 ring-2 ring-cyan-900 ${
                collapsed ? "lg:block" : ""
              }`}
            />
          )}
          {showApprovalDot && (
            <span
              aria-hidden="true"
              className={`absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-red-500 ring-2 ring-cyan-900 ${
                collapsed ? "lg:block" : ""
              }`}
            />
          )}
        </span>
        <span className={collapsed ? "lg:hidden" : ""}>{label}</span>

        {/* Expanded (and mobile drawer): dot at the end of the row */}
        {(showPendingDot || showAnniversaryDot || showApprovalDot) && (
          <span
            className={`ml-auto flex items-center gap-1.5 ${
              collapsed ? "lg:hidden" : ""
            }`}
          >
            {showAnniversaryDot && (
              <span
                role="status"
                aria-label={anniversaryText}
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400"
              />
            )}
            {showPendingDot && (
              <span
                role="status"
                aria-label={pendingText}
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"
              />
            )}
            {showApprovalDot && (
              <span
                role="status"
                aria-label={approvalText}
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"
              />
            )}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        id="admin-sidebar"
        data-admin-sidebar
        data-sidebar-collapsed={collapsed}
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-64 flex-col overflow-hidden bg-gradient-to-b from-cyan-900 to-blue-900 text-white shadow-lg transition-[transform,width,visibility] duration-300 ease-in-out dark:from-cyan-950 dark:to-blue-950 ${
          isOpen
            ? "visible translate-x-0 pointer-events-auto"
            : "invisible -translate-x-full pointer-events-none lg:!visible lg:!translate-x-0 lg:!pointer-events-auto"
        } ${collapsed ? "lg:w-[4.5rem]" : "lg:w-64"}`}
      >
        <div
          className={`flex items-center border-b border-cyan-700/50 p-4 ${
            collapsed ? "justify-between lg:justify-center" : "justify-between"
          }`}
        >
          <h1
            className={`text-lg font-bold text-cyan-300 ${
              collapsed ? "lg:hidden" : ""
            }`}
          >
            Admin
          </h1>

          <button
            type="button"
            aria-label="Close sidebar"
            aria-expanded={isOpen}
            aria-controls="admin-sidebar"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 lg:hidden"
          >
            <X size={20} />
          </button>

          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar"
            onClick={() => {
              setQuery("");
              onToggleCollapsed();
            }}
            className="hidden rounded-lg p-1 hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 lg:inline-flex"
          >
            {collapsed ? (
              <PanelLeftOpen size={20} />
            ) : (
              <PanelLeftClose size={20} />
            )}
          </button>
        </div>

        {/* Menu search */}
        <div className="border-b border-cyan-700/50 px-3 py-3">
          {/* Collapsed (desktop only): icon button that expands + focuses search */}
          {collapsed && (
            <button
              type="button"
              aria-label="Search menu"
              title="Search menu"
              onClick={handleOpenSearch}
              className="mx-auto hidden h-9 w-9 items-center justify-center rounded-md text-cyan-100 hover:bg-cyan-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 lg:flex"
            >
              <Search size={16} />
            </button>
          )}

          <div className={`relative ${collapsed ? "lg:hidden" : ""}`}>
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300/70"
            />
            <input
              ref={searchInputRef}
              type="text"
              role="searchbox"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search menu..."
              aria-label="Search menu"
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-md border border-cyan-700/60 bg-cyan-950/40 pl-8 pr-8 text-sm text-white placeholder:text-cyan-200/50 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-cyan-200 hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <nav
          aria-label="Admin navigation"
          className={`min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 ${
            collapsed ? "lg:px-0" : ""
          }`}
        >
          {searching && visibleGroups.length === 0 && (
            <p
              role="status"
              className={`px-3 py-2 text-sm text-cyan-200/70 ${
                collapsed ? "lg:hidden" : ""
              }`}
            >
              No menu found for &ldquo;{query.trim()}&rdquo;
            </p>
          )}

          {visibleGroups.map((group, index) => {
            const GroupIcon = group.icon;
            // Habang naghahanap, laging bukas ang lahat ng may resulta.
            const open = searching || Boolean(openGroups[group.key]);
            const groupHasMasterfile = group.sections.some((section) =>
              section.items.some((item) => item.href === MASTERFILE_HREF),
            );
            // Dot sa header habang nakasara ang group, para hindi mawala ang hint.
            const headerPending =
              !open && groupHasMasterfile && pendingGovIdCount > 0;
            const headerAnniversary =
              !open &&
              groupHasMasterfile &&
              anniversaryCount > 0 &&
              !headerPending;
            const groupHasApproval = group.sections.some((section) =>
              section.items.some((item) => item.href === FOR_APPROVAL_HREF),
            );
            const headerApproval =
              !open && groupHasApproval && pendingApprovalCount > 0;
            const panelId = `nav-group-${group.key}`;

            return (
              <div
                key={group.key}
                className={
                  collapsed && index > 0
                    ? "lg:mt-2 lg:border-t lg:border-cyan-700/40 lg:pt-2"
                    : ""
                }
              >
                {/* Group header (dropdown toggle). Nakatago sa collapsed desktop. */}
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggleGroup(group.key)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-semibold text-cyan-300 hover:bg-cyan-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                    collapsed ? "lg:hidden" : ""
                  }`}
                >
                  <GroupIcon size={16} className="shrink-0" />
                  <span className="flex-1">{group.title}</span>
                  {(headerPending || headerAnniversary || headerApproval) && (
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        headerPending || headerApproval
                          ? "bg-red-500"
                          : "bg-amber-400"
                      }`}
                    />
                  )}
                  <ChevronDown
                    aria-hidden="true"
                    size={16}
                    className={`shrink-0 text-cyan-400 transition-transform duration-200 ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Items. Sa collapsed desktop, laging nakalabas. */}
                <div
                  id={panelId}
                  className={`${open ? "block" : "hidden"} ${
                    collapsed ? "lg:block" : ""
                  } ${
                    collapsed
                      ? ""
                      : "ml-3 mt-0.5 space-y-0.5 border-l border-cyan-700/50 pl-2"
                  }`}
                >
                  {group.sections.map((section) => (
                    <div key={section.title} className="space-y-0.5">
                      {group.subLabels && (
                        <p
                          className={`px-3 pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-cyan-400/70 ${
                            collapsed ? "lg:hidden" : ""
                          }`}
                        >
                          {section.title}
                        </p>
                      )}
                      {section.items.map(renderItem)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-cyan-700/50 px-3 py-3">
          {isSuperadmin && (
            <Link
              href="/admin/settings"
              title={collapsed ? "Settings" : undefined}
              aria-label={collapsed ? "Settings" : undefined}
              onClick={onClose}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                isActive("/admin/settings")
                  ? "bg-cyan-600 text-white"
                  : "text-cyan-100 hover:bg-cyan-800/50"
              } ${collapsed ? "lg:px-0" : ""}`}
            >
              <Settings size={16} className="shrink-0" />
              <span className={collapsed ? "lg:hidden" : ""}>Settings</span>
            </Link>
          )}
          <Button
            onClick={onLogout}
            aria-label={collapsed ? "Logout" : undefined}
            title={collapsed ? "Logout" : undefined}
            className={`flex h-9 w-full items-center justify-center gap-2 bg-red-600 text-white hover:bg-red-700 ${
              collapsed ? "lg:px-0" : ""
            }`}
          >
            <LogOut size={16} />
            <span className={collapsed ? "lg:hidden" : ""}>Logout</span>
          </Button>
        </div>
      </aside>
    </>
  );
}

/* ============================================================================
 * SECTION: Top bar
 * ========================================================================== */
const timeAgo = (ts: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function NotificationBell({
  notifications,
  onRead,
  onReadAll,
}: {
  notifications: ApprovalNotif[];
  onRead: (key: string) => void;
  onReadAll: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Notifications
            </p>
            <button
              type="button"
              disabled={unread === 0}
              onClick={onReadAll}
              className="text-xs font-medium text-cyan-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 dark:text-cyan-400"
            >
              Mark all as read
            </button>
          </div>

          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {notifications.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-slate-500">
                No pending requests.
              </li>
            ) : (
              notifications.map((n) => (
                <li key={n.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onRead(n.key);
                      setOpen(false);
                      router.push("/admin/for-approval");
                    }}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      n.read ? "" : "bg-cyan-50/60 dark:bg-cyan-950/30"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.read ? "bg-transparent" : "bg-red-500"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                        {n.kind === "ot"
                          ? "New overtime request"
                          : "New leave request"}
                      </span>
                      <span className="block text-sm text-slate-600 dark:text-slate-300">
                        {n.message}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {timeAgo(n.at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/admin/for-approval");
            }}
            className="w-full border-t border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-cyan-700 hover:bg-slate-50 dark:border-slate-700 dark:text-cyan-400 dark:hover:bg-slate-800"
          >
            Open For Approval
          </button>
        </div>
      )}
    </div>
  );
}

function TopBar({
  sidebarOpen,
  onOpenSidebar,
  pathname,
  pendingGovIdCount,
  anniversaryCount,
  pendingApprovalCount,
  notifications,
  onReadNotification,
  onReadAllNotifications,
  showNotifications,
}: {
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  pathname: string;
  pendingGovIdCount: number;
  anniversaryCount: number;
  pendingApprovalCount: number;
  notifications: ApprovalNotif[];
  onReadNotification: (key: string) => void;
  onReadAllNotifications: () => void;
  showNotifications: boolean;
}) {
  const pageItems = getAuthorizedNavSections([], true)
    .flatMap((section) => section.items)
    .sort((left, right) => right.href.length - left.href.length);
  const pageTitle = pathname.startsWith("/admin/settings")
    ? "Settings"
    : (pageItems.find((item) => {
        const p = item.href.split("?")[0];
        return pathname === p || pathname.startsWith(`${p}/`);
      })?.label ?? "Admin");

  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 py-4 flex items-center justify-between">
      <button
        type="button"
        aria-label="Open sidebar"
        aria-expanded={sidebarOpen}
        aria-controls="admin-sidebar"
        onClick={onOpenSidebar}
        className="relative rounded-lg p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
      >
        <Menu size={20} />
        {/* Mobile: hint na may pending sa loob ng drawer */}
        {(pendingGovIdCount > 0 ||
          anniversaryCount > 0 ||
          pendingApprovalCount > 0) && (
          <span
            aria-hidden="true"
            className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-slate-900 ${
              pendingGovIdCount > 0 || pendingApprovalCount > 0
                ? "bg-red-500"
                : "bg-amber-400"
            }`}
          />
        )}
      </button>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {pageTitle}
        </span>
        {showNotifications && (
          <NotificationBell
            notifications={notifications}
            onRead={onReadNotification}
            onReadAll={onReadAllNotifications}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * MAIN SHELL
 * Handles auth gating + composes Sidebar / TopBar / page content.
 * Ginagamit ng app/admin/layout.tsx (server component na may metadata).
 * ========================================================================== */

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [pendingGovIdCount, setPendingGovIdCount] = useState(0);
  const [anniversaryCount, setAnniversaryCount] = useState(0);

  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  // Para lang mag-fetch ng pending count ang may access sa masterfile.
  const masterfileDirectory = getDirectoryKeyForHref(MASTERFILE_HREF);
  const hasMasterfileAccess =
    isSuperadmin ||
    (masterfileDirectory
      ? hasDirectoryAccess(permissionKeys, masterfileDirectory)
      : false);

  // Dot sa "For Approval": bilang ng pending OT/leave na naka-assign sa user.
  // Kapag walang directory key ang item, ituring na bukas sa lahat.
  const approvalDirectory = getDirectoryKeyForHref(FOR_APPROVAL_HREF);
  const hasApprovalAccess =
    isSuperadmin ||
    (approvalDirectory
      ? hasDirectoryAccess(permissionKeys, approvalDirectory)
      : true);
  const {
    count: pendingApprovalCount,
    notifications,
    markRead,
    markAllRead,
  } = useApprovalNotifications(isAuthenticated && hasApprovalAccess);

  // Same permission the push-subscription route requires (my_tasks "view").
  const canReceiveTaskPush =
    isSuperadmin || hasDirectoryAccess(permissionKeys, "my_tasks");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin_sidebar_collapsed");
      setCollapsed(saved === null ? window.innerWidth < 1280 : saved === "1");
      localStorage.removeItem("adminToken");
    } catch (error) {
      console.warn("Unable to restore the admin sidebar preference.", error);
    }
  }, []);

  // Apply the saved theme on every admin page (not only when toggling in Settings).
  useEffect(() => {
    try {
      document.documentElement.classList.toggle(
        "dark",
        localStorage.getItem(THEME_KEY) === "dark",
      );
    } catch {
      /* ignore */
    }
    // Leaving the admin area removes dark mode so other parts of the site are unaffected.
    return () => document.documentElement.classList.remove("dark");
  }, []);

  const handleToggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem("admin_sidebar_collapsed", next ? "1" : "0");
      } catch (error) {
        console.warn("Unable to save the admin sidebar preference.", error);
      }
      return next;
    });
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const body = document.body;
    const originalOverflow = body.style.overflow;
    const desktopBreakpoint = window.matchMedia("(min-width: 1024px)");
    const syncScrollLock = () => {
      body.style.overflow = desktopBreakpoint.matches
        ? originalOverflow
        : "hidden";
    };

    syncScrollLock();
    desktopBreakpoint.addEventListener("change", syncScrollLock);

    return () => {
      desktopBreakpoint.removeEventListener("change", syncScrollLock);
      body.style.overflow = originalOverflow;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (pathname === "/admin/login") {
      setIsChecking(false);
      return;
    }

    let active = true;
    const checkSession = async () => {
      try {
        const response = await fetch("/api/admin/session", {
          cache: "no-store",
        });
        if (!response.ok) {
          if (active) {
            localStorage.removeItem("adminSessionActive");
            router.replace("/admin/login");
          }
          return;
        }
        const session = await response.json();
        if (!active) return;

        const keys = (session.permissions || []).map(
          (permission: { key: string }) => permission.key,
        );
        setPermissionKeys(keys);
        setIsSuperadmin(session.is_superadmin === true);
        localStorage.setItem("adminSessionActive", "1");
        setIsAuthenticated(true);
        setIsChecking(false);

        // Everyone (except superadmin) lands on their own role dashboard
        // (hr, accounting, employee, admin). This used to jump to the first
        // directory they could open, which is why employees ended up on
        // Website Directory.
        if (pathname === "/admin/dashboard" && !session.is_superadmin) {
          router.replace(dashboardPathFor(session));
        }

        const currentPath = NAV_SECTIONS.flatMap((section) => section.items)
          .map((item) => item.href.split("?")[0])
          .concat(ADMIN_NAV_ITEMS.map((item) => item.href))
          .sort((left, right) => right.length - left.length)
          .find((href) => pathname === href || pathname.startsWith(`${href}/`));
        const currentDirectory = currentPath
          ? getDirectoryKeyForHref(currentPath)
          : undefined;
        if (
          currentDirectory &&
          !session.is_superadmin &&
          !hasDirectoryAccess(keys, currentDirectory)
        ) {
          router.replace("/admin/dashboard");
        }
      } catch {
        if (active) {
          localStorage.removeItem("adminSessionActive");
          router.replace("/admin/login");
        }
      }
    };

    void checkSession();
    const refreshTimer = window.setInterval(checkSession, 30000);
    window.addEventListener("focus", checkSession);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", checkSession);
    };
  }, [pathname, router]);

  // Red dot sa sidebar: ilan ang employees na may kulang na gov ID.
  useEffect(() => {
    if (!isAuthenticated || !hasMasterfileAccess) {
      setPendingGovIdCount(0);
      setAnniversaryCount(0);
      return;
    }

    let active = true;

    const loadPending = async () => {
      try {
        const response = await fetch("/api/employee-masterfile", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const json = await response.json();
        if (!active) return;

        const employees: Record<string, unknown>[] = Array.isArray(json?.data)
          ? json.data
          : [];

        const count = employees.filter(
          (employee) =>
            (!COUNT_ONLY_ACTIVE ||
              String(employee.status ?? "")
                .trim()
                .toLowerCase() === "active") &&
            GOV_ID_KEYS.some((key) => !String(employee[key] ?? "").trim()),
        ).length;

        setPendingGovIdCount(count);

        // Work anniversaries today (Active employees lang, base sa date_hired)
        setAnniversaryCount(
          employees.filter(
            (employee) =>
              String(employee.status ?? "")
                .trim()
                .toLowerCase() === "active" &&
              isAnniversaryToday(employee.date_hired),
          ).length,
        );
      } catch {
        // Huwag i-crash ang shell dahil lang sa badge.
      }
    };

    void loadPending();
    const timer = window.setInterval(loadPending, 60000);
    window.addEventListener("focus", loadPending);
    // Puwedeng i-trigger ng masterfile page pagkatapos mag-save:
    // window.dispatchEvent(new Event("masterfile:changed"));
    window.addEventListener("masterfile:changed", loadPending);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", loadPending);
      window.removeEventListener("masterfile:changed", loadPending);
    };
  }, [isAuthenticated, hasMasterfileAccess, pathname]);

  const handleLogout = async () => {
    await fetch("/api/admin/session", { method: "DELETE" });

    // Linisin ang service worker caches para walang matirang admin data sa device.
    try {
      if ("caches" in window) {
        await Promise.all(
          ["apis", "pages", "pages-rsc", "pages-rsc-prefetch"].map((name) =>
            caches.delete(name),
          ),
        );
      }
    } catch {
      // ignore
    }

    // Next login should re-send this device's push subscription.
    try {
      sessionStorage.removeItem("task_push_sent");
    } catch {
      // ignore
    }

    localStorage.removeItem("adminSessionActive");
    setIsAuthenticated(false);
    router.replace("/admin/login");
  };

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (isChecking || !isAuthenticated) {
    return <AdminLoader />;
  }

  return (
    <div className="fixed inset-x-0 top-0 flex h-dvh overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Auto-subscribes this device to task push notifications after login */}
      <AutoPushSubscribe enabled={canReceiveTaskPush} />

      <Sidebar
        pathname={pathname}
        search={search}
        isOpen={sidebarOpen}
        collapsed={collapsed}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapsed={handleToggleCollapsed}
        onLogout={handleLogout}
        permissionKeys={permissionKeys}
        isSuperadmin={isSuperadmin}
        pendingGovIdCount={pendingGovIdCount}
        anniversaryCount={anniversaryCount}
        pendingApprovalCount={pendingApprovalCount}
      />

      <main
        data-admin-main
        data-sidebar-collapsed={collapsed}
        className={`h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain transition-[padding] duration-300 ease-in-out ${
          collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64"
        }`}
      >
        <TopBar
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          pathname={pathname}
          pendingGovIdCount={hasMasterfileAccess ? pendingGovIdCount : 0}
          anniversaryCount={hasMasterfileAccess ? anniversaryCount : 0}
          pendingApprovalCount={pendingApprovalCount}
          notifications={notifications}
          onReadNotification={markRead}
          onReadAllNotifications={markAllRead}
          showNotifications={hasApprovalAccess}
        />
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
