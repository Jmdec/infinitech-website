import React from "react";
import type { Metadata } from "next";
import PricingPage from "@/components/user/pricing/pricing-page";

export const metadata: Metadata = {
  title: "Pricing Plans",
  description:
    "Website, JuanTap NFC card, multimedia advertising, and social media management pricing from Infinitech Advertising Corporation in Makati, Philippines. Website plans start at ₱5,523/month.",
  alternates: { canonical: "/pricing" },
};

const Page = () => {
  return <PricingPage />;
};

export default Page;
