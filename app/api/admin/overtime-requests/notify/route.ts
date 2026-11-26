// FILE: app/api/admin/overtime-requests/notify/route.ts
//
// Emails HR when an employee files an overtime request.
// Same env vars as the leave notify route:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_RECEIVER
//
// To: SMTP_RECEIVER + general list (Admin > Settings > Notification Emails)
// CC: supervisors of the employee's department (Admin > Settings)
// Reply-To: the employee, so HR's reply goes straight to them.
// Signature: the sender's name/position/mobile + department details
//            (see lib/email-signature.ts and SignatureController).

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getNotificationRecipients } from "@/lib/notification-recipients";
import { getEmployeeInfo } from "@/lib/employee-department";
import { getEmailSignature } from "@/lib/email-signature";

export const runtime = "nodejs";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] as string,
  );

const clean = (value: unknown, max = 300) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const normalizeEmails = (list: (string | undefined)[]) =>
  list.map((email) => (email || "").trim().toLowerCase()).filter(Boolean);

const pick = (obj: any, ...paths: string[]) => {
  for (const path of paths) {
    const value = path.split(".").reduce<any>((cur, key) => cur?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

// 90 -> "1h 30m (1.5 hrs)"
const formatDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const label = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
  const dec = Math.round((mins / 60) * 100) / 100;
  return `${label} (${dec} ${dec <= 1 ? "hr" : "hrs"})`;
};

// "2026-11-06" -> "Fri, Nov 6, 2026"
const formatDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

export async function POST(request: NextRequest) {
  const token = request.cookies.get("adminToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Who is really sending this? Take the name from the session, not the body.
  let session: any;
  try {
    const response = await fetch(`${laravelUrl}/api/admin/session`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    session = await response.json();
  } catch {
    return NextResponse.json(
      { message: "Authentication service unavailable." },
      { status: 503 },
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ message: "Invalid request." }, { status: 422 });
  }

  const date = clean(payload.date, 10);
  const minutes = Math.trunc(Number(payload.minutes));
  const note = clean(payload.note, 500);
  const hasProof = payload.has_proof === true;

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(minutes) ||
    minutes < 1 ||
    minutes > 1440
  ) {
    return NextResponse.json({ message: "Invalid request." }, { status: 422 });
  }

  const employeeName =
    String(pick(session, "employee.name", "name", "user.name") ?? "") ||
    clean(payload.employee_name, 150) ||
    "An employee";
  const employeeNumber =
    String(pick(session, "employee.id_number", "employee_number") ?? "") ||
    clean(payload.employee_number, 50);

  const employeeRecord = await getEmployeeInfo(payload.employee_id);

  // Siguraduhing sa kanya talaga ang employee_id na ipinadala.
  const sameEmployee =
    !employeeNumber ||
    !employeeRecord.number ||
    employeeRecord.number === employeeNumber;

  const fromSession = String(
    pick(
      session,
      "employee.department",
      "department",
      "employee.department_name",
    ) ?? "",
  );
  const department =
    fromSession || (sameEmployee ? employeeRecord.department : "");

  const employeeEmail =
    String(
      pick(session, "employee.email_address", "email", "user.email") ?? "",
    ).trim() || (sameEmployee ? employeeRecord.email : "");

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
    SMTP_RECEIVER,
  } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return NextResponse.json(
      { message: "Email is not configured." },
      { status: 503 },
    );
  }

  // To: SMTP_RECEIVER + general list. CC: department supervisors.
  const { to: savedTo, cc: savedCc } =
    await getNotificationRecipients(department);
  const to = Array.from(new Set(normalizeEmails([SMTP_RECEIVER, ...savedTo])));
  const cc = Array.from(
    new Set(normalizeEmails([...savedCc, employeeEmail])),
  ).filter((email) => !to.includes(email));

  if (to.length === 0) {
    return NextResponse.json(
      { message: "No email recipients are set. Add some in Settings." },
      { status: 503 },
    );
  }

  const adminUrl = `${request.nextUrl.origin}/admin/timekeeping`;
  const prettyDate = formatDate(date);
  const duration = formatDuration(minutes);
  const who = employeeNumber
    ? `${employeeName} (${employeeNumber})`
    : employeeName;

  // The sender's signature (never blocks the email if it can't be loaded).
  const signature = await getEmailSignature({
    laravelUrl,
    token,
    name: employeeName,
  });

  const rows: [string, string][] = [
    ["Employee", who],
    ["Department", department || "—"],
    ["Overtime date", prettyDate],
    ["Duration", duration],
    ["Reason / task", note || "—"],
    ["Proof attached", hasProof ? "Yes, view it in Timekeeping" : "No"],
  ];

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a">
      <h2 style="margin:0 0 4px">New overtime request</h2>
      <p style="margin:0 0 16px;color:#475569">${escapeHtml(who)} filed an overtime that is waiting for approval.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows
          .map(
            ([label, value]) => `
          <tr>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;width:140px;vertical-align:top"><b>${escapeHtml(label)}</b></td>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;white-space:pre-wrap">${escapeHtml(value)}</td>
          </tr>`,
          )
          .join("")}
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#475569">
        To approve it, open Timekeeping, upload the biometric file of that period, then use Approve or Reject in the Overtime column.
      </p>
      <p style="margin:16px 0 0">
        <a href="${escapeHtml(adminUrl)}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px">Open Timekeeping</a>
      </p>
      ${signature.html}
    </div>`;

  const text =
    [
      `New overtime request from ${who}`,
      ...rows.map(([label, value]) => `${label}: ${value}`),
      "",
      "To approve it: open Timekeeping, upload the biometric file of that period, then use Approve / Reject in the Overtime column.",
      `Review it here: ${adminUrl}`,
    ].join("\n") + signature.text;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const fromAddress = (SMTP_FROM || SMTP_USER) as string;

    await transporter.sendMail({
      from: { name: `${employeeName} (via HR Portal)`, address: fromAddress },
      to,
      ...(cc.length ? { cc } : {}),
      ...(employeeEmail
        ? { replyTo: { name: employeeName, address: employeeEmail } }
        : {}),
      subject: `Overtime request: ${employeeName}, ${prettyDate} (${duration})`,
      text,
      html,
      attachments: signature.attachments,
    });
  } catch {
    return NextResponse.json(
      { message: "The email could not be sent." },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true });
}
