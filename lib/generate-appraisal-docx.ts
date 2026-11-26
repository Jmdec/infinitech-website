// FILE: lib/generate-appraisal-docx.ts
// Generates the Performance Appraisal .docx IN THE BROWSER.
// It fills your own Word template (public/templates/performance_appraisal.docx),
// so the logo, header, footer, table and fonts stay exactly as designed.
//
//   npm i docxtemplater pizzip
//
// The template uses {{placeholders}}:
//   name, job, period, r1..r10, total, interpretation, agree, disagree,
//   disagree_items, emp_signature, emp_date, yes, no, comments,
//   rated_by, rated_date, reviewed_by, reviewed_date, approved_by, approved_date

import { format } from "date-fns";

/** Minimal shape needed. The panel's `Evaluation` type satisfies it. */
export type AppraisalData = {
  employee_name: string;
  department: string | null;
  job_title: string | null;
  rating_period: string;
  ratings: (number | null)[];
  total_score?: number | null;
  interpretation?: string | null;
  recommend_regular: boolean | null;
  comments: string | null;
  rated_by_name: string | null;
  rated_at: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  employee_response: "agree" | "disagree" | null;
  employee_disagree_items: string | null;
  employee_acknowledged_at: string | null;
};

const TEMPLATE_URL = "/templates/performance_appraisal.docx";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const CHECK = "✓";

const day = (v?: string | null) =>
  v ? format(new Date(v), "MMM d, yyyy") : "";

function interpretScore(total: number) {
  if (total >= 41) return "Highly suitable to the position";
  if (total >= 31) return "Suitable to the position";
  if (total >= 16) return "Fails to meet minimum requirements of the job";
  return "Employee advise to resign";
}

function buildValues(e: AppraisalData): Record<string, string> {
  const total =
    e.total_score ?? e.ratings.reduce<number>((sum, v) => sum + (v ?? 0), 0);

  const values: Record<string, string> = {
    name: e.employee_name,
    job: [e.department, e.job_title].filter(Boolean).join(" / "),
    period: e.rating_period,
    total: String(total),
    interpretation: e.interpretation || interpretScore(total),

    agree: e.employee_response === "agree" ? CHECK : "",
    disagree: e.employee_response === "disagree" ? CHECK : "",
    disagree_items:
      e.employee_response === "disagree" ? e.employee_disagree_items || "" : "",
    // Left blank on purpose so the employee can sign the printed copy.
    emp_signature: "",
    emp_date: day(e.employee_acknowledged_at),

    yes: e.recommend_regular === true ? CHECK : "",
    no: e.recommend_regular === false ? CHECK : "",
    comments: e.comments || "",

    rated_by: e.rated_by_name || "",
    rated_date: day(e.rated_at),
    reviewed_by: e.reviewed_by_name || "",
    reviewed_date: day(e.reviewed_at),
    approved_by: e.approved_by_name || "",
    approved_date: day(e.approved_at),
  };

  for (let i = 0; i < 10; i++) {
    values[`r${i + 1}`] = e.ratings[i] != null ? String(e.ratings[i]) : "";
  }
  return values;
}

export async function generateAppraisalDocx(e: AppraisalData): Promise<Blob> {
  // Loaded on demand so these libraries are not in the main bundle.
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import("pizzip"),
    import("docxtemplater"),
  ]);

  const response = await fetch(TEMPLATE_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("The appraisal template could not be loaded.");
  }

  const zip = new PizZip(await response.arrayBuffer());
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true, // keeps new lines typed in Comments
    nullGetter: () => "",
  });

  doc.render(buildValues(e));

  return doc.getZip().generate({
    type: "blob",
    mimeType: DOCX_MIME,
    compression: "DEFLATE",
  });
}

export async function downloadAppraisalDocx(e: AppraisalData) {
  const blob = await generateAppraisalDocx(e);
  const safe = (s: string) =>
    s.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  const filename = `Performance_Appraisal_${safe(e.employee_name)}_${safe(e.rating_period)}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
