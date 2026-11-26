import {
  Award,
  BadgeCheck,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileCheck,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  Flag,
  FolderOpen,
  FolderUp,
  Gift,
  History,
  Home,
  Hourglass,
  IdCard,
  ListChecks,
  Mail,
  Map,
  Megaphone,
  MessageSquare,
  Package,
  PackageCheck,
  Palette,
  Plane,
  Receipt,
  Search,
  SearchCheck,
  Settings,
  Ticket,
  TrendingUp,
  UserCheck,
  Users,
  UsersRound,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/* ============================================================================
 * TYPES
 * ========================================================================== */

export type NavAccess =
  /** Any signed-in user. No directory permission needed. */
  | "everyone"
  /** Superadmin only. */
  | "superadmin"
  /** HR/Admin only (plus the usual directory permission). */
  | "hr";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Omit for the default: visible when the user has the directory permission. */
  access?: NavAccess;
  /**
   * NEW: Show the item if the user has ANY of these directory permissions
   * (used by pages that combine several directories into tabs).
   */
  anyOf?: string[];
  /**
   * Page not built yet (standby). The item still shows in the sidebar, but
   * the sidebar should render it locked/disabled and not navigate.
   * Remove the flag once the page is ready.
   */
  standby?: boolean;
  /**
   * Reachable from somewhere else (e.g. a button on the Settings page), so it
   * is NOT shown in the sidebar. It stays in this config so its directory
   * permission, page title and access rules keep working.
   */
  hidden?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface NavGroup {
  key: string;
  title: string;
  icon: LucideIcon;
  /** Show each section title as a sub label inside the dropdown. */
  subLabels: boolean;
  sections: NavSection[];
}

/* ============================================================================
 * SIDEBAR STRUCTURE
 * Edit this one block to move, add or rename anything in the sidebar.
 * ========================================================================== */

const NAV_GROUP_CONFIG: NavGroup[] = [
  {
    key: "my_workspace",
    title: "My Workspace",
    icon: Home,
    subLabels: true,
    sections: [
      {
        title: "Home",
        items: [
          {
            href: "/admin/dashboard",
            label: "Home",
            icon: Home,
            access: "everyone",
          },
        ],
      },
      {
        title: "Tasks",
        items: [
          { href: "/admin/my-tasks", label: "My Tasks", icon: ListChecks },
          {
            href: "/admin/task-management",
            label: "Assign & Monitor Tasks",
            icon: ClipboardList,
          },
        ],
      },
      {
        title: "My Requests",
        items: [
          { href: "/admin/my-leave", label: "My Leave", icon: CalendarRange },
          {
            href: "/admin/my-overtime",
            label: "My Overtime",
            icon: Hourglass,
          },
          { href: "/admin/my-coe", label: "My COE", icon: FileText },
          {
            href: "/admin/my-evaluation",
            label: "My Evaluation",
            icon: ClipboardCheck,
          },
          // Employee side of Item Replacement (company ID / polo shirt).
          {
            href: "/admin/my-company-items",
            label: "My Company Items",
            icon: Package,
          },
        ],
      },
      {
        title: "My Employment",
        items: [
          {
            href: "/admin/my-milestones",
            label: "My Milestones",
            icon: Flag,
            access: "everyone",
          },
          {
            href: "/admin/my-leave-credits",
            label: "Leave Credits",
            icon: Plane,
            access: "everyone",
          },
          {
            href: "/admin/my-clearance",
            label: "My Clearance",
            icon: ClipboardCheck,
            access: "everyone",
            hidden: true,
          },
          {
            href: "/admin/my-profile",
            label: "My Profile",
            icon: IdCard,
            access: "everyone",
          },
        ],
      },
      {
        title: "Approvals",
        items: [
          {
            href: "/admin/for-approval",
            label: "For Approval",
            icon: BadgeCheck,
            access: "hr",
          },
        ],
      },
    ],
  },

  {
    key: "company_tools",
    title: "Company Tools",
    icon: Building2,
    subLabels: true,
    sections: [
      {
        title: "HR",
        items: [
          { href: "/admin/masterfile", label: "Employees", icon: Users },
          {
            href: "/admin/employee-files",
            label: "201 Files",
            icon: FolderUp,
            access: "hr",
          },

          { href: "/admin/careers", label: "Hiring", icon: UsersRound },
          // Job descriptions used as the Annex of the job offer (.docx).
          {
            href: "/admin/job-descriptions",
            label: "Job Offer / Descriptions",
            icon: FileSignature,
            access: "superadmin",
          },
          {
            href: "/admin/timekeeping",
            label: "Timekeeping",
            icon: Fingerprint,
          },
          // CHANGED: one page with two tabs (Tardiness + Leave Monitoring).
          // Visible if the user has either directory. The Leave Monitoring
          // tab itself is still HR/admin only (checked inside the page).
          {
            href: "/admin/attendance-monitoring",
            label: "Attendance Monitoring",
            icon: Clock,
            anyOf: ["tardiness", "leave_requests"],
          },
          // REMOVED: "/admin/leave-request" (Leave Monitoring). It is now a
          // tab inside Attendance Monitoring.
          {
            href: "/admin/evaluation-monitoring",
            label: "Evaluations",
            icon: Award,
          },

          {
            href: "/admin/leave-credits",
            label: "Leave Credits",
            icon: CalendarClock,
          },
          // {
          //   href: "/admin/employee-clearance-form",
          //   label: "Employee Documents",
          //   icon: ClipboardCheck,
          //   access: "hr",
          //   standby: true,
          // },
          {
            href: "/admin/coe-requests",
            label: "COE Requests",
            icon: FileCheck,
            access: "hr",
          },

          // OJT Attendance: commented out for now. Uncomment to restore
          // (and re-import CalendarCheck from lucide-react).
          // {
          //   href: "/admin/attendance",
          //   label: "OJT Attendance",
          //   icon: CalendarCheck,
          // },
        ],
      },
      {
        title: "Payroll",
        items: [
          { href: "/admin/payroll", label: "Payroll", icon: Banknote },
          // {
          //   href: "/admin/payroll?tab=payslip",
          //   label: "Payslip",
          //   icon: FileText,
          // },
          {
            href: "/admin/payroll?tab=history",
            label: "History",
            icon: History,
          },
          {
            href: "/admin/payroll?tab=contributions",
            label: "Government References",
            icon: Building2,
          },
          {
            href: "/admin/contracts",
            label: "Commissions",
            icon: FileSignature,
            // standby: true,
          },
          {
            href: "/admin/13thmonth",
            label: "13th Month Pay",
            icon: Gift,
          },
          {
            href: "/admin/final-pay",
            label: "Final Pay",
            icon: Wallet,
            standby: true,
          },
        ],
      },
      {
        title: "Office",
        items: [
          // {
          //   href: "/admin/company-items",
          //   label: "Company Items",
          //   icon: Package,
          //   standby: true,
          // },

          {
            href: "/admin/general-calendar",
            label: "General Calendar",
            icon: CalendarDays,
            access: "superadmin",
          },

          {
            href: "/admin/office-supply",
            label: "Office Supplies",
            icon: Boxes,
          },
          {
            href: "/admin/invoice",
            label: "Invoices",
            icon: Receipt,
          },
          {
            href: "/admin/quotation",
            label: "Quotations",
            icon: FileSpreadsheet,
          },
          {
            href: "/admin/item-replacement",
            label: "Company Item Replacement",
            icon: PackageCheck,
          },
        ],
      },
      {
        title: "INFINITECH WEBSITE",
        items: [
          {
            href: "/admin/website-directory",
            label: "Leads",
            icon: FolderOpen,
          },
          { href: "/admin/inquiries", label: "Inquiries", icon: MessageSquare },
          {
            href: "/admin/website-audit",
            label: "Website Audit",
            icon: Search,
          },
          { href: "/admin/seo-audits", label: "SEO Audit", icon: SearchCheck },
          {
            href: "/admin/client-assessment",
            label: "Client Assessment",
            icon: UserCheck,
          },
          {
            href: "/admin/demo-requirements",
            label: "Demo Website Requirements",
            icon: FileCheck,
          },
          {
            href: "/admin/graphic-design",
            label: "Graphic Design",
            icon: Palette,
          },
          {
            href: "/admin/social-media-management",
            label: "Social Media Management",
            icon: Megaphone,
          },
          { href: "/admin/paid-ads", label: "Paid Ads", icon: TrendingUp },
          {
            href: "/admin/market-research",
            label: "Market Research",
            icon: BarChart3,
          },
          {
            href: "/admin/portal-demo",
            label: "Portal Demo",
            icon: FolderOpen,
          },
          {
            href: "/admin/tiktok-shop-opening",
            label: "TikTok Shop Opening",
            icon: TrendingUp,
          },
          { href: "/admin/blog", label: "Blog", icon: FileText },
          { href: "/admin/survey", label: "Survey", icon: ClipboardList },
          {
            href: "/admin/juantap-survey",
            label: "Juantap Survey",
            icon: IdCard,
          },
          { href: "/admin/video-survey", label: "Video Survey", icon: Video },
          {
            href: "/admin/support-tickets",
            label: "Support Tickets",
            icon: Ticket,
          },
        ],
      },
    ],
  },

  {
    // Not shown in the sidebar: every item below is hidden because Settings
    // already has its own link. Kept so directory permissions and page titles still work.
    key: "settings",
    title: "Settings",
    icon: Settings,
    subLabels: false,
    sections: [
      {
        title: "Settings",
        items: [
          // Opened from buttons on the Settings page (/admin/settings).
          {
            href: "/admin/access-management",
            label: "User Access",
            icon: Users,
            hidden: true,
          },
          {
            href: "/admin/roadmap",
            label: "System Roadmap",
            icon: Map,
            access: "superadmin",
            hidden: true,
          },
          {
            href: "/admin/audit-logs",
            label: "User Log",
            icon: History,
            hidden: true,
          },
          {
            href: "/admin/email-settings",
            label: "Email Settings",
            icon: Mail,
            standby: true,
            hidden: true,
          },
        ],
      },
    ],
  },
];

/* ============================================================================
 * DIRECTORY PERMISSIONS
 * ========================================================================== */

export const NAV_DIRECTORY_BY_HREF: Record<string, string> = {
  "/admin/masterfile": "employee_masterfile",
  "/admin/tardiness": "tardiness",
  // NEW: the combined page keeps using the existing "tardiness" permission,
  // so current users' access does not break.
  "/admin/attendance-monitoring": "tardiness",
  "/admin/timekeeping": "timekeeping",
  "/admin/website-directory": "website_directory",
  "/admin/inquiries": "inquiries",
  "/admin/website-audit": "website_audit",
  "/admin/seo-audits": "seo_audit",
  "/admin/client-assessment": "client_assessment",
  "/admin/demo-requirements": "demo_requirements",
  "/admin/graphic-design": "graphic_design",
  "/admin/social-media-management": "social_media_management",
  "/admin/paid-ads": "paid_ads",
  "/admin/market-research": "market_research",
  "/admin/blog": "blog",
  "/admin/contracts": "contracts",
  "/admin/careers": "careers",
  "/admin/survey": "survey",
  "/admin/juantap-survey": "juantap_survey",
  "/admin/video-survey": "video_survey",
  "/admin/support-tickets": "support_tickets",
  "/admin/employee-clearance-form": "clearance_form",
  "/admin/leave-request": "leave_requests",
  "/admin/my-leave": "my_leave",
  "/admin/my-overtime": "my_overtime",
  "/admin/my-evaluation": "my_evaluation",

  "/admin/attendance": "ojt_attendance",
  "/admin/portal-demo": "portal_demo",
  "/admin/tiktok-shop-opening": "tiktok_shop",
  "/admin/access-management": "user_access_management",
  "/admin/audit-logs": "system_audit_logs",
  "/admin/task-management": "task_management",
  "/admin/my-tasks": "my_tasks",
  "/admin/for-approval": "leave_requests",
  "/admin/coe-requests": "clearance_form",
  "/admin/my-coe": "my_coe",
  "/admin/payroll": "payroll",
  // New pages
  "/admin/evaluation-monitoring": "evaluations",
  "/admin/leave-credits": "leave_credits",
  "/admin/13thmonth": "thirteenth_month_pay",
  "/admin/final-pay": "final_pay",
  "/admin/company-items": "company_items",
  "/admin/office-supply": "office_supplies",
  "/admin/item-replacement": "item_replacement",
  "/admin/my-company-items": "my_item_replacement",
  "/admin/email-settings": "email_settings",
  "/admin/employee-files": "employee_files",
  "/admin/invoice": "invoice",
  "/admin/quotation": "quotation",
};

export const hasDirectoryAccess = (keys: string[], directory: string) =>
  keys.includes(directory) || keys.includes("all_directory");

// Pages with no directory permission. Their visibility is controlled by
// `access` on the item (and by middleware.ts for the superadmin-only pages).
const NO_DIRECTORY_HREFS = new Set([
  "/admin/dashboard",
  "/admin/roadmap",
  "/admin/general-calendar",
  "/admin/job-descriptions",
  "/admin/my-milestones",
  "/admin/my-leave-credits",
  "/admin/my-clearance",
  "/admin/my-profile",
]);

export function getDirectoryKeyForHref(rawHref: string): string | undefined {
  const href = rawHref.split("?")[0];
  if (href.endsWith("/dashboard") || NO_DIRECTORY_HREFS.has(href)) {
    return undefined;
  }
  return (
    NAV_DIRECTORY_BY_HREF[href] ||
    href.split("/").filter(Boolean).at(-1)?.replaceAll("-", "_")
  );
}

function getAdminNavigationDirectoryEntries() {
  const items = NAV_GROUP_CONFIG.flatMap((group) =>
    group.sections.flatMap((section) =>
      section.items.map((item) => ({
        href: item.href,
        label: item.label,
        module: section.title,
      })),
    ),
  );

  // Some pages share a directory key (e.g. Leave Monitoring and For Approval
  // both use "leave_requests"), so list each directory only once.
  const seen = new Set<string>();
  return items.flatMap(({ href, label, module }) => {
    const key = getDirectoryKeyForHref(href);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ key, label, module, href }];
  });
}

