// File: lib/careers/job-offer/job-descriptions.ts
//
// Finds the saved job description (Laravel `job_descriptions` table) to attach to a job offer.
// Matches by id if one is given, otherwise by the offered position title
// (exact -> contained -> same words in any order/with extra words), using the
// department to break ties.
// Never throws: if nothing is found the offer is simply sent without an Annex.

import { forwardToLaravel } from "./server";

export type SavedJobDescription = {
  id: number;
  title: string;
  department: string;
  description: string;
  qualifications: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const STOP = new Set(["a", "an", "and", "of", "the", "for", "to", "in"]);
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !STOP.has(w)),
  );

/** Share of the smaller word set found in the larger one (1 = every word of one title is in the other). */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let hit = 0;
  small.forEach((w) => {
    if (big.has(w)) hit++;
  });
  return hit / small.size;
}

const sameDept = (a?: string | null, b?: string | null) =>
  !!a && !!b && norm(a) === norm(b);

export async function findJobDescription(
  req: Request,
  opts: {
    id?: number | null;
    position?: string | null;
    department?: string | null;
  },
): Promise<SavedJobDescription | null> {
  try {
    // Uses the careers-permission route (HR can read it). The
    // /api/admin/job-descriptions route is superadmin-only.
    const res = await forwardToLaravel(
      req,
      "/api/admin/careers/job-descriptions",
      { method: "GET" },
    );
    if (!res.ok) {
      console.warn("job-offer: job descriptions lookup failed", res.status);
      return null;
    }
    const rows = ((await res.json())?.data ?? []) as SavedJobDescription[];

    if (opts.id) {
      const byId = rows.find((r) => r.id === Number(opts.id));
      if (byId) return byId;
    }

    if (opts.position) {
      const want = norm(opts.position);

      // 1) exact title match
      const exact = rows.find((r) => norm(r.title) === want);
      if (exact) return exact;

      // 2) "Photo/Videographer" vs "Videographer": accept only if exactly one
      //    saved title is contained in the position (or the other way round).
      const loose = rows.filter((r) => {
        const t = norm(r.title);
        return t && (want.includes(t) || t.includes(want));
      });
      if (loose.length === 1) return loose[0];

      // 3) Same words, extra/missing words: "Junior Developer" vs "Junior Web Developer".
      //    Every word of the shorter title must be in the longer one. If several rows
      //    qualify, the one in the same department wins; otherwise we give up rather
      //    than attach the wrong job description.
      const want3 = tokens(opts.position);
      const close = rows.filter((r) => overlap(want3, tokens(r.title)) === 1);
      if (close.length === 1) return close[0];
      if (close.length > 1) {
        const inDept = close.filter((r) =>
          sameDept(r.department, opts.department),
        );
        if (inDept.length === 1) return inDept[0];
      }
    }

    console.warn(
      "job-offer: no job description matched. position:",
      opts.position,
      "| saved titles:",
      rows.map((r) => `${r.title} [${r.department}]`),
    );
  } catch (e) {
    console.warn("job-offer: could not load job descriptions", e);
  }
  return null;
}
