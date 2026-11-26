// lib/careers/job-offer/description.ts
//
// Structured job description <-> the plain text that is stored in `job.description`
// and rendered by docx.ts:
//
//   Summary paragraph(s)
//
//   Marketing Functions:          <- a line ending in ":" becomes a bold heading
//   - Assist in planning ...      <- "- " lines become bullets
//
// Qualifications live in their own array (`job.qualifications`).

export type JobDescriptionSection = { heading: string; items: string[] };

export type JobDescriptionDoc = {
  summary: string; // one or more paragraphs, separated by a blank line
  sections: JobDescriptionSection[];
  qualifications: string[];
};

export const emptyJobDescription = (): JobDescriptionDoc => ({
  summary: "",
  sections: [{ heading: "Key Responsibilities", items: [""] }],
  qualifications: [],
});

const BULLET = /^\s*([-*•●▪◦]|\d+[.)])\s+/;
const clean = (a: string[]) => a.map((x) => x.trim()).filter(Boolean);

/**
 * Summary text -> paragraphs. Line breaks inside a paragraph are just wrapping
 * (e.g. text pasted from a PDF) and are joined with a space; only a BLANK line
 * starts a new paragraph.
 */
export function summaryParagraphs(text: string | null | undefined): string[] {
  return String(text ?? "")
    .split(/\r?\n[ \t]*\r?\n/)
    .map((p) =>
      p
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);
}

/** One block per heading; consecutive heading-less sections merge into the list before them. */
export function sectionBlocks(
  sections: JobDescriptionSection[],
): JobDescriptionSection[] {
  const out: JobDescriptionSection[] = [];
  for (const s of sections) {
    const items = clean(s.items);
    if (!items.length) continue;
    const heading = s.heading.trim().replace(/:+$/, "");
    const last = out[out.length - 1];
    if (!heading && last) last.items.push(...items);
    else out.push({ heading, items });
  }
  return out;
}

// Blank line between paragraphs/sections, one line per bullet.
export function serializeJobDescription(doc: JobDescriptionDoc): string {
  const blocks: string[] = [...summaryParagraphs(doc.summary)];
  for (const s of sectionBlocks(doc.sections)) {
    blocks.push(
      [
        ...(s.heading ? [`${s.heading}:`] : []),
        ...s.items.map((i) => `- ${i}`),
      ].join("\n"),
    );
  }
  return blocks.join("\n\n");
}

export function parseJobDescription(
  text: string | null | undefined,
  qualifications: string[] = [],
): JobDescriptionDoc {
  const doc: JobDescriptionDoc = {
    summary: "",
    sections: [],
    qualifications: clean(qualifications),
  };
  const paragraphs: string[] = [];
  let para: string[] = [];
  let cur: JobDescriptionSection | null = null;
  const flush = () => {
    if (para.length) paragraphs.push(para.join(" "));
    para = [];
  };

  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (BULLET.test(line)) {
      flush();
      if (!cur) doc.sections.push((cur = { heading: "", items: [] }));
      cur.items.push(line.replace(BULLET, ""));
    } else if (/:\s*$/.test(line) && line.length < 90) {
      flush();
      doc.sections.push(
        (cur = { heading: line.replace(/:\s*$/, ""), items: [] }),
      );
    } else if (!cur) {
      para.push(line); // still in the summary (wrapped lines are joined)
    } else {
      flush();
      cur.items.push(line); // stray text after a section: keep it as an item
    }
  }
  flush();
  doc.summary = paragraphs.join("\n\n");
  if (!doc.sections.length)
    doc.sections.push({ heading: "Key Responsibilities", items: [""] });
  return doc;
}
