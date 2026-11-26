// File: lib/careers/job-offer/departments/marketing.ts
// Marketing department job descriptions. Reports to Sarmiento (CEO) by default.

import type { JobDescription } from "../types";

export const MARKETING_JOBS: JobDescription[] = [
  {
    // Marketing half of the signed Armilla offer.
    key: "marketing-staff",
    department: "marketing",
    matches: /marketing|sales|lead/i,
    role: "Marketing Staff",
    title: "Job Description – Marketing Staff",
    summary:
      "is responsible for supporting marketing initiatives, generating leads, and assisting in sales-related activities to strengthen the company’s brand, online presence, and revenue growth.",
    dutiesHeading: "Duties and Responsibilities",
    duties: [
      {
        items: [
          "Assist in planning, implementing, and monitoring marketing campaigns, promotions, and advertising activities",
          "Support lead generation initiatives through digital platforms, inquiries, and marketing channels",
          "Coordinate with clients, prospects, and internal teams regarding marketing and promotional activities",
          "Prepare marketing materials such as presentations, proposals, promotional content, and performance reports",
          "Manage and assist in social media posting, content scheduling, and basic digital marketing efforts",
          "Coordinate with internal departments and external partners to ensure timely execution of marketing initiatives",
          "Monitor marketing activities and provide feedback or reports to management",
          "Perform other marketing-related tasks as assigned by management",
        ],
      },
    ],
    reportingTo: "Sarmiento",
    weekendWork: "saturday",
    draft: false,
  },
  {
    key: "social-media",
    department: "marketing",
    matches: /social media|community/i,
    role: "Social Media Manager",
    title: "Job Description – Social Media Manager",
    summary:
      "is responsible for planning, managing, and growing the company’s social media presence, ensuring consistent, engaging content that supports brand awareness and lead generation.",
    dutiesHeading: "Key Responsibilities:",
    duties: [
      {
        items: [
          "Plan and maintain the content calendar for all company social media platforms.",
          "Create, schedule, and publish posts, captions, and campaigns aligned with brand guidelines.",
          "Coordinate with the creative team for photos, videos, and graphics.",
          "Monitor and respond to comments, messages, and inquiries in a timely and professional manner.",
          "Track page performance and prepare regular analytics and reports for management.",
          "Support paid promotions and lead generation efforts.",
          "Stay updated with platform trends, algorithms, and best practices.",
          "Perform other related tasks assigned by management.",
        ],
      },
    ],
    reportingTo: "Sarmiento",
    weekendWork: "saturday",
    draft: true,
  },
];
