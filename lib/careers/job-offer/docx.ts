// File: lib/careers/job-offer/docx.ts
//
// Editable (.docx) job offer. Replaces pdf.ts.
//
// Two layouts, picked from the job's department:
//   - "it"      -> Eirene Armilla format (formal letter, address under the logo, HR signs,
//                  "Conformed by" the reporting manager, job description on page 2)
//   - "default" -> Villamor / Bengan format ("Greetings from ...", signed by the admin
//                  assistant, footer with company contact, "Annex A" job description)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { imageSize } from "image-size";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type JobOfferDocInput = {
  letterDateLong: string;
  salutation: string; // "Dear Ms. Armilla," (comma added if missing)
  applicantName: string;
  address: string;
  position: string;
  employmentType: string;
  startDateLong: string; // "Monday, February 16, 2026"
  salaryWords: string; // "SEVENTEEN THOUSAND PESOS ONLY (Php17,000.00)"
  benefits: string[]; // one line each: meal allowance, 13th month, leave credits...
  reportingTo: string; // "MR. JUSTIN M. DE CASTRO (Junior IT Manager)"
  signatory: string; // HR / admin who signs the letter
  letterhead: "main" | "alt";
  /** Saved job description (Job Description page). null/undefined = no Annex page. */
  job?: {
    title?: string;
    department?: string;
    description?: string;
    qualifications?: string[];
  } | null;

  // ---- optional ----
  signatoryTitle?: string; // default: "Admin Supervisor/HR" (IT) | "Admin Assistant"
  /** Extra "Conformed by" signers (IT layout). Defaults to the reporting manager. */
  conformedBy?: { name: string; title?: string; titleLine2?: string }[];
  /** Override the working schedule text. */
  workingSchedule?: string;
  /** Show "- REVISED JOB OFFER -" and the "supersedes the previous offer" line (IT layout). */
  revised?: boolean;
  supersedesPosition?: string; // e.g. "Junior Web Developer"
  /** Force a layout instead of deriving it from job.department. */
  layout?: "it" | "default";
};

type Layout = "it" | "default";

/* ------------------------------------------------------------------ */
/* Config you may want to edit                                         */
/* ------------------------------------------------------------------ */

// Which letterhead is which company. Swap here if "main"/"alt" are the other way round.
// `logo`: a bare file name is read from ./assets, a path with "/" is read from the project root.
const LETTERHEADS = {
  main: {
    company: "INFINITECH ADVERTISING",
    companyLong: "INFINITECH ADVERTISING CORPORATION",
    logo: "public/email/logo.png", // CHANGED (was "infinitech-logo.png")
    logoSize: { width: 118, height: 65 }, // 118 * 330 / 600
    addressLines: [
      "Unit 311 Campos Rueda Bldg., Urban Avenue, Brgy. Pio Del Pilar, Makati City, 1230",
      "(02) 8646-1636",
    ],
    footer: {
      boldLine:
        "INFINITECH Advertising Corporation - 311 Campos Rueda Building, Urban Avenue, Makati City",
      line: "Tel no.: (02)7001-6157 | Mobile no.: (+63) 962-253-0149 | Email: infinitechcorp.ph@gmail.com",
    },
  },
  alt: {
    company: "ABIC REALTY",
    companyLong: "ABIC REALTY & CONSULTANCY CORPORATION",
    logo: "abic-logo.png", // needs lib/careers/job-offer/assets/abic-logo.png
    logoSize: { width: 96, height: 96 },
    addressLines: [
      "Unit 202 Campos Rueda Bldg., Urban Avenue, Brgy. Pio Del Pilar, Makati City, 1230",
      "(02) 8646-1636",
    ],
    footer: null,
  },
} as const;

// Departments that use the IT (Eirene) format.
const IT_DEPARTMENT =
  /^(it|i\.t\.|information technology|it department|web|web development)$/i;