export function getAdminDirectoryEntries() {
  return getAdminNavigationDirectoryEntries().map(({ key, label, module }) => ({
    key,
    label,
    module,
  }));
}

export function getAdminDirectoryOptions() {
  return getAdminNavigationDirectoryEntries();
}

/* ============================================================================
 * BUILDING THE SIDEBAR
 * ========================================================================== */

function buildNavGroups(
  permissionKeys: string[],
  isSuperadmin: boolean,

  // Admin/HR = superadmin, or can EDIT leave_requests (or all_directory).
  // Everyone else (view + create only) is an employee.
  isAdminOrHr: boolean,
  includeHidden: boolean,
): NavGroup[] {
  // Don't trust the caller's flag alone (it defaults to true). A user only
  // counts as Admin/HR if they are superadmin, or the flag is true AND they
  // hold an HR-level directory (masterfile / leave monitoring / all access).
  const isHr =
    isSuperadmin ||
    (isAdminOrHr &&
      (hasDirectoryAccess(permissionKeys, "employee_masterfile") ||
        hasDirectoryAccess(permissionKeys, "leave_requests")));

  const canSee = (item: NavItem): boolean => {
    if (item.hidden && !includeHidden) return false;
    if (item.access === "superadmin") return isSuperadmin;
    if (item.access === "hr" && !isHr) return false;
    if (item.access === "everyone") return true;

    // NEW: combined pages show if the user has ANY of the listed directories.
    if (item.anyOf) {
      return (
        isSuperadmin ||
        item.anyOf.some((key) => hasDirectoryAccess(permissionKeys, key))
      );
    }

    const directory = getDirectoryKeyForHref(item.href);
    return (
      !directory ||
      isSuperadmin ||
      hasDirectoryAccess(permissionKeys, directory)
    );
  };

  return NAV_GROUP_CONFIG.map((group) => ({
    ...group,
    sections: group.sections
      .map((section) => ({
        ...section,
        // A non-HR user (e.g. a department head) must not see a section
        // labelled "HR".
        title: section.title === "HR" && !isHr ? "Department" : section.title,
        items: section.items.filter(canSee),
      }))
      .filter((section) => section.items.length > 0),
  })).filter((group) => group.sections.length > 0);
}

