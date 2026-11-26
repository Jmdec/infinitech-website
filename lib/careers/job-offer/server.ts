import nodemailer from "nodemailer";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

// Calls Laravel (only used to record that the offer was sent).
export async function forwardToLaravel(
  req: Request,
  path: string,
  init: { method: string; json?: unknown },
): Promise<Response> {
  const base = process.env.LARAVEL_API_URL || "http://localhost:8000";
  const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;
  if (!serviceToken) throw new HttpError(503, "Admin API is not configured.");

  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceToken}`,
    "X-Service-Token": serviceToken,
  });

  const adminToken = getCookie(req, "adminToken");
  if (!adminToken) throw new HttpError(401, "Unauthorized");
  headers.set("X-Admin-Token", adminToken);
  headers.set("X-Admin-Session", adminToken);
  headers.set("Cookie", `adminToken=${encodeURIComponent(adminToken)}`);

  return fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: init.method,
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
    headers,
    cache: "no-store",
  });
}
export async function fetchJobDescription(
  req: Request,
  title: string,
  department?: string | null,
) {
  const qs = new URLSearchParams({ title: title.trim() });
  if (department?.trim()) qs.set("department", department.trim());

  try {
    const res = await forwardToLaravel(
      req,
      `/api/admin/careers/job-description?${qs}`,
      { method: "GET" },
    );
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null))?.data;
    if (!j) return null;
    return {
      title: j.title as string,
      department: j.department as string,
      description: j.description as string,
      qualifications: (j.qualifications ?? []) as string[],
    };
  } catch {
    return null;
  }
}
// Generic mail sender: any attachment type (the job offer is now an editable .docx).
export async function sendMailWithAttachment(opts: {
  to: string;
  subject: string;
  body: string;
  filename: string;
  content: Uint8Array;
  contentType: string;
}): Promise<void> {
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    attachments: [
      {
        filename: opts.filename,
        content: Buffer.from(opts.content),
        contentType: opts.contentType,
      },
    ],
  });
}

// Kept so any other caller still works.
export async function sendMailWithPdf(opts: {
  to: string;
  subject: string;
  body: string;
  filename: string;
  pdf: Uint8Array;
}): Promise<void> {
  return sendMailWithAttachment({
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
    filename: opts.filename,
    content: opts.pdf,
    contentType: "application/pdf",
  });
}
