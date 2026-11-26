import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type OfferPdfInput = {
  letterDateLong: string;
  salutation: string;
  applicantName: string;
  address: string;
  position: string;
  employmentType: string;
  startDateLong: string;
  salaryWords: string;
  benefits: string[];
  reportingTo: string;
  signatory: string;
  letterhead: "main" | "alt";
  job: {
    department?: string;
    description?: string;
    qualifications?: string[];
  } | null;
};

// Standard PDF fonts only support Latin-1 style characters.
const clean = (s: string) =>
  (s ?? "").replace(
    /[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022]/g,
    "?",
  );

export async function buildJobOfferPdf(
  input: OfferPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595;
  const H = 842;
  const M = 56;
  const maxW = W - M * 2;

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  // Optional letterhead on the first page
  try {
    const file = path.join(
      process.cwd(),
      "public",
      "letterheads",
      `${input.letterhead}.png`,
    );
    const img = await doc.embedPng(await readFile(file));
    const scale = Math.min(maxW / img.width, 90 / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, {
      x: (W - w) / 2,
      y: H - M - h + 20,
      width: w,
      height: h,
    });
    y = H - M - h - 10;
  } catch {
    /* no letterhead file: continue without it */
  }

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };

  const wrap = (
    text: string,
    f: PDFFont,
    size: number,
    width: number,
  ): string[] => {
    const lines: string[] = [];
    for (const rawLine of clean(text).split("\n")) {
      let line = "";
      for (const word of rawLine.split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) > width && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
  };

  const para = (
    text: string,
    o: { bold?: boolean; size?: number; gap?: number; indent?: number } = {},
  ) => {
    const size = o.size ?? 11;
    const f = o.bold ? bold : font;
    const indent = o.indent ?? 0;
    for (const line of wrap(text, f, size, maxW - indent)) {
      if (y - size < M) newPage();
      page.drawText(line, {
        x: M + indent,
        y: y - size,
        size,
        font: f,
        color: rgb(0.07, 0.07, 0.07),
      });
      y -= size * 1.45;
    }
    y -= o.gap ?? 8;
  };

  // ---- Offer letter ----
  para(input.letterDateLong, { gap: 12 });
  para(`${input.salutation} ${input.applicantName}`, { bold: true, gap: 0 });
  if (input.address) para(input.address, { gap: 12 });
  else y -= 12;

  para(`Dear ${input.salutation} ${input.applicantName},`, { gap: 10 });
  para(
    `We are pleased to offer you the position of ${input.position} (${input.employmentType}) at Infinitech, ` +
      `reporting to ${input.reportingTo}, effective ${input.startDateLong}.`,
    { gap: 10 },
  );

  para("Compensation", { bold: true, gap: 4 });
  para(`Your starting salary is ${input.salaryWords}.`, { gap: 10 });

  para("Benefits", { bold: true, gap: 4 });
  for (const b of input.benefits) para(`\u2022 ${b}`, { indent: 10, gap: 2 });
  y -= 8;

  para(
    "Please sign below and return a copy to confirm your acceptance of this offer.",
    { gap: 18 },
  );
  para("Sincerely,", { gap: 26 });
  para(input.signatory, { bold: true, gap: 0 });
  para("Infinitech", { gap: 26 });
  para("Conforme: ______________________________", { gap: 2 });
  para(`${input.applicantName}        Date: ______________`);

  // ---- Annex A ----
  newPage();
  para("Annex A: Job Description", { bold: true, size: 14, gap: 10 });
  para(
    input.job?.department
      ? `${input.position} - ${input.job.department}`
      : input.position,
    { bold: true, gap: 8 },
  );
  if (input.job?.description) para(input.job.description, { gap: 10 });
  if (input.job?.qualifications?.length) {
    para("Qualifications", { bold: true, gap: 4 });
    for (const q of input.job.qualifications)
      para(`\u2022 ${q}`, { indent: 10, gap: 2 });
  }

  return doc.save();
}
