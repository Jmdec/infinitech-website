// File: lib/careers/job-offer/renderPdf.ts
// Renders an OfferDocument to a PDF (A4) using pdf-lib.  npm i pdf-lib

import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import type { OfferDocument, Segment } from "./types";

const PW = 595.28;
const PH = 841.89;
const MX = 70; // left/right margin
const BOTTOM = 70; // content must stay above this (footer lives below)
const SIZE = 11.5;
const LEADING = 1.3;

// pdf-lib measures with kerning but draws without it, which makes words collide.
// Measure glyph-by-glyph so the width matches what is actually drawn.
function measure(font: PDFFont, text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += font.widthOfTextAtSize(ch, size);
  return w;
}

type Tok = {
  text: string;
  bold?: boolean;
  underline?: boolean;
  sup?: boolean;
  space: boolean;
};
type Placed = Tok & { w: number };

function tokenize(segs: Segment[]): Tok[] {
  const toks: Tok[] = [];
  for (const s of segs) {
    for (const part of s.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        if (toks.length) toks[toks.length - 1].space = true;
      } else {
        toks.push({
          text: part,
          bold: s.bold,
          underline: s.underline,
          sup: s.sup,
          space: false,
        });
      }
    }
  }
  return toks;
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private pdf: PDFDocument,
    private reg: PDFFont,
    private bold: PDFFont,
    private doc: OfferDocument,
    private logo: PDFImage | null,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([PW, PH]);
    let y = PH - 30;
    if (this.logo) {
      const w = 100;
      const h = (this.logo.height / this.logo.width) * w;
      this.page.drawImage(this.logo, {
        x: (PW - w) / 2,
        y: y - h,
        width: w,
        height: h,
      });
      y -= h + 8;
    }
    for (const line of this.doc.letterhead.headerLines) {
      this.center(line, y - 8, 9, false);
      y -= 12;
    }
    const footer = this.doc.letterhead.footerLines;
    footer.forEach((line, i) =>
      this.center(
        line,
        38 + (footer.length - 1 - i) * 11,
        8.5,
        i === 0 && false,
      ),
    );
    this.y = y - 22;
  }

  ensure(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  gap(h: number) {
    this.y -= h;
  }

  center(text: string, y: number, size: number, bold: boolean) {
    const font = bold ? this.bold : this.reg;
    const w = measure(font, text, size);
    this.page.drawText(text, { x: (PW - w) / 2, y, size, font });
  }

  right(text: string, size: number) {
    const w = measure(this.reg, text, size);
    this.page.drawText(text, {
      x: PW - MX - w,
      y: this.y,
      size,
      font: this.reg,
    });
    this.y -= size * LEADING;
  }

  /** Draws wrapped rich text. Returns nothing; advances this.y. */
  rich(
    segs: Segment[],
    opts: { x?: number; width?: number; justify?: boolean; size?: number } = {},
  ) {
    const size = opts.size ?? SIZE;
    const x0 = opts.x ?? MX;
    const width = opts.width ?? PW - MX - x0;
    const spaceW = measure(this.reg, " ", size);
    const toks: Placed[] = tokenize(segs).map((t) => ({
      ...t,
      w: measure(
        t.bold ? this.bold : this.reg,
        t.text,
        t.sup ? size * 0.65 : size,
      ),
    }));

    const lines: Placed[][] = [];
    let line: Placed[] = [];
    let used = 0;
    for (const t of toks) {
      const prevSpace = line.length && line[line.length - 1].space ? spaceW : 0;
      if (line.length && used + prevSpace + t.w > width) {
        lines.push(line);
        line = [];
        used = 0;
      }
      used += (line.length && line[line.length - 1].space ? spaceW : 0) + t.w;
      line.push(t);
    }
    if (line.length) lines.push(line);

    lines.forEach((ln, idx) => {
      this.ensure(size * LEADING);
      const last = idx === lines.length - 1;
      const natural = ln.reduce(
        (a, t, i) => a + t.w + (i < ln.length - 1 && t.space ? spaceW : 0),
        0,
      );
      const gaps = ln.filter((t, i) => i < ln.length - 1 && t.space).length;
      const extra =
        opts.justify && !last && gaps ? (width - natural) / gaps : 0;
      let x = x0;
      ln.forEach((t, i) => {
        const font = t.bold ? this.bold : this.reg;
        const ts = t.sup ? size * 0.65 : size;
        const ty = this.y - size + (t.sup ? size * 0.35 : 0);
        this.page.drawText(t.text, { x, y: ty, size: ts, font });
        const gap = i < ln.length - 1 && t.space ? spaceW + extra : 0;
        if (t.underline) {
          const next = ln[i + 1];
          const uw = t.w + (next?.underline && t.space ? gap : 0);
          this.page.drawLine({
            start: { x, y: ty - 1.5 },
            end: { x: x + uw, y: ty - 1.5 },
            thickness: 0.7,
            color: rgb(0, 0, 0),
          });
        }
        x += t.w + gap;
      });
      this.y -= size * LEADING;
    });
  }
}

