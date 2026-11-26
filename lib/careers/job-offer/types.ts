// File: lib/careers/job-offer/types.ts

export type Department = "it" | "marketing" | "creative" | "admin" | "general";

// A piece of text with optional styling. Renderers (pdf-lib, pdfkit, @react-pdf, docx) map these.
export type Segment = {
  text: string;
  bold?: boolean;
  underline?: boolean;
  sup?: boolean;
};

export type DutyGroup = { heading?: string; items: string[] };

export type JobDescription = {
  key: string;
  department: Department;
  /** Matches the position title typed/selected in the Send job offer dialog. */
  matches: RegExp;
  /** Bold name used in the Annex A intro, e.g. "Web Developer". */
  role: string;
  /** Annex A title, e.g. "Job Description – Web Developer". */
  title: string;
  /** Sentence continuing after the role name, e.g. "is responsible for ...". */
  summary: string;
  /** Heading above the duties list. */
  dutiesHeading: string;
  duties: DutyGroup[];
  /** Default "Reporting to" key (see constants.REPORTING). */
  reportingTo: string;
  /** Weekend wording in the Working Schedule. */
  weekendWork: "saturday" | "saturday_sunday";
  /** true = drafted by us (no signed copy existed). Have the department head review. */
  draft: boolean;
};

// Same fields the OfferForm already POSTs to /api/admin/careers/applications/:id/job-offer
export type OfferPayload = {
  applicant_name: string;
  applicant_last_name?: string;
  letter_date_long: string;
  salutation: "Mr." | "Ms.";
  address: string;
  position: string;
  employment_type: string;
  salary_words: string;
  start_date_long: string;
  benefits: {
    meal_allowance: string | null;
    load_allowance: string | null;
    free_accommodation: boolean;
    commission_percent: string | null;
  };
  reporting_to: string;
  signatory: string;
  letterhead: "main" | "alt" | string;
  /** Optional overrides */
  schedule_override?: Segment[];
  department_override?: Department;
};

// Renderer-agnostic document. Feed this to your PDF library.
export type OfferDocument = {
  letterhead: {
    logoPath: string;
    headerLines: string[];
    footerLines: string[];
  };
  letter: {
    date: string;
    title: string;
    recipientName: string;
    recipientAddress: string;
    dear: string;
    intro: Segment[];
    terms: { label: string; lines: Segment[][] }[];
    closing: string;
    sincerely: string;
    signatory: { name: string; title: string };
    receivedBy: { name: string; caption: string };
  };
  annex: {
    label: string;
    title: string;
    intro: Segment[];
    dutiesHeading: string;
    duties: DutyGroup[];
  };
  meta: { department: Department; jobDescriptionKey: string; draft: boolean };
};
