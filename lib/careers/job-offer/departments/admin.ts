// File: lib/careers/job-offer/departments/admin.ts
// Admin / HR department job descriptions. Reports to Sarmiento (CEO) by default.

import type { JobDescription } from "../types";

export const ADMIN_JOBS: JobDescription[] = [
  {
    // Copied from the signed Villamor offer.
    // Removed the Hair and Make-up duty (specific to ABIC Realty's studio) and fixed the
    // "Admin Assistant" / "Admin Staff" mix-up in the original. Add it back if needed.
    key: "admin-staff",
    department: "admin",
    matches: /admin|hr|human resource|office/i,
    role: "Admin Staff",
    title: "Job Description – Admin Staff",
    summary:
      "shall be responsible for overseeing the Company’s administrative functions and supporting the efficient operation of the office. The position shall ensure that administrative processes, employee records, workplace policies, office facilities, and other assigned operational matters are properly monitored, maintained, and coordinated.",
    dutiesHeading:
      "The Admin Staff’s duties and responsibilities shall generally include:",
    duties: [
      {
        items: [
          "Overseeing daily office administration and ensuring the cleanliness, organization, safety, and proper condition of the workplace and office facilities.",
          "Maintaining complete, accurate, updated, and properly organized company and employee records, documents, files, and administrative monitoring systems.",
          "Monitoring employee attendance, tardiness, leave records, leave credits, workplace conduct, and compliance with company policies and procedures.",
          "Assisting in recruitment and manpower requirements, including applicant screening, initial interviews, onboarding coordination, and maintenance of employee information and personnel records.",
          "Preparing, reviewing, and coordinating timekeeping records and other necessary information for payroll processing, employee benefits, and government-mandated contributions.",
          "Coordinating office supplies, maintenance, repairs, construction-related concerns, building administration matters, and other operational requirements of the Company.",
          "Monitoring pending administrative and operational concerns and ensuring proper follow-up, coordination, documentation, and resolution.",
          "Preparing and submitting reports, budgets, recommendations, evaluations, and other documents required by Management.",
          "Assisting in the implementation and consistent enforcement of Company policies, procedures, workplace standards, and administrative controls.",
          "Identifying administrative and operational issues, recommending appropriate solutions and process improvements, and assisting Management in implementing approved corrective or preventive measures.",
          "Coordinating with Management, employees, building administrators, contractors, suppliers, service providers, government agencies, and other parties as necessary in the performance of the position’s duties.",
          "Organizing and coordinating Company events, meetings, activities, and other internal or external functions, including necessary schedules, logistics, announcements, documentation, and related arrangements.",
          "Performing such other administrative, human resource, supervisory, and operational duties as may be reasonably assigned by Management in accordance with the needs of the Company.",
        ],
      },
    ],
    reportingTo: "Sarmiento",
    weekendWork: "saturday",
    draft: false,
  },
];