// Saved e-signatures, keyed by UPPERCASE signatory name (files live in ./assets).
const SIGNATURES: Record<
  string,
  { file: string; width: number; height: number }
> = {
  "ROLINE CABANTOC": { file: "sig-roline-cabantoc.png", width: 80, height: 80 },
};

const DEFAULT_SCHEDULE_TAIL = {
  it: {
    pre: "Mondays – Fridays from 8:00AM – 5:00PM (can be beyond 5:00PM, depending on the tasked given, ",
    ul: "SATURDAY & SUNDAY WORK",
    post: " is ONLY applicable when needed)",
  },
  default: {
    pre: "Mondays – Fridays from 8:00AM – 5:00PM (can be beyond 5:00PM, depending on the tasked given, ",
    ul: "SATURDAY WORK",
    post: " is ONLY applicable when needed)",
  },
} as const;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const FONT = "Times New Roman";
const SIGN_FONT = "Arial"; // sans serif, signatories only
const SZ = 24; // 12pt
const SZ_SMALL = 18; // 9pt
const PAGE = { w: 11906, h: 16838 };
const MARGIN_X = 1134;
const CONTENT_W = PAGE.w - MARGIN_X * 2;

const ASSET_DIR = path.join(
  process.cwd(),
  "lib",
  "careers",
  "job-offer",
  "assets",
);

// CHANGED: a bare file name is read from ./assets.
// Anything with a "/" is read from the project root (e.g. "public/email/logo.png").
const loadAsset = (f: string) =>
  readFile(
    f.includes("/") ? path.join(process.cwd(), f) : path.join(ASSET_DIR, f),
  );

export function pickLayout(department?: string | null): Layout {
  return department && IT_DEPARTMENT.test(department.trim()) ? "it" : "default";
}
const run = (
  text: string,
  o: {
    bold?: boolean;
    italics?: boolean;
    underline?: boolean;
    size?: number;
    characterSpacing?: number;
    font?: string;
  } = {},
) =>
  new TextRun({
    text,
    font: o.font ?? FONT,
    size: o.size ?? SZ,
    bold: o.bold,
    italics: o.italics,
    underline: o.underline ? {} : undefined,
    characterSpacing: o.characterSpacing,
  });
const signRun = (
  text: string,
  o: { bold?: boolean; underline?: boolean; size?: number } = {},
) => run(text, { ...o, font: SIGN_FONT });
const para = (
  children: TextRun[] | TextRun | string,
  o: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    after?: number;
    before?: number;
    keepNext?: boolean;
    indentLeft?: number;
  } = {},
) =>
  new Paragraph({
    alignment: o.align,
    keepNext: o.keepNext,
    spacing: { after: o.after ?? 0, before: o.before ?? 0, line: 240 },
    indent: o.indentLeft ? { left: o.indentLeft } : undefined,
    children:
      typeof children === "string"
        ? [run(children)]
        : Array.isArray(children)
          ? children
          : [children],
  });

const blank = (n = 1) => Array.from({ length: n }, () => para(""));

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

/** "13th Month pro-rated" -> 13 + superscript th, so it looks like the samples. */
function benefitRuns(text: string): TextRun[] {
  const m = text.match(/^(.*?\b\d+)(st|nd|rd|th)\b(.*)$/i);
  if (!m) return [run(text)];
  return [
    run(m[1]),
    new TextRun({ text: m[2], font: FONT, size: SZ, superScript: true }),
    run(m[3]),
  ];
}

/** Splits "Name (Title)" -> { name, title } */
function splitNameTitle(s: string): { name: string; title?: string } {
  const m = s.match(/^(.*?)\s*\((.+)\)\s*$/);
  return m ? { name: m[1].trim(), title: m[2].trim() } : { name: s.trim() };
}

const ensureComma = (s: string) =>
  /[,:]\s*$/.test(s.trim()) ? s.trim() : `${s.trim()},`;
