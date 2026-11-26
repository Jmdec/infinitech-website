// app/api/admin/leave-requests/notify/route.ts
//
// Emails HR when an employee files a leave request.
// Needs:  npm i nodemailer && npm i -D @types/nodemailer
// Env:    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_RECEIVER
//
// To: SMTP_RECEIVER + general list (Admin > Settings > Notification Emails)
// CC: supervisors of the employee's department (Admin > Settings)
// Reply-To: the employee, so HR's reply goes straight to them.

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

const fmtDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : value;

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

  const leaveType = clean(payload.leave_type, 200);
  const startDate = clean(payload.start_date, 10);
  const endDate = clean(payload.end_date, 10);
  const duration = clean(payload.duration, 100);
  const reason = clean(payload.reason, 5000);
  if (!leaveType || !startDate || !endDate || !reason) {
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

  // Make sure the employee_id that was sent really belongs to this person.
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
  const department = (
    fromSession || (sameEmployee ? employeeRecord.department : "")
  ).trim();

  const employeeEmail =
    String(
      pick(session, "employee.email_address", "email", "user.email") ?? "",
    ).trim() || (sameEmployee ? employeeRecord.email : "");

  const hasProof = payload.has_proof === true;

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

  // Debug: remove once CC works for every department.
  console.log(
    "[notify] department:",
    JSON.stringify(department),
    "to:",
    to,
    "cc:",
    cc,
  );

  if (to.length === 0) {
    return NextResponse.json(
      { message: "No email recipients are set. Add some in Settings." },
      { status: 503 },
    );
  }

  // Signature (html, text, attachments). Never block the notification if it fails.
  let signature: {
    html: string;
    text: string;
    attachments?: any[];
  } = { html: "", text: "", attachments: [] };
  try {
    signature = await getEmailSignature({
      laravelUrl,
      token,
      name: employeeName,
    });
  } catch {
    signature = { html: "", text: employeeName, attachments: [] };
  }

  const adminUrl = `${request.nextUrl.origin}/admin/leave-request`;
  const dates =
    startDate === endDate
      ? fmtDate(startDate)
      : `${fmtDate(startDate)} to ${fmtDate(endDate)}`;

  // Name only, no ID number.
  const who = employeeName;

  const lines = [
    "Good day,",
    "",
    `${who}${department ? ` from ${department}` : ""} is requesting a leave.`,
    "",
    `Leave type: ${leaveType}`,
    `Dates: ${dates}`,
    ...(duration ? [`Duration: ${duration}`] : []),
    `Reason: ${reason}`,
    ...(hasProof
      ? ["Proof attached: Yes, you can open it in Leave Monitoring."]
      : []),
    "",
    `You can review it here: ${adminUrl}`,
    "",
    "Thank you.",
  ];

  const text = [...lines, "", signature.text].join("\n");

  // Plain paragraphs only: no table, no button, no colors.
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#000">
      ${lines
        .map((line) =>
          line === ""
            ? "<br>"
            : `<div style="white-space:pre-wrap">${escapeHtml(line).replace(
                escapeHtml(adminUrl),
                `<a href="${escapeHtml(adminUrl)}">${escapeHtml(adminUrl)}</a>`,
              )}</div>`,
        )
        .join("")}
      <br>
      ${signature.html}
    </div>`;

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
      subject: `Leave request: ${employeeName}, ${leaveType} (${dates})`,
      text,
      html,
      attachments: signature.attachments,
    });
  } catch (error) {
    console.error("[leave-notify] sendMail failed:", error);
    return NextResponse.json(
      { message: "The email could not be sent." },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true });
}
