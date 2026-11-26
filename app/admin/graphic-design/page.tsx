// 📁 Place this file at: app/admin/graphic-design/page.tsx
"use client";

import { Palette } from "lucide-react";
import RequestsAdminPage, {
  type BaseRequest,
  type RequestsPageConfig,
} from "@/components/admin/RequestsAdminPage";

const asText = (value: unknown) => (typeof value === "string" ? value : "");

const config: RequestsPageConfig = {
  title: "Graphic Design Requests",
  subtitle: "View and manage all graphic design requests",
  icon: Palette,
  apiPath: "/api/graphic-design-requests",
  emailApiPath: "/api/send-graphic-design-email",
  entity: "request",
  orgKey: "business_name",
  orgLabel: "Business",
  fields: [
    {
      key: "design_categories",
      label: "Design Categories",
      icon: Palette,
      kind: "list",
    },
  ],
  detailsLabel: "Project Goals",
  searchKeys: ["name", "email", "business_name", "phone", "design_categories"],
  searchPlaceholder: "Search by name, email, business, phone, or category...",
  pdf: {
    title: "Graphic Design Request",
    footer: "Graphic Design Requests",
    section: "PROJECT DETAILS",
    filePrefix: "graphic-design",
  },
  email: {
    subjectPrefix: "Your Graphic Design Request",
    build: (r: BaseRequest) => {
      const business = asText(r.business_name);
      const categories = asText(r.design_categories)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(", ");
      return `Dear ${r.name},

Thank you for your interest in graphic design services${
        business ? ` for ${business}` : ""
      }.

We've received your submission${
        categories ? ` covering: ${categories}` : ""
      }. Our design team will review your goals and follow up shortly with next steps.

If you have any questions in the meantime, feel free to reach out.

Best regards,
The Team`;
    },
  },
};

export default function GraphicDesignAdminPage() {
  return <RequestsAdminPage config={config} />;
}
