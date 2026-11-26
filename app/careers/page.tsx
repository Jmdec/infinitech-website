import type { Metadata } from "next";
import CareersPage from "@/components/user/careers/careers-page";

export const metadata: Metadata = {
  title: "Careers at Infinitech Advertising Corporation",
  description:
    "Explore career opportunities at Infinitech Advertising Corporation in Makati, Philippines. Join our team and grow your digital marketing skills.",
  alternates: { canonical: "/careers" },
};

export default function Page() {
  return <CareersPage />;
}
