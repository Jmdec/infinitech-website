// File: lib/payroll-export.ts
//
// Exports the payroll table as a real Excel file (.xlsx) or a JPG image.
// No extra packages needed: the .xlsx is built by hand and the JPG is drawn
// on a <canvas> (same approach as the payslip image in lib/api.ts).

export type ExportGroup = "details" | "earnings" | "deductions" | "net";

// text/name = plain text, plain = number (dash when 0),
// money = 2 decimals (dash when 0), amount = 2 decimals (0.00 when 0).
export type ExportKind = "text" | "name" | "plain" | "money" | "amount";

export type ExportColumn = {
  label: string;
  group: ExportGroup;
  kind: ExportKind;
};

export type PayrollExportData = {
  title: string;
  fileName: string; // without extension
  columns: ExportColumn[];
  rows: (string | number)[][];
  // column index -> total shown in the TOTAL row
  totals: Record<number, number>;
};

const GROUP_LABEL: Record<ExportGroup, string> = {
  details: "EMPLOYEE DETAILS",
  earnings: "EARNINGS",
  deductions: "DEDUCTIONS",
  net: "NET PAY",
};

// ── shared helpers ──
const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const toNumber = (v: string | number | undefined) =>
  typeof v === "number" ? v : Number(v) || 0;

function display(col: ExportColumn, v: string | number | undefined): string {
  if (col.kind === "text" || col.kind === "name") return String(v ?? "");

  const n = toNumber(v);

  if (col.kind === "plain") return n ? String(Math.round(n * 100) / 100) : "—";
  if (col.kind === "money") return n === 0 ? "—" : fmt(n);

  return fmt(n);
}

