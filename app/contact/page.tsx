import React from "react";
import type { Metadata } from "next";
import Contact from "@/components/user/contact/contact";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact Infinitech Advertising Corporation in Makati, Philippines for web development, mobile app development, and digital marketing inquiries.",
  alternates: { canonical: "/contact" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "Infinitech Advertising Corporation",
  url: "https://infinitechphil.com",
  image: "https://infinitechphil.com/android-chrome-512x512.png",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Unit 311, Campos Rueda Building, 101 Urban Ave",
    addressLocality: "Makati",
    addressRegion: "Metro Manila",
    addressCountry: "PH",
  },
  areaServed: { "@type": "Country", name: "Philippines" },
};

const Page = () => {
  return (
    <div className="mt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Contact />
    </div>
  );
};

export default Page;
