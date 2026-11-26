// File: lib/careers/job-offer/departments/creative.ts
// Creative / Media department job descriptions. Reports to Sarmiento (CEO) by default.

import type { JobDescription } from "../types";

export const CREATIVE_JOBS: JobDescription[] = [
  {
    // Copied from the signed Bengan offer.
    key: "videographer",
    department: "creative",
    matches: /video|photo/i,
    role: "Videographer",
    title: "Job Description – Videographer",
    summary:
      "is responsible for planning, capturing, and producing high-quality video content for the company’s marketing campaigns, social media platforms, events, and projects. The role includes video production, editing, and content creation as needed, ensuring that all visual outputs are engaging, professional, and aligned with the company’s brand and marketing objectives.",
    dutiesHeading: "Key Responsibilities:",
    duties: [
      {
        items: [
          "Capture high-quality video footage for promotional, corporate, social media, and event content.",
          "Plan and prepare for shoots, including setting up equipment, lighting, and location.",
          "Operate cameras, audio equipment, and other production tools effectively.",
          "Collaborate with the marketing and creative team to produce engaging visual content.",
          "Assist in developing video concepts, storyboards, scripts, and shot lists when needed.",
          "Create short-form content such as Reels, TikTok videos, promotional videos, and other social media content as needed.",
          "Perform basic color correction, color grading, audio synchronization, and other post-production tasks.",
          "Edit and enhance photos using appropriate software to ensure professional quality.",
          "Edit raw video footage into polished content for social media, advertisements, and other digital platforms.",
          "Add transitions, effects, music, subtitles, and graphics to improve video output.",
          "Ensure all content aligns with brand guidelines and project requirements.",
          "Organize, manage, and maintain photo and video files and equipment.",
          "Assist in conceptualizing creative ideas for content and campaigns.",
          "Meet deadlines while handling multiple projects efficiently.",
          "Perform basic troubleshooting and maintenance of equipment.",
          "Assist during events, shoots, and other production-related activities.",
          "Stay updated with industry trends, techniques, and tools in photography and videography.",
          "Perform other related tasks assigned by management.",
        ],
      },
    ],
    reportingTo: "Sarmiento",
    weekendWork: "saturday",
    draft: false,
  },
  {
    key: "graphic-designer",
    department: "creative",
    matches: /graphic|designer|layout|artist/i,
    role: "Graphic Designer",
    title: "Job Description – Graphic Designer",
    summary:
      "is responsible for creating visually appealing graphics and layouts for the company’s marketing campaigns, social media, print materials, and digital platforms, ensuring consistency with the company’s brand.",
    dutiesHeading: "Key Responsibilities:",
    duties: [
      {
        items: [
          "Design graphics, layouts, posters, banners, and other marketing materials for print and digital use.",
          "Create social media graphics and campaign visuals aligned with brand guidelines.",
          "Collaborate with the marketing and creative team to develop concepts and visual directions.",
          "Edit and retouch photos and prepare files for production and publishing.",
          "Prepare print-ready and web-ready files in the correct formats and sizes.",
          "Organize and maintain design files, templates, and brand assets.",
          "Incorporate feedback and revisions while meeting deadlines.",
          "Stay updated with design trends, tools, and techniques.",
          "Perform other related tasks assigned by management.",
        ],
      },
    ],
    reportingTo: "Sarmiento",
    weekendWork: "saturday",
    draft: true,
  },
];