const NAME_PARTICLES = new Set([
  "de",
  "del",
  "dela",
  "delos",
  "van",
  "von",
  "san",
  "santa",
  "la",
  "los",
  "da",
  "di",
]);

function lastName(full: string): string {
  const parts = full
    .trim()
    .split(/\s+/)
    .filter((p) => p && !/^(jr|sr|ii|iii|iv)\.?$/i.test(p));
  if (!parts.length) return "";
  let i = parts.length - 1;
  while (
    i > 0 &&
    NAME_PARTICLES.has(parts[i - 1].toLowerCase().replace(/\./g, ""))
  )
    i--;
  return parts
    .slice(i)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** "Mr." + "Justin M. De Castro" -> "Dear Mr. De Castro," */
function buildSalutation(salutation: string, applicantName: string): string {
  const t = salutation.trim();
  if (/^dear\b/i.test(t)) return ensureComma(t);
  if (/^(mr|ms|mrs|miss|engr|atty|dr)\.?$/i.test(t)) {
    const title = /\.$/.test(t) || /^miss$/i.test(t) ? t : `${t}.`;
    return `Dear ${title} ${lastName(applicantName)},`;
  }
  return ensureComma(t);
}

type Signer = { name: string; title?: string; titleLine2?: string };

/** Left: "Conformed by" signers stacked. Right: "Received by", bottom-aligned
 *  next to the last signer. One table row, so it never splits across pages. */
function signaturesTable(signers: Signer[], applicantName: string) {
  const left = 6200;
  const right = CONTENT_W - left;

  const leftKids: Paragraph[] = [
    para([signRun("Conformed by:")], { after: 60 }),
  ];
  signers.forEach((c) => {
    leftKids.push(
      para([signRun(c.name.toUpperCase(), { bold: true, underline: true })], {
        before: 300,
      }),
    );
    if (c.title) leftKids.push(para([signRun(c.title)]));
    if (c.titleLine2)
      leftKids.push(para([signRun(c.titleLine2, { size: SZ_SMALL })]));
  });

  const rightKids: Paragraph[] = [
    para([signRun("Received by:")]),
    para(""),
    para(""),
    para([
      signRun(applicantName.toUpperCase(), { bold: true, underline: true }),
    ]),
    para([signRun("Signature over printed Name")]),
  ];

  const cell = (
    w: number,
    kids: Paragraph[],
    align: "top" | "center" | "bottom",
  ) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      borders: noBorders,
      verticalAlign: align,
      margins: { top: 0, bottom: 0, left: 0, right: 80 },
      children: kids,
    });

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [left, right],
    borders: {
      ...noBorders,
      insideHorizontal: noBorders.top,
      insideVertical: noBorders.top,
    },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(left, leftKids, VerticalAlign.TOP),
          cell(right, rightKids, VerticalAlign.BOTTOM),
        ],
      }),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function detailsTable(label: [string, TextRun[][]][]) {
  const colW = [2300, 360, CONTENT_W - 567 - 2300 - 360];
  const cell = (w: number, kids: Paragraph[]) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      borders: noBorders,
      margins: { top: 20, bottom: 20, left: 40, right: 40 },
      children: kids,
    });

  return new Table({
    width: { size: colW.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: colW,
    indent: { size: 567, type: WidthType.DXA },
    borders: {
      ...noBorders,
      insideHorizontal: noBorders.top,
      insideVertical: noBorders.top,
    },
    rows: label.map(
      ([k, lines]) =>
        new TableRow({
          cantSplit: true,
          children: [
            cell(colW[0], [para([run(k, { bold: true })])]),
            cell(colW[1], [para([run(":")])]),
            cell(
              colW[2],
              lines.map((l) => para(l)),
            ),
          ],
        }),
    ),
  });
}

/** Job description text -> paragraphs. Lines starting with a bullet char become bullets,
 *  lines ending in ":" become bold sub-headings, everything else is a normal paragraph.
 *  The heading uses the saved job description's title (e.g. "Videographer"), and the
 *  first paragraph starts with that title in bold, like the sample Annex. */
