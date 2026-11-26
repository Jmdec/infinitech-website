// lib/careers/job-offer/signatories.ts
//
// Looks up the people who sign a job offer straight from the Employee Masterfile
// (names + positions only, no signature images), so nobody has to type names/titles by hand:
//
//   HR / Admin Supervisor  -> signs the letter
//   Department head        -> "Reporting to" (head of the department the applicant applied to:
//                             Manager for IT, Supervisor for Multimedia, etc.)
//   IT Manager             -> "Conformed by" (IT layout)
//   Executive Assistant    -> "Conformed by" (IT layout)
//   CEO                    -> "Conformed by" (IT layout) + fallback "Reporting to"
//
// Matching is done on department/position text, so it keeps working when the people change.

export type Person = {
  id: number;
  name: string; // "Maria Krissa Charez R. Bongon"
  title: string; // position straight from the masterfile
  department: string;
};

export type Signatories = {
  hr?: Person;
  /** Admin Assistant / admin staff: signs the default (non-IT) layout. */
  admin?: Person;
  itManager?: Person;
  ea?: Person;
  ceo?: Person;
  /** Head of the department passed in `opts.department` (manager > head/director > supervisor > team lead). */
  head?: Person;
  all: Person[];
};

type MasterfileRow = {
  id: number;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  department?: string | null;
  position?: string | null;
  status?: string | null;
};

/* ---------------- config ---------------- */

const isActive = (r: MasterfileRow) =>
  String(r.status ?? "")
    .trim()
    .toLowerCase() === "active";
const pos = (r: MasterfileRow) => String(r.position ?? "");
const dept = (r: MasterfileRow) => String(r.department ?? "");

const ROLES = {
  ceo: (r: MasterfileRow) =>
    /chief executive officer|\bceo\b/i.test(pos(r)) &&
    !/assistant/i.test(pos(r)),
  ea: (r: MasterfileRow) => /executive assistant/i.test(pos(r)),
  // HR / Admin Supervisor (signs the IT layout). POSITION only, so people who merely sit
  // in the Admin department (e.g. a Liaison Officer) are never picked.
  hr: (r: MasterfileRow) =>
    /admin(istrative)?\s+(supervisor|manager|head)|\bhr\b|human resources?/i.test(
      pos(r),
    ) &&
    !/assistant|staff|clerk|chief|executive|\bceo\b|president/i.test(pos(r)),
  // Admin Assistant / admin staff (signs the default layout). Position only.
  admin: (r: MasterfileRow) =>
    /admin(istrative)?\s+(assistant|staff|officer|clerk)/i.test(pos(r)),
  itManager: (r: MasterfileRow) =>
    /manager/i.test(pos(r)) &&
    (/\b(it|information technology)\b/i.test(dept(r)) ||
      /\bit\b/i.test(pos(r))),
};

// Lower = higher up. Anything not matched here is not a "head".
const HEAD_RANKS: [RegExp, number][] = [
  [/manager/i, 1],
  [/\bhead\b|director/i, 2],
  [/supervisor/i, 3],
  [/team\s*lead(er)?|\blead\b/i, 4],
];
const ASSISTANT_PENALTY = 10; // "Assistant Manager" only wins if there is no real manager

/* ---------------- helpers ---------------- */