// Contiguous runs of the same group, e.g. details 0-2, earnings 3-13 ...
function groupRuns(columns: ExportColumn[]) {
  const runs: { group: ExportGroup; from: number; to: number }[] = [];

  columns.forEach((c, i) => {
    const last = runs[runs.length - 1];

    if (last && last.group === c.group) last.to = i;
    else runs.push({ group: c.group, from: i, to: i });
  });

  return runs;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ────────────────────────────────────────────────────────────────────────────
 * EXCEL (.xlsx)
 * ──────────────────────────────────────────────────────────────────────────── */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const colName = (index: number) => {
  let n = index + 1;
  let s = "";

  while (n > 0) {
    const r = (n - 1) % 26;

    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }

  return s;
};

// Style indexes (see STYLES_XML below).
const S = {
  hdr: { details: 1, earnings: 2, deductions: 3, net: 4 } as Record<
    ExportGroup,
    number
  >,
  text: 5,
  name: 6,
  money: 7,
  plain: 8,
  totalLabel: 9,
  totalMoney: 10,
  totalEmpty: 11,
  totalNet: 12,
  amount: 13,
  title: 14,
};

const FILLS = [
  "FFFDE68A", // 2 amber
  "FFBBF7D0", // 3 green
  "FFFECDD3", // 4 rose
  "FFCFFAFE", // 5 cyan
  "FFE2E8F0", // 6 slate
  "FFFEF9C3", // 7 yellow
];

const xf = (
  numFmtId: number,
  fontId: number,
  fillId: number,
  borderId: number,
  align = "",
) =>
  `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${
    align ? `<alignment ${align}/>` : ""
  }</xf>`;

const CENTER = 'horizontal="center" vertical="center" wrapText="1"';
const RIGHT = 'horizontal="right" vertical="center"';
const LEFT = 'horizontal="left" vertical="center"';

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;-#,##0.00;&quot;—&quot;"/><numFmt numFmtId="165" formatCode="General;-General;&quot;—&quot;"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="${2 + FILLS.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${FILLS.map(
  (c) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`,
).join("")}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
${[
  xf(0, 0, 0, 0), // 0 default
  xf(0, 1, 2, 1, CENTER), // 1 header: details (amber)
  xf(0, 1, 3, 1, CENTER), // 2 header: earnings (green)
  xf(0, 1, 4, 1, CENTER), // 3 header: deductions (rose)
  xf(0, 1, 5, 1, CENTER), // 4 header: net (cyan)
  xf(0, 0, 0, 1, 'horizontal="center" vertical="center"'), // 5 text
  xf(0, 0, 7, 1, LEFT), // 6 name (yellow)
  xf(164, 0, 0, 1, RIGHT), // 7 money, dash when 0
  xf(165, 0, 0, 1, RIGHT), // 8 plain number, dash when 0
  xf(0, 1, 6, 1, RIGHT), // 9 total label
  xf(4, 1, 6, 1, RIGHT), // 10 total money
  xf(0, 1, 6, 1), // 11 total empty
  xf(4, 1, 5, 1, RIGHT), // 12 total net
  xf(4, 0, 0, 1, RIGHT), // 13 amount, 0.00 when 0
  xf(0, 2, 0, 0, LEFT), // 14 title
].join("\n")}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function buildSheetXml(d: PayrollExportData): string {
  const cols = d.columns;
  const runs = groupRuns(cols);
  const kindStyle: Record<ExportKind, number> = {
    text: S.text,
    name: S.name,
    plain: S.plain,
    money: S.money,
    amount: S.amount,
  };

  const strCell = (ref: string, style: number, text: string) =>
    `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(
      text,
    )}</t></is></c>`;
  const numCell = (ref: string, style: number, n: number) =>
    `<c r="${ref}" s="${style}"><v>${n}</v></c>`;
  const blankCell = (ref: string, style: number) =>
    `<c r="${ref}" s="${style}"/>`;

  const rowsXml: string[] = [];

  // 1: title
  rowsXml.push(
    `<row r="1" ht="24" customHeight="1">${strCell("A1", S.title, d.title)}</row>`,
  );

  // 2: group header (merged)
  rowsXml.push(
    `<row r="2" ht="22" customHeight="1">${cols
      .map((c, i) => {
        const run = runs.find((r) => i >= r.from && i <= r.to)!;
        const ref = `${colName(i)}2`;

        return i === run.from
          ? strCell(ref, S.hdr[c.group], GROUP_LABEL[c.group])
          : blankCell(ref, S.hdr[c.group]);
      })
      .join("")}</row>`,
  );

  // 3: column labels
  rowsXml.push(
    `<row r="3" ht="32" customHeight="1">${cols
      .map((c, i) => strCell(`${colName(i)}3`, S.hdr[c.group], c.label))
      .join("")}</row>`,
  );

  // data rows
  d.rows.forEach((row, r) => {
    const n = r + 4;

    rowsXml.push(
      `<row r="${n}">${cols
        .map((c, i) => {
          const ref = `${colName(i)}${n}`;
          const v = row[i];

          if (c.kind === "text" || c.kind === "name") {
            return strCell(ref, kindStyle[c.kind], String(v ?? ""));
          }

          return numCell(ref, kindStyle[c.kind], toNumber(v));
        })
        .join("")}</row>`,
    );
  });

  // total row
  if (d.rows.length > 0) {
    const n = d.rows.length + 4;
    const labelCol = Math.max(
      0,
      cols.findIndex((c) => c.kind === "name"),
    );

    rowsXml.push(
      `<row r="${n}">${cols
        .map((c, i) => {
          const ref = `${colName(i)}${n}`;

          if (i === labelCol) return strCell(ref, S.totalLabel, "TOTAL");
          if (i in d.totals) {
            return numCell(
              ref,
              c.group === "net" ? S.totalNet : S.totalMoney,
              Math.round(d.totals[i] * 100) / 100,
            );
          }

          return blankCell(ref, S.totalEmpty);
        })
        .join("")}</row>`,
    );
  }

  const widths = cols.map((c) =>
    c.kind === "name" ? 34 : c.kind === "text" ? 12 : 16,
  );
  const merges = runs.filter((r) => r.to > r.from);
  const lastRow = d.rows.length > 0 ? d.rows.length + 4 : 3;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${colName(cols.length - 1)}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane xSplit="3" ySplit="3" topLeftCell="D4" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths
    .map(
      (w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
    )
    .join("")}</cols>
<sheetData>${rowsXml.join("")}</sheetData>
${
  merges.length
    ? `<mergeCells count="${merges.length}">${merges
        .map((m) => `<mergeCell ref="${colName(m.from)}2:${colName(m.to)}2"/>`)
        .join("")}</mergeCells>`
    : ""
}
</worksheet>`;
}

// ── tiny ZIP writer (no compression) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;

    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }

  return t;
})();

const crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;

  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }

  return (c ^ 0xffffffff) >>> 0;
};

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);

    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);

    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);

    parts.push(local, f.data);
    central.push(cen);
    offset += local.length + size;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);

  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let pos = 0;

  for (const p of all) {
    out.set(p, pos);
    pos += p.length;
  }

  return out;
}

