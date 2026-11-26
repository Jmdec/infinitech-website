// File: lib/careers/job-offer/constants.ts

export const COMPANY_NAME = "INFINITECH ADVERTISING";

// Put the logo file at public/images/infinitech-logo.png
export const LOGO_PATH = "public/images/infinitech-logo.png";

export const LETTERHEADS = {
  main: {
    headerLines: [] as string[],
    footerLines: [
      "INFINITECH Advertising Corporation - 311 Campos Rueda Building, Urban Avenue, Makati City",
      "Tel no.: (02)7001-6157 | Mobile no.: (+63) 962-253-0149 | Email: infinitechcorp.ph@gmail.com",
    ],
  },
  alt: {
    headerLines: [
      "Unit 311 Campos Rueda Bldg., Urban Avenue, Brgy. Pio Del Pilar, Makati City, 1230",
      "(02) 8646-1636",
    ],
    footerLines: [] as string[],
  },
} as const;

// Keys match the dropdown values in CareerApplicantActions.tsx
export const SIGNATORIES: Record<string, { name: string; title: string }> = {
  Roline: { name: "ROLINE CABANTOC", title: "Admin Assistant" },
  Aizle: { name: "AIZLE MARIE M. ATIENZA", title: "Admin Supervisor/HR" },
};

export const REPORTING: Record<string, string> = {
  Sarmiento: "MR. ANGELLE SARMIENTO (Chief Executive Officer)",
  "De Castro": "MR. JUSTIN M. DE CASTRO (Junior IT Manager)",
};

export const EMPLOYMENT_LABELS: Record<string, string> = {
  Probationary: "PROBATIONARY / FULL - TIME",
  "Full-time": "FULL - TIME",
  "Part-time": "PART - TIME",
  "Project-based": "PROJECT - BASED",
};

export const CLOSING_TEXT =
  "Thus, attached herewith your Job Offer is a copy of the Job Description for your reference. And after thoroughly deciding to accept our Job offer, kindly put your signature and send back to us twenty-four (24) hours upon receiving the Job Offer.";
