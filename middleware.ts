// middleware.ts
import { NextRequest, NextResponse } from "next/server";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Authorization cache + retry + timeout
// Reduces calls (and DB connections) to Laravel on shared hosting.
// ---------------------------------------------------------------------------
const AUTH_TTL_MS = 20_000; // how long a successful auth result is reused
const AUTH_TIMEOUT_MS = 8_000; // per-attempt timeout
const AUTH_MAX_ATTEMPTS = 2; // 1 try + 1 retry on 5xx / network error
const AUTH_CACHE_MAX = 500; // safety cap on cache size

type AuthResult = { status: number; ok: boolean; body: any; exp: number };

const authCache = new Map<string, AuthResult>();
const inflight = new Map<string, Promise<AuthResult>>();

function pruneCache() {
  if (authCache.size < AUTH_CACHE_MAX) return;
  const now = Date.now();
  for (const [k, v] of authCache) {
    if (v.exp <= now) authCache.delete(k);
  }
  // still too big: drop the oldest entries
  if (authCache.size >= AUTH_CACHE_MAX) {
    const excess = authCache.size - AUTH_CACHE_MAX + 1;
    let i = 0;
    for (const k of authCache.keys()) {
      authCache.delete(k);
      if (++i >= excess) break;
    }
  }
}