function jobDescriptionBlocks(
  job: NonNullable<JobOfferDocInput["job"]>,
  position: string,
  layout: Layout,
): Paragraph[] {
  const out: Paragraph[] = [];
  const jdTitle = job.title?.trim() || position;
  const isBullet = (l: string) => /^\s*([-*•●▪◦]|\d+[.)])\s+/.test(l);
  const stripBullet = (l: string) =>
    l.replace(/^\s*([-*•●▪◦]|\d+[.)])\s+/, "");
  const bullet = (t: string) =>
    new Paragraph({
      numbering: { reference: "bullets", level: 0 },
      spacing: { after: 40, line: 240 },
      children: [run(t)],
    });

  if (layout === "default") {
    out.push(
      para([run("“Annex A”", { bold: true })], {
        align: AlignmentType.CENTER,
        after: 200,
      }),
    );
  }
  out.push(
    para([run(`Job Description – ${jdTitle}`, { bold: true })], {
      after: 160,
      keepNext: true,
    }),
  );
  const hasStructure = (job.description ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .some((l) => isBullet(l) || (/:\s*$/.test(l) && l.length < 90));
  // Blank line = new paragraph. Consecutive plain lines are just wrapped text
  // (e.g. pasted from a PDF) and are joined into ONE paragraph.
  let buf: string[] = [];
  let firstPara = true;
  const flush = () => {
    if (!buf.length) return;
    const text = buf.join(" ");
    const startsWithTitle = text
      .toLowerCase()
      .startsWith(jdTitle.toLowerCase());
    const looksLikeSummary = startsWithTitle || text.length > 220;

    // Lumang format: maikling paragraph = duty, kaya bullet.
    if (!hasStructure && !looksLikeSummary) {
      out.push(bullet(text));
      buf = [];
      return;
    }

    const runs =
      firstPara && startsWithTitle
        ? [
            run(text.slice(0, jdTitle.length), { bold: true }),
            run(text.slice(jdTitle.length)),
          ]
        : [run(text)];
    out.push(para(runs, { after: 120, align: AlignmentType.JUSTIFIED }));
    firstPara = false;
    buf = [];
  };
  for (const raw of (job.description ?? "").split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) flush();
    else if (isBullet(l)) {
      flush();
      out.push(bullet(stripBullet(l)));
    } else if (/:\s*$/.test(l) && l.length < 90) {
      flush();
      out.push(
        para([run(l, { bold: true })], {
          before: 160,
          after: 80,
          keepNext: true,
        }),
      );
    } else buf.push(l);
  }
  flush();

  const quals = (job.qualifications ?? []).filter(Boolean);
  if (quals.length) {
    out.push(
      para([run("Qualifications:", { bold: true })], {
        before: 160,
        after: 80,
        keepNext: true,
      }),
    );
    quals.forEach((q) => out.push(bullet(q)));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export async function buildJobOfferDocx(i: JobOfferDocInput): Promise<Buffer> {
  const lh = LETTERHEADS[i.letterhead === "alt" ? "alt" : "main"];
  const layout: Layout = i.layout ?? pickLayout(i.job?.department);
  const isIT = layout === "it";
  const hasJD = !!(i.job?.description?.trim() || i.job?.qualifications?.length);

  const logo = await loadAsset(lh.logo);

  // Keep the logo's real aspect ratio: fix the width, compute the height.
  const dims = imageSize(logo);
  const logoWidth = lh.logoSize.width;
  const logoHeight =
    dims.width && dims.height
      ? Math.round((logoWidth * dims.height) / dims.width)
      : lh.logoSize.height;

  /* ---- header (logo, + address block for IT layout) ---- */
  const headerKids: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: isIT ? 60 : 0 },
      children: [
        new ImageRun({
          type: "png",
          data: logo,
          transformation: { width: logoWidth, height: logoHeight },
          altText: {
            title: "Letterhead",
            description: lh.companyLong,
            name: "logo",
          },
        }),
      ],
    }),
  ];
  if (isIT) {
    for (const l of lh.addressLines) {
      headerKids.push(
        para([run(l, { size: 18 })], { align: AlignmentType.CENTER }),
      );
    }
  }

  /* ---- footer ----
   * Company contact footer on BOTH layouts when the letterhead has one.
   * Letterheads without a footer (alt) repeat the address lines, default layout only
   * (the IT layout already prints them under the logo). */
  const footerKids: Paragraph[] = [];
  if (lh.footer) {
    footerKids.push(
      para([run(lh.footer.boldLine, { bold: true, size: SZ_SMALL })], {
        align: AlignmentType.CENTER,
      }),
    );
    footerKids.push(
      para([run(lh.footer.line, { size: SZ_SMALL })], {
        align: AlignmentType.CENTER,
      }),
    );
  } else if (!isIT) {
    lh.addressLines.forEach((l) =>
      footerKids.push(
        para([run(l, { size: SZ_SMALL })], { align: AlignmentType.CENTER }),
      ),
    );
  }

  /* ---- body ---- */
  const body: (Paragraph | Table)[] = [];
  const mr = splitNameTitle(i.reportingTo);
  const sigName = i.signatory.trim().toUpperCase();
  const sigTitle =
    i.signatoryTitle ?? (isIT ? "Admin Supervisor/HR" : "Admin Assistant");

  // date
  body.push(
    para([run(i.letterDateLong, isIT ? { bold: true } : {})], {
      align: AlignmentType.RIGHT,
      after: 200,
    }),
  );

  // title
  body.push(
    para(
      [
        run(
          i.revised
            ? "-  R E V I S E D   J O B   O F F E R  -"
            : "-  J O B   O F F E R  -",
          { bold: true, characterSpacing: 20 },
        ),
      ],
      {
        align: AlignmentType.CENTER,
        after: 240,
      },
    ),
  );

  // addressee
  if (isIT) {
    body.push(para([run(i.applicantName, { bold: true })]));
    if (i.address) body.push(para(i.address));
  } else {
    body.push(para([run(i.applicantName.toUpperCase(), { bold: true })]));
    if (i.address)
      body.push(para([run(i.address, { bold: true, italics: true })]));
  }
  body.push(...blank());

  body.push(
    para(buildSalutation(i.salutation, i.applicantName), { after: 200 }),
  );

  // intro
  const start = (underline: boolean) =>
    run(i.startDateLong, { bold: true, underline });
  if (isIT) {
    body.push(
      para(
        [
          run("We are pleased to formally offer you employment with "),
          run(lh.companyLong, { bold: true }),
          run(
            i.revised
              ? ` under the revised position stated below. This Job Offer supersedes the previous offer issued for the position of `
              : ` for the position stated below. `,
          ),
          ...(i.revised
            ? [
                run(i.supersedesPosition ?? "the previous position", {
                  italics: true,
                }),
                run(". "),
              ]
            : []),
          run("Commencing start will be on "),
          start(false),
          run(". As such, we are offering you the following:"),
        ],
        { align: AlignmentType.JUSTIFIED, after: 200 },
      ),
    );
  } else {
    body.push(
      para(
        [
          run(
            `Greetings from ${lh.company}! We are delighted to inform you that you have been chosen to work with us as our `,
          ),
          run(i.position, { bold: true }),
          run(". Commencing will be on "),
          start(true),
          run(". As such, we are offering you the following:"),
        ],
        { align: AlignmentType.JUSTIFIED, after: 200 },
      ),
    );
  }

  // details table
  const sched = DEFAULT_SCHEDULE_TAIL[layout];
  const scheduleRuns = i.workingSchedule
    ? [run(i.workingSchedule)]
    : [run(sched.pre), run(sched.ul, { underline: true }), run(sched.post)];

  const rows: [string, TextRun[][]][] = [
    [
      "Job Title",
      [[run(isIT ? i.position : i.position.toUpperCase(), { bold: true })]],
    ],
    ["Employment Type", [[run(i.employmentType.toUpperCase())]]],
    ["Starting Salary", [[run(i.salaryWords)]]],
    ["Benefits", (i.benefits.length ? i.benefits : ["—"]).map(benefitRuns)],
    ["Reporting to", [[run(i.reportingTo)]]],
    ["Working Schedule", [scheduleRuns]],
  ];
  body.push(detailsTable(rows));
  body.push(...blank());

  // closing paragraph
  if (isIT) {
    body.push(
      para(
        "By signing below, you confirm your acceptance of this " +
          (i.revised ? "revised " : "") +
          "Job Offer and agree to comply with all company rules, policies, and standards.",
        {
          align: AlignmentType.JUSTIFIED,
          after: 240,
        },
      ),
    );
  } else {
    body.push(
      para(
        (hasJD
          ? "Thus, attached herewith your Job Offer is a copy of the Job Description for your reference. And after "
          : "After ") +
          "thoroughly deciding to accept our Job offer, kindly put your signature and send back to us twenty-four (24) hours upon receiving the Job Offer.",
        { align: AlignmentType.JUSTIFIED, after: 240 },
      ),
    );
  }

  // signatures
  body.push(para([signRun("Sincerely,")], { keepNext: true, after: 60 }));

  // CHANGED: if the saved signature image is missing, leave blank signing space
  // instead of crashing the whole offer.
  const sig = SIGNATURES[sigName];
  let sigData: Buffer | null = null;
  if (sig) {
    try {
      sigData = await loadAsset(sig.file);
    } catch (e) {
      console.warn("job-offer: signature image not found", sig.file, e);
    }
  }
  if (sig && sigData) {
    body.push(
      new Paragraph({
        keepNext: true,
        spacing: { after: 0 },
        children: [
          new ImageRun({
            type: "png",
            data: sigData,
            transformation: { width: sig.width, height: sig.height },
            altText: { title: "Signature", description: sigName, name: "sig" },
          }),
        ],
      }),
    );
  } else {
    body.push(...blank(2));
  }
  body.push(
    para([signRun(sigName, { bold: true, underline: true })], {
      keepNext: true,
    }),
  );
  body.push(para([signRun(sigTitle)], { after: isIT ? 100 : 240 }));

  // CHANGED: IT layout = "Conformed by" stacked on the left, "Received by" on the
  // right (bottom-aligned), all in one table row.
  if (isIT) {
    const conformed: Signer[] = i.conformedBy?.length ? i.conformedBy : [mr];
    body.push(signaturesTable(conformed, i.applicantName));
  } else {
    body.push(
      para([signRun("Received by:")], { keepNext: true }),
      ...blank(),
      para(
        [
          signRun(i.applicantName.toUpperCase(), {
            bold: true,
            underline: true,
          }),
        ],
        { keepNext: true },
      ),
      para([signRun("Signature over printed Name")]),
    );
  }

  // job description annex
  if (hasJD) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(...jobDescriptionBlocks(i.job!, i.position, layout));
  }

  const doc = new Document({
    creator: lh.companyLong,
    title: `Job Offer - ${i.applicantName}`,
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "●",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 540, hanging: 270 } },
                run: { font: FONT, size: 18 },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.w, height: PAGE.h },
            margin: {
              top: isIT ? 2300 : 1900,
              bottom: 850,
              left: MARGIN_X,
              right: MARGIN_X,
              header: 400,
              footer: 300,
            },
          },
        },
        headers: { default: new Header({ children: headerKids }) },
        footers: {
          default: new Footer({
            children: footerKids.length ? footerKids : [para("")],
          }),
        },
        children: body,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
