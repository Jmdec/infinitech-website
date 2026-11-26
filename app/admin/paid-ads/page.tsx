// 📁 Place this file at: app/admin/paid-ads/page.tsx
"use client";

import { Megaphone, Wallet } from "lucide-react";
import RequestsAdminPage, {
  type BaseRequest,
  type RequestsPageConfig,
} from "@/components/admin/RequestsAdminPage";

const asText = (value: unknown) => (typeof value === "string" ? value : "");

const config: RequestsPageConfig = {
  title: "Paid Ads Requests",
  subtitle: "View and manage all paid ads requests",
  icon: Megaphone,
  apiPath: "/api/paid-ads-requests",
  emailApiPath: "/api/send-paid-ads-email",
  entity: "request",
  orgKey: "business_name",
  orgLabel: "Business",
  fields: [
    {
      key: "ad_platforms",
      label: "Ad Platforms",
      icon: Megaphone,
      kind: "list",
    },
    { key: "monthly_budget", label: "Monthly Budget", icon: Wallet },
  ],
  detailsLabel: "Campaign Goals",
  searchKeys: [
    "name",
    "email",
    "business_name",
    "phone",
    "ad_platforms",
    "monthly_budget",
  ],
  searchPlaceholder:
    "Search by name, email, business, phone, platform, or budget...",
  pdf: {
    title: "Paid Ads Request",
    footer: "Paid Ads Requests",
    section: "CAMPAIGN DETAILS",
    filePrefix: "paid-ads",
  },
  email: {
    subjectPrefix: "Your Paid Ads Request",
    build: (r: BaseRequest) => {
      const business = asText(r.business_name);
      const platforms = asText(r.ad_platforms)
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .join(", ");
      const budget = asText(r.monthly_budget);
      return `Dear ${r.name},

Thank you for your interest in running paid ads${
        business ? ` for ${business}` : ""
      }.

We've received your submission${platforms ? ` covering: ${platforms}` : ""}${
        budget ? ` with an estimated monthly budget of ${budget}` : ""
      }. Our ads team will review your goals and follow up shortly with next steps.

If you have any questions in the meantime, feel free to reach out.

Best regards,
The Team`;
    },
  },
};

export default function PaidAdsAdminPage() {
  return <RequestsAdminPage config={config} />;
}