async function loadLogo(
  pdf: PDFDocument,
  logoBytes?: Uint8Array,
): Promise<PDFImage | null> {
  if (!logoBytes) return null;
  return pdf.embedPng(logoBytes);
}

export async function renderOfferPdf(
  doc: OfferDocument,
  logoBytes?: Uint8Array,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Job Offer – ${doc.letter.recipientName}`);
  const reg = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const w = new Writer(pdf, reg, bold, doc, await loadLogo(pdf, logoBytes));
  const L = doc.letter;
  const b = (text: string, underline = false): Segment[] => [
    { text, bold: true, underline },
  ];

  /* ---------- Page 1: letter ---------- */
  w.right(L.date, SIZE);
  w.gap(4);
  w.center(`-  ${L.title}  -`, w.y - SIZE, 12, true);
  w.gap(SIZE * LEADING + 16);
  w.rich(b(L.recipientName), { size: SIZE });
  if (L.recipientAddress) w.rich(b(L.recipientAddress));
  w.gap(10);
  w.rich([{ text: L.dear }]);
  w.gap(8);
  w.rich(L.intro, { justify: true });
  w.gap(8);

  // Terms table
  const kx = MX + 38;
  const cx = kx + 112;
  const vx = cx + 12;
  for (const row of L.terms) {
    w.ensure(SIZE * LEADING * 2);
    const top = w.y;
    w.page.drawText(row.label, {
      x: kx,
      y: top - SIZE,
      size: SIZE,
      font: bold,
    });
    w.page.drawText(":", { x: cx, y: top - SIZE, size: SIZE, font: bold });
    for (const line of row.lines) w.rich(line, { x: vx, width: PW - MX - vx });
  }
  w.gap(10);

  w.rich([{ text: L.closing }], { justify: true });
  w.gap(8);
  w.ensure(190);
  w.rich([{ text: L.sincerely }]);
  w.gap(44);
  w.rich(b(L.signatory.name, true));
  w.rich([{ text: L.signatory.title }]);
  w.gap(34);
  w.rich([{ text: "Received by:" }]);
  w.rich(b(L.receivedBy.name, true));
  w.rich([{ text: L.receivedBy.caption }]);

  /* ---------- Page 2+: Annex A ---------- */
  w.newPage();
  const A = doc.annex;
  w.center(A.label, w.y - SIZE, SIZE, true);
  w.gap(SIZE * LEADING + 14);
  w.rich(b(A.title));
  w.gap(8);
  w.rich(A.intro, { justify: true });
  w.gap(8);
  w.rich(b(A.dutiesHeading));
  w.gap(4);
  for (const group of A.duties) {
    if (group.heading) {
      w.gap(4);
      w.rich(b(group.heading), { x: MX + 6 });
      w.gap(2);
    }
    for (const item of group.items) {
      w.ensure(SIZE * LEADING * 2);
      const top = w.y;
      w.page.drawText("\u2022", {
        x: MX + 8,
        y: top - SIZE,
        size: SIZE,
        font: reg,
      });
      w.rich([{ text: item }], {
        x: MX + 22,
        width: PW - MX - (MX + 22),
        justify: true,
      });
      w.gap(2);
    }
  }

  return pdf.save();
}
