// File: lib/careers/job-offer/departments/index.ts
// Registry of every department's job descriptions + position matching.

import type { Department, JobDescription } from "../types";
import { ADMIN_JOBS } from "./admin";
import { CREATIVE_JOBS } from "./creative";
import { IT_JOBS } from "./it";
import { MARKETING_JOBS } from "./marketing";

export const GENERAL_JOB: JobDescription = {
  key: "general",
  department: "general",
  matches: /.*/,
  role: "Employee",
  title: "Job Description",
  summary:
    "shall be responsible for carrying out the duties and responsibilities assigned by the Company in accordance with its policies, standards, and operational needs.",
  dutiesHeading: "Key Responsibilities:",
  duties: [
    {
      items: [
        "Perform the core functions of the position as directed by the immediate supervisor.",
        "Coordinate with Management, colleagues, and other departments as required.",
        "Comply with company rules, policies, and standards.",
        "Meet deadlines and maintain quality of work.",
        "Perform other related tasks assigned by management.",
      ],
    },
  ],
  reportingTo: "Sarmiento",
  weekendWork: "saturday",
  draft: true,
};

export const JOBS_BY_DEPARTMENT: Record<Department, JobDescription[]> = {
  it: IT_JOBS,
  marketing: MARKETING_JOBS,
  creative: CREATIVE_JOBS,
  admin: ADMIN_JOBS,
  general: [GENERAL_JOB],
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  it: "IT",
  marketing: "Marketing",
  creative: "Creative / Media",
  admin: "Admin / HR",
  general: "General",
};

// Order matters: the first match wins, so specific titles come before broad ones.
const MATCH_ORDER: JobDescription[] = [
  ...IT_JOBS.filter((j) => j.key === "marketing-web"),
  ...IT_JOBS.filter((j) => j.key === "system-admin"),
  ...IT_JOBS.filter((j) => j.key === "it-support"),
  ...CREATIVE_JOBS,
  ...MARKETING_JOBS,
  ...IT_JOBS.filter((j) => j.key === "web-developer"),
  ...IT_JOBS.filter((j) => j.key === "software-developer"),
  ...ADMIN_JOBS,
];

export function pickJobDescription(
  position: string,
  department?: Department,
): JobDescription {
  const pool = department ? JOBS_BY_DEPARTMENT[department] : MATCH_ORDER;
  return pool.find((job) => job.matches.test(position)) ?? GENERAL_JOB;
}
