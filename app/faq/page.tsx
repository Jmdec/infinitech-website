// app/faq/page.tsx

import type { Metadata } from "next";
import FaqSection from "@/components/faq-section";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about Infinitech Advertising Corporation, a web development, mobile app development, and digital marketing company in Makati, Philippines.",
  alternates: {
    canonical: "/faq",
  },
};

export default function FaqPage() {
  return (
    <main>
      <FaqSection />
    </main>
  );
}
