// File: lib/careers/job-offer/buildOffer.ts
// Turns the OfferForm payload into a renderer-agnostic OfferDocument (no HTML).

import {
  CLOSING_TEXT,
  EMPLOYMENT_LABELS,
  LETTERHEADS,
  LOGO_PATH,
  REPORTING,
  SIGNATORIES,
} from "./constants";
import { pickJobDescription } from "./departments";
import type { OfferDocument, OfferPayload, Segment } from "./types";

const t = (text: string, style: Partial<Segment> = {}): Segment => ({
  text,
  ...style,
});

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  while (
    parts.length > 1 &&
    /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[parts.length - 1])
  )
    parts.pop();
  const last = parts[parts.length - 1] || name;
  return last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
}

function benefitLines(b: OfferPayload["benefits"]): Segment[][] {
  const lines: Segment[][] = [];
  if (b.meal_allowance) lines.push([t(`Meal Allowance – ${b.meal_allowance}`)]);
  if (b.load_allowance) lines.push([t(`Load Allowance – ${b.load_allowance}`)]);
  lines.push([
    t("Paid Government Compensation (to be deducted to your salary)"),
  ]);
  lines.push([t("13"), t("th", { sup: true }), t(" Month pro-rated")]);
  lines.push([t("Five (5) Leave Credits – 1 year upon regularization")]);
  if (b.free_accommodation) lines.push([t("Free Accommodation")]);
  if (b.commission_percent)
    lines.push([t(`Commission – ${b.commission_percent}%`)]);
  return lines;
}

export function buildOfferDocument(d: OfferPayload): OfferDocument {
  const job = pickJobDescription(d.position, d.department_override);
  const letterhead = LETTERHEADS[d.letterhead === "alt" ? "alt" : "main"];
  const signatory = SIGNATORIES[d.signatory] ?? {
    name: d.signatory.toUpperCase(),
    title: "",
  };
  const reporting = REPORTING[d.reporting_to] ?? d.reporting_to.toUpperCase();
  const name = d.applicant_name.toUpperCase();

  const weekend =
    job.weekendWork === "saturday_sunday"
      ? "SATURDAY & SUNDAY WORK"
      : "SATURDAY WORK";
  const schedule: Segment[] = d.schedule_override ?? [
    t(
      "Mondays – Fridays from 8:00 AM – 5:00 PM (can be beyond 5:00 PM, depending on the tasked given, ",
    ),
    t(weekend, { underline: true }),
    t(" is ONLY applicable when needed)"),
  ];

  return {
    letterhead: {
      logoPath: LOGO_PATH,
      headerLines: [...letterhead.headerLines],
      footerLines: [...letterhead.footerLines],
    },
    letter: {
      date: d.letter_date_long,
      title: "J O B   O F F E R",
      recipientName: name,
      recipientAddress: d.address,
      dear: `Dear ${d.salutation} ${d.applicant_last_name || lastName(d.applicant_name)},`,
      intro: [
        t(
          "Greetings from INFINITECH ADVERTISING! We are delighted to inform you that you have been chosen to work with us as our ",
        ),
        t(d.position, { bold: true }),
        t(". Commencing will be on "),
        t(d.start_date_long, { bold: true, underline: true }),
        t(". As such, we are offering you the following:"),
      ],
      terms: [
        {
          label: "Job Title",
          lines: [[t(d.position.toUpperCase(), { bold: true })]],
        },
        {
          label: "Employment Type",
          lines: [
            [
              t(
                EMPLOYMENT_LABELS[d.employment_type] ??
                  d.employment_type.toUpperCase(),
              ),
            ],
          ],
        },
        { label: "Starting Salary", lines: [[t(d.salary_words)]] },
        { label: "Benefits", lines: benefitLines(d.benefits) },
        { label: "Reporting to", lines: [[t(reporting)]] },
        { label: "Working Schedule", lines: [schedule] },
      ],
      closing: CLOSING_TEXT,
      sincerely: "Sincerely,",
      signatory,
      receivedBy: { name, caption: "Signature over printed Name" },
    },
    annex: {
      label: "“Annex A”",
      title: job.title,
      intro: [t(job.role, { bold: true }), t(` ${job.summary}`)],
      dutiesHeading: job.dutiesHeading,
      duties: job.duties,
    },
    meta: {
      department: job.department,
      jobDescriptionKey: job.key,
      draft: job.draft,
    },
  };
}
