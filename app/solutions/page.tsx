import React from "react";
import type { Metadata } from "next";
import SolutionsTabs, {
  type Tab,
} from "@/components/user/solutions/solutions-tabs";

export const metadata: Metadata = {
  title: "Our Services",
  description:
    "Website solutions, marketing research, and branding services from Infinitech Advertising Corporation in Makati, Philippines.",
  alternates: { canonical: "/solutions" },
};

const validTabs: Tab[] = ["website", "marketing-research", "branding"];

const Page = async ({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) => {
  const { tab } = await searchParams;
  const initialTab = validTabs.includes(tab as Tab) ? (tab as Tab) : "website";

  return <SolutionsTabs initialTab={initialTab} />;
};

export default Page;
