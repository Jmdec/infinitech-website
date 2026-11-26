// File: lib/careers/job-offer/departments/it.ts
// IT department job descriptions. Reports to De Castro (Junior IT Manager) by default.

import type { JobDescription } from "../types";

export const IT_JOBS: JobDescription[] = [
  {
    // Copied from the signed Armilla offer.
    key: "marketing-web",
    department: "it",
    matches: /(marketing).*(web)|(web).*(marketing)|junior web/i,
    role: "Marketing Staff / Junior Web Developer",
    title: "Job Description – Marketing Staff / Junior Web Developer",
    summary:
      "is responsible for supporting marketing initiatives, generating leads, assisting in sales-related activities, and maintaining the company’s digital platforms. The role combines marketing, commission-based performance, and basic web development responsibilities to strengthen the company’s online presence and revenue growth.",
    dutiesHeading: "Duties and Responsibilities",
    duties: [
      {
        heading: "Marketing Functions",
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
      {
        heading: "Web Development Functions",
        items: [
          "Assist in updating, maintaining, and managing the company’s website and digital platforms",
          "Upload, edit, and organize website content including text, images, and basic page layouts",
          "Perform basic front-end development tasks using HTML, CSS, or similar tools as required",
          "Assist in identifying and troubleshooting minor website, system, or content issues",
          "Coordinate with senior developers, designers, or IT personnel for technical support and implementation",
          "Ensure website content aligns with current marketing campaigns and branding guidelines",
        ],
      },
    ],
    reportingTo: "De Castro",
    weekendWork: "saturday_sunday",
    draft: false,
  },
  {
    key: "web-developer",
    department: "it",
    matches: /web|front.?end/i,
    role: "Web Developer",
    title: "Job Description – Web Developer",
    summary:
      "is responsible for designing, building, maintaining, and improving the company’s websites, web applications, and internal systems. The role ensures that all digital platforms are functional, secure, responsive, and aligned with the company’s business and marketing objectives.",
    dutiesHeading: "Key Responsibilities:",
    duties: [
      {
        items: [
          "Develop, update, and maintain company websites and web applications using HTML, CSS, JavaScript, and modern frameworks as required.",
          "Build responsive, user-friendly interfaces that work across devices and browsers.",
          "Develop and maintain back-end features, APIs, and database integrations.",
          "Write clean, organized, and well-documented code following company standards.",
          "Identify, troubleshoot, and fix bugs, errors, and performance issues.",
          "Implement security best practices, regular updates, and backups for web platforms.",
          "Collaborate with marketing, design, and management teams to translate requirements into working features.",
          "Update website content, pages, and layouts in line with campaigns and branding guidelines.",
          "Monitor website performance, uptime, and basic SEO requirements.",
          "Use version control and maintain proper records of changes and deployments.",
          "Provide technical support and basic training to staff who use internal systems.",
          "Stay updated with industry trends, tools, and technologies.",
          "Perform other related tasks assigned by management.",
        ],
      },
    ],
    reportingTo: "De Castro",
    weekendWork: "saturday_sunday",
    draft: true,
  },
  {
    key: "software-developer",
    department: "it",
    matches: /software|programmer|developer|full.?stack|back.?end|\bit\b/i,
    role: "Software Developer / Programmer",
    title: "Job Description – Software Developer / Programmer",
    summary:
      "is responsible for analyzing requirements, designing, developing, testing, and maintaining software and systems that support the company’s operations. The role ensures that applications are reliable, secure, and delivered on time.",
    dutiesHeading: "Key Responsibilities:",
    duties: [
      {
        items: [
          "Analyze business requirements and translate them into technical specifications and working features.",
          "Design, develop, test, and deploy software applications and system modules.",
          "Develop and maintain databases, APIs, and integrations between systems.",
          "Write clean, efficient, and well-documented code following company standards.",
          "Perform debugging, testing, and quality checks before release.",
          "Maintain and improve existing systems, including fixing defects and optimizing performance.",
          "Apply security and data-protection practices in all development work.",
          "Prepare technical documentation, user guides, and change records.",
          "Coordinate with management and other departments to gather feedback and prioritize tasks.",
          "Use version control and follow proper release and deployment procedures.",
          "Provide technical support for the systems developed or maintained.",
          "Meet deadlines while handling multiple projects efficiently.",
          "Perform other related tasks assigned by management.",
        ],
      },
    ],
    reportingTo: "De Castro",
    weekendWork: "saturday_sunday",
    draft: true,
  },
  {
    key: "it-support",
    department: "it",
    matches: /support|technician|help.?desk/i,
    role: "IT Support Staff",
    title: "Job Description – IT Support Staff",
    summary:
      "is responsible for providing technical assistance and maintaining the company’s computers, network, accounts, and other IT equipment so that daily operations run smoothly and securely.",
    dutiesHeading: "Key Responsibilities:",
    duties: [
      {
        items: [
          "Provide first-level technical support to employees for hardware, software, network, and account concerns.",
          "Install, configure, and maintain computers, printers, peripherals, and office software.",
          "Set up and maintain user accounts, email accounts, access permissions, and passwords.",
          "Monitor and maintain the office network, internet connectivity, Wi-Fi, and related equipment.",
          "Perform regular data backups and basic system maintenance and updates.",
          "Troubleshoot and resolve hardware and software issues promptly, escalating to the IT Manager when necessary.",
          "Maintain an inventory of IT equipment, licenses, and accessories.",
          "Apply basic cybersecurity practices such as antivirus, updates, and safe-use reminders.",
          "Assist in the setup of equipment for meetings, events, and new hires.",
          "Keep records of support requests, repairs, and resolutions.",
          "Assist the IT team in system and website maintenance when needed.",
          "Perform other related tasks assigned by management.",
        ],
      },
    ],
    reportingTo: "De Castro",
    weekendWork: "saturday_sunday",
    draft: true,
  },
  {
    key: "system-admin",
    department: "it",
    matches: /network|system admin|sysad/i,
    role: "Network / System Administrator",
    title: "Job Description – Network / System Administrator",
    summary:
      "is responsible for the installation, configuration, security, and day-to-day operation of the company’s servers, network, and IT infrastructure, ensuring availability, performance, and data protection.",
    dutiesHeading: "Key Responsibilities:",
    duties: [
      {
        items: [
          "Install, configure, and maintain servers, networks, and related infrastructure.",
          "Monitor system and network performance, availability, and capacity.",
          "Manage user accounts, access rights, and security policies.",
          "Implement and test backup, recovery, and business continuity procedures.",
          "Apply security patches, updates, and hardening measures on systems and devices.",
          "Troubleshoot and resolve network and system incidents, and document root causes.",
          "Maintain IT documentation, network diagrams, and asset records.",
          "Coordinate with vendors, service providers, and internal teams on IT requirements.",
          "Recommend improvements and upgrades to the IT infrastructure.",
          "Provide technical support and guidance to other IT staff and users.",
          "Perform other related tasks assigned by management.",
        ],
      },
    ],
    reportingTo: "De Castro",
    weekendWork: "saturday_sunday",
    draft: true,
  },
];
