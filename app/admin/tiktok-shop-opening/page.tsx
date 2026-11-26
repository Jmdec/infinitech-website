// 📁 Place this file at: app/admin/tiktok-shop/page.tsx
"use client";

import { Store, Tag } from "lucide-react";
import RequestsAdminPage, {
  type BaseRequest,
  type RequestsPageConfig,
} from "@/components/admin/RequestsAdminPage";

const str = (request: BaseRequest, key: string): string => {
  const value = request[key];
  return typeof value === "string" ? value : "";
};

const config: RequestsPageConfig = {
  title: "TikTok Shop Requests",
  subtitle: "View and manage all TikTok Shop opening requests",
  icon: Store,
  apiPath: "/api/tiktok-shop-requests",
  emailApiPath: "/api/send-tiktok-shop-email",
  entity: "request",
  orgKey: "business_name",
  orgLabel: "Business",
  fields: [
    {
      key: "product_categories",
      label: "Product Categories",
      icon: Tag,
      kind: "list",
    },
  ],
  detailsLabel: "Goals & Products",
  searchKeys: ["name", "email", "business_name", "phone", "product_categories"],
  searchPlaceholder: "Search by name, email, business, category, or phone...",
  showPhoneColumn: true,
  // Keeps the original pending → contacted → approved / rejected workflow.
  status: {
    key: "status",
    onView: { from: "pending", to: "contacted" },
    options: [
      {
        value: "pending",
        label: "Pending",
        badgeClass: "bg-orange-500 hover:bg-orange-600",
      },
      {
        value: "contacted",
        label: "Contacted",
        badgeClass: "bg-blue-500 hover:bg-blue-600",
      },
      {
        value: "approved",
        label: "Approved",
        badgeClass: "bg-emerald-500 hover:bg-emerald-600",
      },
      {
        value: "rejected",
        label: "Rejected",
        badgeClass: "bg-red-500 hover:bg-red-600",
      },
    ],
  },
  pdf: {
    title: "TikTok Shop Opening Request",
    footer: "TikTok Shop Requests",
    section: "SHOP DETAILS",
    filePrefix: "tiktok-shop",
  },
  email: {
    subjectPrefix: "Your TikTok Shop Opening Request",
    build: (request) => {
      const business = str(request, "business_name");
      const categories = str(request, "product_categories")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(", ");

      return `Dear ${request.name},

Thank you for requesting to open a TikTok Shop${
        business ? ` for ${business}` : ""
      }.

We've received your submission${
        categories ? ` covering: ${categories}` : ""
      }. Our team will review your details and follow up shortly to get your shop live.

If you have any questions in the meantime, feel free to reach out.

Best regards,
The Team`;
    },
  },
};

export default function TikTokShopAdminPage() {
  return <RequestsAdminPage config={config} />;
}