// Returns the raw bytes of the .xlsx file.
export function buildPayrollXlsx(d: PayrollExportData): Uint8Array {
  const enc = new TextEncoder();
  const xml = (s: string) => enc.encode(s);

  return zip([
    {
      name: "[Content_Types].xml",
      data: xml(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: xml(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: xml(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Payroll" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: xml(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    { name: "xl/styles.xml", data: xml(STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: xml(buildSheetXml(d)) },
  ]);
}

export function exportPayrollXlsx(d: PayrollExportData) {
  const bytes = buildPayrollXlsx(d);
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  saveBlob(blob, `${d.fileName}.xlsx`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * JPG
 * ──────────────────────────────────────────────────────────────────────────── */

const GROUP_BG: Record<ExportGroup, string> = {
  details: "#fde68a",
  earnings: "#bbf7d0",
  deductions: "#fecdd3",
  net: "#cffafe",
};

const LABEL_BG: Record<ExportGroup, string> = {
  details: "#e2e8f0",
  earnings: "#dcfce7",
  deductions: "#ffe4e6",
  net: "#ecfeff",
};

export function renderPayrollCanvas(d: PayrollExportData): HTMLCanvasElement {
  const cols = d.columns;
  const FONT = "Calibri, 'Segoe UI', Arial, sans-serif";
  const TITLE_H = 40;
  const GROUP_H = 28;
  const LABEL_H = 40;
  const ROW_H = 28;
  const TOTAL_H = 30;
  const PAD = 12;

  const widths = cols.map((c) =>
    c.kind === "name" ? 280 : c.kind === "text" ? 96 : 124,
  );
  const tableW = widths.reduce((a, b) => a + b, 0);
  const W = tableW + PAD * 2;
  const hasTotal = d.rows.length > 0;
  const H =
    PAD * 2 +
    TITLE_H +
    GROUP_H +
    LABEL_H +
    d.rows.length * ROW_H +
    (hasTotal ? TOTAL_H : 0);

  // Sharper image, but keep the canvas a sane size.
  const scale = Math.min(2, 9000 / W);

  const canvas = document.createElement("canvas");

  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d")!;

  ctx.scale(scale, scale);

  // JPG has no transparency, so paint white first.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const xs: number[] = [];
  let acc = PAD;

  for (const w of widths) {
    xs.push(acc);
    acc += w;
  }

  const cell = (
    i: number,
    y: number,
    h: number,
    bg: string | null,
    text: string,
    opts: {
      align?: "left" | "center" | "right";
      bold?: boolean;
      size?: number;
      color?: string;
    } = {},
  ) => {
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(xs[i], y, widths[i], h);
    }
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(xs[i] + 0.5, y + 0.5, widths[i] - 1, h - 1);

    if (!text) return;

    const align = opts.align ?? "center";

    ctx.font = `${opts.bold ? "bold " : ""}${opts.size ?? 13}px ${FONT}`;
    ctx.fillStyle = opts.color ?? "#0f172a";
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const x =
      align === "left"
        ? xs[i] + 8
        : align === "right"
          ? xs[i] + widths[i] - 8
          : xs[i] + widths[i] / 2;

    ctx.fillText(text, x, y + h / 2 + 1);
  };

  let y = PAD;

  // title
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(d.title, PAD, y + TITLE_H / 2);
  y += TITLE_H;

  // group header (merged)
  for (const run of groupRuns(cols)) {
    const x0 = xs[run.from];
    const x1 = xs[run.to] + widths[run.to];

    ctx.fillStyle = GROUP_BG[run.group];
    ctx.fillRect(x0, y, x1 - x0, GROUP_H);
    ctx.strokeStyle = "#cbd5e1";
    ctx.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, GROUP_H - 1);
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(GROUP_LABEL[run.group], (x0 + x1) / 2, y + GROUP_H / 2 + 1);
  }
  y += GROUP_H;

  // column labels (wrap onto two lines when too long)
  cols.forEach((c, i) => {
    cell(i, y, LABEL_H, LABEL_BG[c.group], "");
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const cx = xs[i] + widths[i] / 2;
    const words = c.label.split(" ");

    if (words.length > 1 && ctx.measureText(c.label).width > widths[i] - 12) {
      const mid = Math.ceil(words.length / 2);

      ctx.fillText(words.slice(0, mid).join(" "), cx, y + LABEL_H / 2 - 7);
      ctx.fillText(words.slice(mid).join(" "), cx, y + LABEL_H / 2 + 8);
    } else {
      ctx.fillText(c.label, cx, y + LABEL_H / 2 + 1);
    }
  });
  y += LABEL_H;

  // data rows
  for (const row of d.rows) {
    cols.forEach((c, i) => {
      const isText = c.kind === "text" || c.kind === "name";
      const bg =
        c.kind === "name" ? "#fef9c3" : c.group === "net" ? "#ecfeff" : null;

      cell(i, y, ROW_H, bg, display(c, row[i]), {
        align: c.kind === "name" ? "left" : isText ? "center" : "right",
        bold: c.group === "net",
      });
    });
    y += ROW_H;
  }

  // total row
  if (hasTotal) {
    const labelCol = Math.max(
      0,
      cols.findIndex((c) => c.kind === "name"),
    );

    cols.forEach((c, i) => {
      const isNet = c.group === "net";
      const bg = isNet ? "#cffafe" : "#f1f5f9";

      if (i === labelCol) {
        cell(i, y, TOTAL_H, bg, "TOTAL", { align: "right", bold: true });
      } else if (i in d.totals) {
        cell(i, y, TOTAL_H, bg, fmt(d.totals[i]), {
          align: "right",
          bold: true,
        });
      } else {
        cell(i, y, TOTAL_H, bg, "");
      }
    });
  }

  return canvas;
}

export function exportPayrollJpg(d: PayrollExportData) {
  const canvas = renderPayrollCanvas(d);

  canvas.toBlob(
    (blob) => {
      if (blob) saveBlob(blob, `${d.fileName}.jpg`);
    },
    "image/jpeg",
    0.95,
  );
}
