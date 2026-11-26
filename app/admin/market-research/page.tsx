// 📁 Place this file at: app/admin/market-research/page.tsx
"use client";

import { LineChart } from "lucide-react";
import RequestsAdminPage, {
  type BaseRequest,
  type RequestsPageConfig,
} from "@/components/admin/RequestsAdminPage";

const asText = (value: unknown) => (typeof value === "string" ? value : "");

const config: RequestsPageConfig = {
  title: "Market Research Requests",
  subtitle: "View and manage all market research report requests",
  icon: LineChart,
  apiPath: "/api/market-research-requests",
  emailApiPath: "/api/send-market-research-email",
  entity: "request",
  orgKey: "company",
  orgLabel: "Company",
  fields: [],
  showPhoneColumn: true,
  detailsLabel: "Research Focus",
  searchKeys: ["name", "email", "company", "phone"],
  searchPlaceholder: "Search by name, email, company, or phone...",
  pdf: {
    title: "Market Research Report Request",
    footer: "Market Research Requests",
    section: "RESEARCH DETAILS",
    filePrefix: "market-research",
  },
  email: {
    subjectPrefix: "Your Market Research Report Request",
    build: (r: BaseRequest) => {
      const company = asText(r.company);
      const details = asText(r.details);
      return `Dear ${r.name},

Thank you for requesting a market research report${
        company ? ` for ${company}` : ""
      }.

We've received your submission and our team will begin research${
        details ? ` focused on: ${details}` : ""
      }. We'll follow up shortly with our findings and recommendations.

If you have any questions in the meantime, feel free to reach out.

Best regards,
The Team`;
    },
  },
};

export default function MarketResearchAdminPage() {
  return <RequestsAdminPage config={config} />;
}
