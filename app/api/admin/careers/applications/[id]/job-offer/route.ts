// File: app/api/admin/careers/applications/[id]/job-offer/route.ts
import {
  forwardToLaravel,
  HttpError,
  sendMailWithAttachment,
} from "@/lib/careers/job-offer/server";
import { buildJobOfferDocx, pickLayout } from "@/lib/careers/job-offer/docx";
import {
  findByName,
  resolveSignatories,
} from "@/lib/careers/job-offer/signatories";
import { findJobDescription } from "@/lib/careers/job-offer/job-descriptions";

export const runtime = "nodejs";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Payload = {
  applicant_name: string;
  applicant_email: string;
  letter_date_long: string;
  salutation: string;
  address?: string;
  position: string;
  employment_type: string;
  salary: number;
  salary_words?: string;
  start_date_long: string;
  benefits: string[];
  // Optional overrides. The admin form no longer sends these: reporting-to is the
  // head of the job's department and the signatory is the HR person from the masterfile.
  reporting_to?: string;
  signatory?: string;
  letterhead: "main" | "alt";
  subject: string;
  body: string;
  job?: {
    title?: string;
    department?: string;
    description?: string;
    qualifications?: string[];
  } | null;

  job_description_id?: number;
  signatory_title?: string;
  conformed_by?: { name: string; title?: string; titleLine2?: string }[];
  working_schedule?: string;
  revised?: boolean;
  supersedes_position?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) throw new HttpError(400, "Invalid application id.");

    let p: Payload;
    try {
      p = (await req.json()) as Payload;
    } catch {
      throw new HttpError(415, "Expected a JSON body.");
    }

    for (const k of [
      "applicant_name",
      "applicant_email",
      "salutation",
      "position",
      "start_date_long",
      "subject",
      "body",
    ] as const) {
      if (!p[k]) throw new HttpError(422, `Missing field: ${k}.`);
    }
    if (!(Number(p.salary) > 0))
      throw new HttpError(422, "Missing field: salary.");

    // Job description (Annex): always use the saved one from the Job Description page.
    let job = p.job ?? null;
    const saved = await findJobDescription(req, {
      id: p.job_description_id,
      position: p.position,
      department: job?.department,
    });
    if (saved) {
      job = {
        title: saved.title,
        department: saved.department || job?.department,
        description: saved.description,
        qualifications: saved.qualifications,
      };
    } else if (job) {
      // Nothing saved on the Job Description page for this position. Fall back to the
      // description/qualifications of the job posting sent by the form, so the Annex
      // page still prints. Only if both are empty is there no Annex.
      console.warn(
        "job-offer: no saved job description found for position:",
        p.position,
        "(id:",
        p.job_description_id ?? "none",
        ")",
      );
      job = {
        title: job.title,
        department: job.department,
        description: job.description,
        qualifications: job.qualifications,
      };
    }

    const layout = pickLayout(job?.department);

    // Signers come from the Employee Masterfile. `head` = head of the department the
    // applicant applied to (manager > head/director > supervisor > team lead).
    const people = await resolveSignatories(req, {
      reportingTo: p.reporting_to,
      department: job?.department,
    });
    const fmt = (x?: { name: string; title: string }) =>
      x ? `${x.name.toUpperCase()} (${x.title})` : "";

    // Signatory: explicit name if one is sent, otherwise by layout:
    // IT -> HR / Admin Supervisor, default -> Admin Assistant (each falls back to the other).
    const signatoryPerson =
      findByName(people.all, p.signatory) ??
      (layout === "it"
        ? (people.hr ?? people.admin)
        : (people.admin ?? people.hr));
    const signatory = signatoryPerson?.name || p.signatory || "";

    // Reporting to: explicit override > department head > old fallback (IT manager / CEO).
    const reportingTo =
      p.reporting_to ||
      fmt(people.head) ||
      fmt(layout === "it" ? people.itManager : people.ceo) ||
      "";

    // "Conformed by" (IT layout): the department head first, then EA and CEO.
    // "Conformed by" (IT layout): the department head only.
    const conformedBy =
      p.conformed_by ??
      (layout === "it"
        ? [people.head ?? people.itManager]
            .filter((x): x is NonNullable<typeof x> => Boolean(x))
            .map((x) => ({ name: x.name, title: x.title }))
        : undefined);

    const docx = await buildJobOfferDocx({
      letterDateLong: p.letter_date_long,
      salutation: p.salutation,
      applicantName: p.applicant_name,
      address: p.address ?? "",
      position: p.position,
      employmentType: p.employment_type,
      startDateLong: p.start_date_long,
      salaryWords: p.salary_words || `Php${Number(p.salary).toFixed(2)}`,
      benefits: p.benefits ?? [],
      reportingTo,
      signatory,
      signatoryTitle: p.signatory_title || signatoryPerson?.title || undefined,
      conformedBy,
      letterhead: p.letterhead === "alt" ? "alt" : "main",
      job,
      workingSchedule: p.working_schedule,
      revised: p.revised,
      supersedesPosition: p.supersedes_position,
    });

    await sendMailWithAttachment({
      to: p.applicant_email,
      subject: p.subject,
      body: p.body,
      filename: `Job-Offer-${p.applicant_name.replace(/[^\w]+/g, "-")}.docx`,
      content: docx,
      contentType: DOCX_MIME,
    });

    const res = await forwardToLaravel(
      req,
      `/api/admin/careers/applications/${id}/job-offer-sent`,
      { method: "POST" },
    );
    if (!res.ok) {
      console.error(
        "Laravel job-offer-sent",
        res.status,
        (await res.text()).slice(0, 500),
      );
      throw new HttpError(
        502,
        "The email was sent, but the application status could not be updated. Set it to Job Offered manually and do not resend.",
      );
    }

    return Response.json({ message: `Job offer sent to ${p.applicant_name}.` });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ message: e.message }, { status: e.status });
    }
    console.error(e);
    return Response.json(
      { message: "Could not send the job offer." },
      { status: 500 },
    );
  }
}
