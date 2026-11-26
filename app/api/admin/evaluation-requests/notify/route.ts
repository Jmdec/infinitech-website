// app/api/admin/evaluation-requests/notify/route.ts
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getNotificationRecipients } from "@/lib/notification-recipients";
import { getEmployeeInfo } from "@/lib/employee-department";
import { getEmailSignature } from "@/lib/email-signature";

export const runtime = "nodejs";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

const EVALUATION_TYPES = [
  "1st evaluation",
  "2nd evaluation",
  "Regularization review",
];

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

const clean = (value: unknown, max = 300) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const normalizeEmails = (list: (string | undefined)[]) =>
  list.map((e) => (e || "").trim().toLowerCase()).filter(Boolean);

const pick = (obj: any, ...paths: string[]) => {
  for (const path of paths) {
    const value = path.split(".").reduce<any>((cur, key) => cur?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

// Kayang magbasa ng string o object ({ name: "Admin" }) para hindi maging "[object Object]".
const toText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return toText(v.name ?? v.department_name ?? v.title);
  }
  return "";
};

export async function POST(request: NextRequest) {
  const token = request.cookies.get("adminToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

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

  const evaluationType = clean(payload.evaluation_type, 60);
  const preferredDate = clean(payload.preferred_date, 10);
  const notes = clean(payload.notes, 1000);
  if (!EVALUATION_TYPES.includes(evaluationType)) {
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
  const sameEmployee =
    !employeeNumber ||
    !employeeRecord.number ||
    employeeRecord.number === employeeNumber;

  const sessionDept = pick(session, "employee.department", "department");
  const department =
    toText(sessionDept) || (sameEmployee ? employeeRecord.department : "");

  const employeeEmail =
    toText(pick(session, "employee.email_address", "email", "user.email")) ||
    (sameEmployee ? employeeRecord.email : "");

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

  const { to: savedTo, cc: savedCc } =
    await getNotificationRecipients(department);
  const to = Array.from(new Set(normalizeEmails([SMTP_RECEIVER, ...savedTo])));
  const cc = Array.from(
    new Set(normalizeEmails([...savedCc, employeeEmail])),
  ).filter((e) => !to.includes(e));

  if (to.length === 0) {
    return NextResponse.json(
      { message: "No email recipients are set. Add some in Settings." },
      { status: 503 },
    );
  }

  let signature: { html: string; text: string; attachments?: any[] } = {
    html: "",
    text: employeeName,
    attachments: [],
  };
  try {
    signature = await getEmailSignature({
      laravelUrl,
      token,
      name: employeeName,
    });
  } catch {
    /* send without the signature */
  }

  const adminUrl = `${request.nextUrl.origin}/admin/evaluation-monitoring`;
  const who = employeeNumber
    ? `${employeeName} (${employeeNumber})`
    : employeeName;

  const preferredText = /^\d{4}-\d{2}-\d{2}$/.test(preferredDate)
    ? new Date(`${preferredDate}T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : preferredDate;

  const lines = [
    "Hi HR,",
    "",
    `${who}${department ? ` from ${department}` : ""} is requesting a ${evaluationType}.`,
    "",
    `Evaluation: ${evaluationType}`,
    ...(preferredText ? [`Preferred date: ${preferredText}`] : []),
    ...(notes ? [`Notes: ${notes}`] : []),
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

    await transporter.sendMail({
      from: {
        name: `${employeeName} (via HR Portal)`,
        address: (SMTP_FROM || SMTP_USER) as string,
      },
      to,
      ...(cc.length ? { cc } : {}),
      ...(employeeEmail
        ? { replyTo: { name: employeeName, address: employeeEmail } }
        : {}),
      subject: `Evaluation request: ${employeeName}, ${evaluationType}`,
      text,
      html,
      attachments: signature.attachments,
    });
  } catch (error) {
    console.error("[evaluation-notify] sendMail failed:", error);
    return NextResponse.json(
      { message: "The email could not be sent." },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true });
}