/** Sidebar groups. Hidden items (e.g. User Access, System Roadmap) are left out. */
export function getNavGroups(
  permissionKeys: string[],
  isSuperadmin: boolean,
  isAdminOrHr: boolean = true,
): NavGroup[] {
  return buildNavGroups(permissionKeys, isSuperadmin, isAdminOrHr, false);
}

/* ============================================================================
 * BACKWARD-COMPATIBLE EXPORTS
 * The old exports, now derived from NAV_GROUP_CONFIG so there is still only
 * one place to edit. Remove them once nothing imports them anymore.
 * ========================================================================== */

const ALL_NAV_ITEMS: NavItem[] = NAV_GROUP_CONFIG.flatMap((group) =>
  group.sections.flatMap((section) => section.items),
);

const findNavItem = (href: string): NavItem | undefined =>
  ALL_NAV_ITEMS.find((item) => item.href === href);

/** Dashboard, User Access, Activity Log, Roadmap, General Calendar. */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  "/admin/dashboard",
  "/admin/access-management",
  "/admin/audit-logs",
  "/admin/roadmap",
  "/admin/general-calendar",
]
  .map(findNavItem)
  .filter((item): item is NavItem => Boolean(item));

/** Admin-side sections (Approvals + everything under Company Tools). */
export const NAV_SECTIONS: NavSection[] = [
  ...NAV_GROUP_CONFIG.filter((group) => group.key === "my_workspace").flatMap(
    (group) =>
      group.sections.filter((section) => section.title === "Approvals"),
  ),
  ...NAV_GROUP_CONFIG.filter((group) => group.key === "company_tools").flatMap(
    (group) => group.sections,
  ),
];

/** Employee-side sections (My Workspace, without Home and Approvals). */
export const EMPLOYEE_NAV_SECTIONS: NavSection[] = NAV_GROUP_CONFIG.filter(
  (group) => group.key === "my_workspace",
)
  .flatMap((group) => group.sections)
  .filter(
    (section) => section.title !== "Home" && section.title !== "Approvals",
  );

// Flat list of authorized sections, INCLUDING hidden items (so page titles
// and similar lookups still find them). Kept for code that imports it.
export function getAuthorizedNavSections(
  permissionKeys: string[],
  isSuperadmin: boolean,
): NavSection[] {
  return buildNavGroups(permissionKeys, isSuperadmin, true, true).flatMap(
    (group) => group.sections,
  );
}