// Same shape the ID card uses: First M. Last Suffix
export function fullName(r: MasterfileRow): string {
  const mi = r.middle_name?.trim().charAt(0);
  return [
    r.first_name,
    mi ? `${mi.toUpperCase()}.` : null,
    r.last_name,
    r.suffix,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// "Information Technology", "IT Department", "I.T." -> "IT"; strips a trailing "Department".
function canonDept(s: string): string {
  const n = norm(s);
  if (
    /^(IT|I T|INFORMATION TECHNOLOGY|IT DEPARTMENT|WEB|WEB DEVELOPMENT)$/.test(
      n,
    )
  )
    return "IT";
  return n.replace(/ (DEPARTMENT|DEPT)$/, "");
}

function sameDepartment(a: string, b: string): boolean {
  const x = canonDept(a);
  const y = canonDept(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
}

function headRank(r: MasterfileRow): number | null {
  const p = pos(r);
  const hit = HEAD_RANKS.find(([re]) => re.test(p));
  if (!hit) return null;
  return hit[1] + (/assistant|asst|deputy/i.test(p) ? ASSISTANT_PENALTY : 0);
}

function toPerson(r: MasterfileRow): Person {
  return {
    id: r.id,
    name: fullName(r),
    title: pos(r).trim(),
    department: dept(r).trim(),
  };
}

/** Pure matching step (exported so it can be unit-tested without any network). */
export function pickPeople(
  rows: MasterfileRow[],
  opts: { reportingTo?: string; department?: string } | string = {},
): Signatories {
  // Older callers passed the reportingTo string directly.
  const { reportingTo, department } =
    typeof opts === "string"
      ? { reportingTo: opts, department: undefined }
      : opts;

  const active = rows.filter(isActive);
  const find = (fn: (r: MasterfileRow) => boolean, prefer?: string) => {
    const hits = active.filter(fn);
    if (!hits.length) return undefined;
    const want = prefer ? norm(prefer) : "";
    const hit =
      (want && hits.find((h) => want.includes(norm(fullName(h))))) || hits[0];
    return toPerson(hit);
  };

  // Head of the applicant's department: best-ranked manager/head/supervisor/lead in it.
  let head: Person | undefined;
  if (department?.trim()) {
    const ranked = active
      .filter((r) => sameDepartment(dept(r), department))
      .map((r) => ({ r, rank: headRank(r) }))
      .filter((x): x is { r: MasterfileRow; rank: number } => x.rank !== null)
      .sort((a, b) => a.rank - b.rank);
    if (ranked.length) head = toPerson(ranked[0].r);
  }

  const hr = find(ROLES.hr);
  const admin = find(ROLES.admin);
  const itManager = find(ROLES.itManager, reportingTo);
  const ea = find(ROLES.ea);
  const ceo = find(ROLES.ceo);
  if (!hr && !admin) {
    console.warn(
      "job-offer: no HR/admin signatory found in the masterfile. Positions seen:",
      active.map((r) => `${pos(r)} [${dept(r)}]`).slice(0, 40),
    );
  }
  return { hr, admin, itManager, ea, ceo, head, all: active.map(toPerson) };
}

/** Find a masterfile person by the name typed in the offer form. */
export function findByName(
  all: Person[],
  name?: string | null,
): Person | undefined {
  if (!name) return undefined;
  const n = norm(name.replace(/\(.*?\)/g, ""));
  return (
    all.find((p) => norm(p.name) === n) ??
    all.find((p) => n.includes(norm(p.name)) || norm(p.name).includes(n))
  );
}

/* ---------------- main ---------------- */

function forwardHeaders(req: Request): HeadersInit {
  const h: Record<string, string> = {};
  const auth = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  if (auth) h.authorization = auth;
  if (cookie) h.cookie = cookie;
  return h;
}

const originOf = (req: Request) =>
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  new URL(req.url).origin;

/**
 * Loads the masterfile (using the caller's own auth) and returns the signers,
 * (name + position only). Never throws: on any failure it
 * returns whatever it could resolve so the offer can still be generated.
 */
export async function resolveSignatories(
  req: Request,
  opts: { reportingTo?: string; department?: string } = {},
): Promise<Signatories> {
  const empty: Signatories = { all: [] };
  let rows: MasterfileRow[] = [];
  try {
    const res = await fetch(`${originOf(req)}/api/employee-masterfile`, {
      headers: forwardHeaders(req),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`masterfile ${res.status}`);
    rows = ((await res.json())?.data ?? []) as MasterfileRow[];
  } catch (e) {
    console.warn("job-offer: could not load employee masterfile", e);
    return empty;
  }

  return pickPeople(rows, opts);
}