async function fetchAuthOnce(
  url: string,
  token: string,
  needBody: boolean,
): Promise<AuthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    });
    let body: any = null;
    if (needBody && res.ok) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }
    return { status: res.status, ok: res.ok, body, exp: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function authorize(
  url: string,
  token: string,
  needBody: boolean,
): Promise<AuthResult> {
  const key = `${token}|${url}`;

  const hit = authCache.get(key);
  if (hit && hit.exp > Date.now() && (!needBody || hit.body !== null)) {
    return hit;
  }

  // Share one request between concurrent identical checks.
  const pending = inflight.get(key);
  if (pending) return pending;

  const run = (async () => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= AUTH_MAX_ATTEMPTS; attempt++) {
      try {
        const result = await fetchAuthOnce(url, token, needBody);
        if (result.status >= 500 && attempt < AUTH_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        // Cache only successful results, so 401/403/5xx never stick.
        if (result.ok && (!needBody || result.body !== null)) {
          result.exp = Date.now() + AUTH_TTL_MS;
          pruneCache();
          authCache.set(key, result);
        }
        return result;
      } catch (e) {
        lastErr = e;
        if (attempt < AUTH_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }
    throw lastErr;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Access policies
// ---------------------------------------------------------------------------
type AccessPolicy = {
  directory?: string;
  action: string;
  deny?: boolean;
  alsoDirectory?: string;
  // Any signed-in admin may pass, even with no permissions yet
  // (used for dashboards, which Laravel/RoleGuard restrict further).
  signedInOnly?: boolean;
  // Passes for a signed-in admin even if they have zero permissions.
  // Laravel enforces the real rules (e.g. task-management is position-based).
  allowEmptyPermissions?: boolean;
  // Only superadmin may pass (checked against /api/admin/session).
  superadminOnly?: boolean;
};

// Role dashboards live at /admin/<role>/dashboard.
const DASHBOARD_ROLES = new Set([
  "hr",
  "accounting",
  "admin",
  "superadmin",
  "employee",
]);

const pageDirectories: Record<string, string> = {
  careers: "careers",
  attendance: "ojt_attendance",
  tardiness: "tardiness",
  timekeeping: "timekeeping",
  "audit-logs": "system_audit_logs",
  blog: "blog",
  contracts: "contracts",
  "employee-clearance-form": "clearance_form",
  "graphic-design": "graphic_design",
  inquiries: "inquiries",
  "juantap-survey": "juantap_survey",
  "leave-request": "leave_requests",
  "my-leave": "my_leave",
  "evaluation-monitoring": "evaluations",

  "leave-credits": "leave_credits",
  "my-overtime": "my_overtime",
  "my-evaluation": "my_evaluation",
  "market-research": "market_research",
  masterfile: "employee_masterfile",
  "paid-ads": "paid_ads",
  "portal-demo": "portal_demo",
  "seo-audits": "seo_audit",
  "social-media-management": "social_media_management",
  "support-tickets": "support_tickets",
  survey: "survey",
  "tiktok-shop-opening": "tiktok_shop",
  "video-survey": "video_survey",
  "website-audit": "website_audit",
  "website-directory": "website_directory",
  "client-assessment": "client_assessment",
  "demo-requirements": "demo_requirements",
  "my-tasks": "my_tasks",
  "task-management": "task_management",
  payroll: "payroll",
  "office-supply": "office_supplies",
  "item-replacement": "item_replacement",
  // Employee side of item replacement ("My Company Items").
  "my-company-items": "my_item_replacement",
  "employee-files": "employee_files",
  "13thmonth": "thirteenth_month_pay",
  invoice: "invoices",
  quotation: "quotation",
};
const adminApiDirectories: Record<string, string> = {
  analytics: "system_audit_logs",
  attendance: "ojt_attendance",
  tardiness: "tardiness",
  timekeeping: "timekeeping",
  "blog-posts": "blog",
  clearance: "clearance_form",
  "clearance-template": "clearance_form",
  coe: "clearance_form",
  contracts: "contracts",
  // Installment "Record" and commission "Release" actions on a contract.
  "contract-installments": "contracts",
  "contract-commissions": "contracts",
  "employee-clearance": "clearance_form",
  employees: "employee_masterfile",
  blog: "blog",
  "leave-requests": "leave_requests",
  "leave-types": "leave_requests",
  "evaluation-monitoring": "evaluations",
  "leave-credits": "leave_credits",
  "portal-demos": "portal_demo",
  careers: "careers",
  "support-tickets": "support_tickets",
  surveys: "survey",
  trainees: "ojt_attendance",
  websites: "website_directory",
  "my-tasks": "my_tasks",
  payroll: "payroll",

  "thirteenth-month": "thirteenth_month_pay",
  "office-supplies": "office_supplies",
  "employee-files": "employee_files",
  invoices: "invoice",
  quotations: "quotation",
  // "task-management" is handled separately in protectedApi (position-based).
  // "roadmap" is handled separately in protectedApi (superadmin only).
  // "calendar-events" is handled separately in protectedApi (superadmin only).
};

const directApiDirectories: Record<string, string> = {
  "client-assessment": "client_assessment",
  attendance: "ojt_attendance",
  "blog-posts": "blog",
  contracts: "contracts",
  "employee-masterfile": "employee_masterfile",
  "graphic-design-requests": "graphic_design",
  inquiries: "inquiries",
  "juantap-surveys": "juantap_survey",
  leads: "client_assessment",
  "market-research-requests": "market_research",
  "paid-ads-requests": "paid_ads",
  "seo-audit": "seo_audit",
  "seo-audits": "seo_audit",
  "social-media-requests": "social_media_management",
  "support-tickets": "support_tickets",
  "tiktok-shop-requests": "tiktok_shop",
  trainees: "ojt_attendance",
  surveys: "survey",
  videosurvey: "video_survey",
  "video-surveys": "video_survey",
  videoSurvey: "video_survey",
  "website-inquiries": "website_audit",
  "website-inquiry": "website_audit",
  "send-graphic-design-email": "graphic_design",
  "send-inquiry-email": "website_audit",
  "send-juantap-email": "juantap_survey",
  "send-market-research-email": "market_research",
  "send-social-media-email": "social_media_management",
  "send-survey-email": "survey",
  "send-tiktok-shop-email": "tiktok_shop",
  "summary-send-email": "system_audit_logs",
  demoRequirements: "demo_requirements",
  "demo-requirements": "demo_requirements",
};

function protectedApi(
  path: string,
  method: string,
  search: URLSearchParams,
): AccessPolicy | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "api") return null;

  if (
    parts[1] === "careers" &&
    ((parts[2] === "jobs" && parts.length === 3 && method === "GET") ||
      (parts[2] === "applications" && parts.length === 3 && method === "POST"))
  ) {
    return null;
  }

  if (
    parts[1] === "attendance" &&
    ((parts.length === 2 && ["POST", "PUT"].includes(method)) ||
      (parts.length === 3 &&
        ["lookup", "history", "total"].includes(parts[2]) &&
        method === "GET"))
  ) {
    return null;
  }

  if (parts[1] === "admin") {
    const area = parts[2];
    if (area === "login" && method === "POST") return null;
    if (area === "session" && ["GET", "DELETE"].includes(method)) return null;
    if (area === "activity-logs" && method === "GET") {
      return { directory: "system_audit_logs", action: "view" };
    }
    // /api/admin/dashboard/<role> only needs a signed-in admin.
    // Laravel (AdminDashboardController) checks that the role matches.
    if (area === "dashboard" && method === "GET") {
      return { action: "view", signedInOnly: true };
    }

    // task-management is position-based (manager/supervisor + department),
    // not a directory permission. Next only checks that the user is a
    // signed-in admin; Laravel's TaskManagementController enforces the
    // team rules, so an account with no permissions yet may still pass.
    if (area === "task-management") {
      return { action: "view", allowEmptyPermissions: true };
    }

    // System Roadmap API: superadmin only.
    if (area === "roadmap") {
      return { action: "view", superadminOnly: true };
    }

    // General Calendar API (/api/admin/calendar-events and
    // /api/admin/calendar-event-types): superadmin only.
    if (area === "calendar-events" || area === "calendar-event-types") {
      return { action: "view", superadminOnly: true };
    }
    // Job descriptions (job offer Annex): superadmin only.
    if (area === "job-descriptions") {
      return { action: "view", superadminOnly: true };
    }
    if (area === "settings") {
      return { action: "view", superadminOnly: true };
    }
    // Payroll override code + superadmin unlock: superadmin only.
    if (
      area === "payroll" &&
      (parts[3] === "override-code" || parts[3] === "override-superadmin")
    ) {
      return { action: "view", superadminOnly: true };
    }

    if (area === "access-management") {
      if (
        parts[3] === "audit" ||
        (parts[3] === "accounts" && parts[5] === "audit")
      ) {
        return { directory: "system_audit_logs", action: "view" };
      }
      const isCreate =
        parts[3] === "employees" ||
        (parts[3] === "accounts" && parts.length === 4 && method === "POST");
      const isEdit =
        parts[3] === "accounts" &&
        parts.length >= 6 &&
        ["permissions", "status", "rotate-credentials"].includes(parts[5]);
      return {
        directory: "user_access_management",
        action: isCreate ? "create" : isEdit ? "edit" : actionFor(method, path),
      };
    }
    // Leave API: HR (leave_requests) or an employee with "My Leave".
    // Employees can only view/create, and Laravel limits them to their own leave.
    if (area === "leave-requests") {
      const action = actionFor(method, path);
      return {
        directory: "leave_requests",
        action,
        alsoDirectory:
          action === "view" || action === "create" ? "my_leave" : undefined,
      };
    }
    if (area === "coe-requests") {
      // HR actions: update status / remarks.
      if (["PATCH", "PUT", "DELETE"].includes(method)) {
        return { directory: "clearance_form", action: "edit" };
      }
      // Listing ALL requests (no employee_id) is for HR only.
      if (method === "GET" && !search.get("employee_id")) {
        return { directory: "clearance_form", action: "edit" };
      }
      // Employee: own list, file a request, cancel, notify.
      return { action: "view", signedInOnly: true };
    }
    if (area === "evaluation-requests") {
      if (["PATCH", "PUT", "DELETE"].includes(method)) {
        return { directory: "evaluations", action: "edit" };
      }
      if (method === "GET" && !search.get("employee_id")) {
        return { directory: "evaluations", action: "edit" };
      }
      return { action: "view", signedInOnly: true };
    }
    if (area === "evaluations") {
      const isAction = method === "POST" && parts.length >= 5;
      return {
        directory: "online_evaluations",
        action: isAction ? "edit" : actionFor(method, path),
      };
    }
    if (area === "replacement-requests") {
      // POST /api/admin/replacement-requests/:id/:action (submit, endorse,
      // approve, reject, release, revert) is an edit, like evaluations.
      const isAction = method === "POST" && parts.length >= 5;
      return {
        directory: "item_replacement",
        action: isAction ? "edit" : actionFor(method, path),
      };
    }
    // Employee side of item replacement ("My Company Items").
    // Every call is a view/create-level action: Laravel
    // (MyItemReplacementRequestController) scopes everything to the
    // logged-in employee, and endorse/approve/release stay on the
    // admin-only /replacement-requests route above.
    if (area === "my-replacement-requests") {
      return {
        directory: "my_item_replacement",
        action: method === "GET" ? "view" : "create",
      };
    }
    if (area === "overtime-requests") {
      const action = actionFor(method, path);
      return {
        directory: "timekeeping",
        action,
        alsoDirectory: "my_overtime",
      };
    }
    if (area === "my-clearance" && method === "GET") {
      return { action: "view", signedInOnly: true };
    }
    // Employee's own milestones: any signed-in admin. Laravel returns only
    // the logged-in account's own rows.
    if (area === "my-milestones" && method === "GET") {
      return { action: "view", signedInOnly: true };
    }
    if (
      (area === "my-profile" ||
        area === "my-documents" ||
        area === "my-payslips") &&
      method === "GET"
    ) {
      return { action: "view", signedInOnly: true };
    }
    if (area === "department-scope" && method === "GET") {
      return { action: "view", signedInOnly: true };
    }
    if (
      (area === "department-signature" || area === "my-signature") &&
      ["GET", "PUT"].includes(method)
    ) {
      return { action: "view", signedInOnly: true };
    }
    // Dashboard announcements + Alert/Overview panels: any signed-in admin
    // may read. Posting/deleting announcements is admin-only, and Laravel
    // (DashboardAnnouncementController::authorizeManage) enforces that.
    if (area === "announcements" || area === "dashboard-panels") {
      return { action: actionFor(method, path), signedInOnly: true };
    }
    const directory = area ? adminApiDirectories[area] : undefined;
    return directory
      ? { directory, action: actionFor(method, path) }
      : { deny: true, action: "view" };
  }

  if (
    (parts[1] === "portal-demos" || parts[1] === "testimonials") &&
    (method === "GET" || (parts[1] === "testimonials" && method === "POST"))
  ) {
    return null;
  }
  if (
    (parts[1] === "contact" ||
      parts[1] === "chat" ||
      parts[1] === "quotation") &&
    method === "POST" &&
    parts.length === 2
  ) {
    return null;
  }
  if (parts[1] === "video-proxy" && method === "GET") return null;

  if (parts[1] === "employee-masterfile") {
    const action = actionFor(method, path);
    return {
      directory: "employee_masterfile",
      action,
      alsoDirectory: action === "view" ? "online_evaluations" : undefined,
    };
  }
  const directory = parts[1] ? directApiDirectories[parts[1]] : undefined;
  if (!directory) return { deny: true, action: "view" };

  const publicSubmission =
    method === "POST" &&
    parts.length === 2 &&
    [
      "client-assessment",
      "graphic-design-requests",
      "inquiries",
      "juantap-surveys",
      "leads",
      "market-research-requests",
      "paid-ads-requests",
      "seo-audit",
      "seo-audits",
      "social-media-requests",
      "surveys",
      "tiktok-shop-requests",
      "video-surveys",
      "demoRequirements",
      "demo-requirements",
      "website-inquiries",
      "website-inquiry",
      "support-tickets",
    ].includes(parts[1]);
  if (publicSubmission) return null;

  return { directory, action: actionFor(method, path) };
}

function actionFor(method: string, path: string): string {
  if (method === "GET" && /\/(download|export|attachment)(\/|$)/i.test(path))
    return "export";
  if (
    method === "POST" &&
    /(?:\/reply(?:\/|$)|\/send-(?:[^/]+-)?email(?:\/|$)|\/summary-send-email(?:\/|$)|\/applications\/[^/]+\/(?:job-offer(?:-sent)?|interview-invitation|reject)(?:\/|$)|\/office-supplies\/items\/[^/]+\/movements(?:\/|$))/i.test(
      path,
    )
  ) {
    return "edit";
  }
  if (method === "GET" || method === "HEAD") return "view";
  if (method === "POST") return "create";
  if (method === "DELETE") return "delete";
  if (method === "PUT" || method === "PATCH") return "edit";
  return "view";
}

function protectedPage(path: string): AccessPolicy | null {
  if (
    !path.startsWith("/admin/") ||
    path === "/admin/login" ||
    path === "/admin/access-denied"
  )
    return null;
  const area = path.split("/")[2];
  if (area === "dashboard") return { action: "view", signedInOnly: true };
  if (area === "my-milestones" || area === "my-leave-credits") {
    return { action: "view", signedInOnly: true };
  }
  if (
    area === "my-milestones" ||
    area === "my-leave-credits" ||
    area === "my-coe" ||
    area === "my-clearance" ||
    area === "my-profile"
  ) {
    return { action: "view", signedInOnly: true };
  }
  // /admin/<role>/dashboard (hr, accounting, admin, superadmin).
  // Any signed-in admin may load it; RoleGuard sends them to their own.
  const segments = path.split("/").filter(Boolean);
  if (
    segments.length === 3 &&
    DASHBOARD_ROLES.has(segments[1]) &&
    segments[2] === "dashboard"
  ) {
    return { action: "view", signedInOnly: true };
  }
  // System Roadmap: superadmin only.
  if (area === "roadmap") {
    return { action: "view", superadminOnly: true };
  }
  // Job Offer / Job Descriptions: superadmin only.
  if (area === "job-descriptions") {
    return { action: "view", superadminOnly: true };
  }
  // General Calendar: superadmin only.
  if (area === "general-calendar") {
    return { action: "view", superadminOnly: true };
  }
  if (area === "settings") {
    return { action: "view", superadminOnly: true };
  }
  if (area === "access-management" || area === "audit-logs") {
    return {
      directory:
        area === "access-management"
          ? "user_access_management"
          : "system_audit_logs",
      action: "view",
    };
  }
  if (area === "leave-request" || area === "for-approval") {
    return { directory: "leave_requests", action: "edit" };
  }
  // NEW: Attendance Monitoring (tabs: Tardiness + Leave Monitoring).
  // Passes with the "tardiness" permission, or (via alsoDirectory) with
  // "leave_requests". Which tabs show is decided inside the page.
  if (area === "attendance-monitoring") {
    return {
      directory: "tardiness",
      action: "view",
      alsoDirectory: "leave_requests",
    };
  }
  if (area === "coe-requests") {
    return { directory: "clearance_form", action: "edit" };
  }
  const directory = area ? pageDirectories[area] : undefined;
  return directory
    ? { directory, action: "view" }
    : { deny: true, action: "view" };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");
  const policy = isApi
    ? protectedApi(pathname, request.method, request.nextUrl.searchParams)
    : protectedPage(pathname);
  if (!policy) return NextResponse.next();

  if (policy.deny) {
    return isApi
      ? NextResponse.json({ message: "Forbidden" }, { status: 403 })
      : NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }

  const token = request.cookies.get("adminToken")?.value;
  if (!token)
    return isApi
      ? unauthorized()
      : NextResponse.redirect(new URL("/admin/login", request.url));

  const backendPath = policy.directory
    ? `/api/admin/authorize?${new URLSearchParams({ directory: policy.directory, action: policy.action })}`
    : "/api/admin/session";

  // The session body is only needed when there is no directory and the
  // policy is not signedInOnly (superadmin / permissions check below).
  const needBody = !policy.directory && !policy.signedInOnly;

  let auth: AuthResult;
  try {
    auth = await authorize(`${laravelUrl}${backendPath}`, token, needBody);
  } catch {
    return NextResponse.json(
      { message: "Authentication service unavailable." },
      { status: 503 },
    );
  }
  // Employee with only "My Leave": retry against that directory.
  if (auth.status === 403 && policy.directory && policy.alsoDirectory) {
    try {
      auth = await authorize(
        `${laravelUrl}/api/admin/authorize?${new URLSearchParams({
          directory: policy.alsoDirectory,
          action: policy.action,
        })}`,
        token,
        false,
      );
    } catch {
      return NextResponse.json(
        { message: "Authentication service unavailable." },
        { status: 503 },
      );
    }
  }
  if (auth.status === 401) {
    return isApi
      ? unauthorized()
      : NextResponse.redirect(new URL("/admin/login", request.url));
  }
  if (auth.status >= 500) {
    return NextResponse.json(
      { message: "Authorization service unavailable." },
      { status: 503 },
    );
  }

  let allowed = auth.ok;
  // Dashboards (signedInOnly) pass for any signed-in admin. Everything else
  // without a directory needs at least some access, unless the policy sets
  // allowEmptyPermissions. superadminOnly policies need a superadmin.
  if (needBody && allowed) {
    const session = auth.body;
    if (!session) {
      return NextResponse.json(
        { message: "Invalid authorization response." },
        { status: 503 },
      );
    }
    allowed = policy.superadminOnly
      ? session.is_superadmin === true
      : session.is_superadmin === true ||
        policy.allowEmptyPermissions === true ||
        session.permissions?.length > 0;
  }
  if (!allowed) {
    return isApi
      ? NextResponse.json({ message: "Forbidden" }, { status: 403 })
      : NextResponse.redirect(
          new URL(
            pathname === "/admin/dashboard"
              ? "/admin/login"
              : "/admin/dashboard",
            request.url,
          ),
        );
  }

  if (!isApi) return NextResponse.next();

  const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;
  if (!serviceToken) {
    return NextResponse.json(
      { message: "Admin API is not configured." },
      { status: 503 },
    );
  }

  const headers = new Headers(request.headers);
  headers.delete("x-admin-authorized");
  headers.set("x-admin-authorized", "true");
  headers.set("authorization", `Bearer ${serviceToken}`);
  const nextResponse = NextResponse.next({ request: { headers } });
  nextResponse.headers.set("Cache-Control", "private, no-store");
  return nextResponse;
}

function unauthorized() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
