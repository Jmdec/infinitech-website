// 📁 Place this file at: app/admin/social-media/page.tsx
"use client";

import { Hash } from "lucide-react";
import RequestsAdminPage, {
  type BaseRequest,
  type RequestsPageConfig,
} from "@/components/admin/RequestsAdminPage";

const asText = (value: unknown) => (typeof value === "string" ? value : "");

const config: RequestsPageConfig = {
  title: "Social Media Management Requests",
  subtitle: "View and manage all social media management requests",
  icon: Hash,
  apiPath: "/api/social-media-requests",
  emailApiPath: "/api/send-social-media-email",
  entity: "request",
  orgKey: "company",
  orgLabel: "Company",
  fields: [{ key: "platforms", label: "Platforms", icon: Hash, kind: "list" }],
  detailsLabel: "Goals / Presence",
  searchKeys: ["name", "email", "company", "phone", "platforms"],
  searchPlaceholder: "Search by name, email, company, phone, or platform...",
  pdf: {
    title: "Social Media Management Request",
    footer: "Social Media Management Requests",
    section: "REQUEST DETAILS",
    filePrefix: "social-media",
  },
  email: {
    subjectPrefix: "Your Social Media Management Request",
    build: (r: BaseRequest) => {
      const company = asText(r.company);
      const platforms = asText(r.platforms)
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .join(", ");
      return `Dear ${r.name},

Thank you for your interest in social media management${
        company ? ` for ${company}` : ""
      }.

We've received your submission${
        platforms ? ` covering: ${platforms}` : ""
      }. Our team will review your goals and follow up shortly with a proposed content plan.

If you have any questions in the meantime, feel free to reach out.

Best regards,
The Team`;
    },
  },
};

export default function SocialMediaAdminPage() {
  return <RequestsAdminPage config={config} />;
}
