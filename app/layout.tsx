// app/layout.tsx

import "@/styles/globals.css";
import Providers from "./providers";
import ConditionalLayout from "@/components/conditional-layout";

import FloatingWidgets from "@/components/FloatingWidgets";
import JsonLd from "@/components/seo/json-ld";
import { poppins } from "@/config/fonts";
import { SITE_NAME, SITE_URL, siteGraph } from "@/lib/seo";
import { Toaster } from "react-hot-toast";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: `${SITE_NAME} | Web & Mobile App Development in Makati, Philippines`,
    template: `%s | ${SITE_NAME}`,
  },

  description:
    "Infinitech Advertising Corporation is a digital and creative company in Makati, Philippines specializing in web development, mobile app development, digital marketing, advertising, photography, videography, and branding solutions.",

  // NOTE: no canonical here on purpose. A root canonical of "/" would be
  // inherited by every page and tell Google they all duplicate the homepage.
  // Each page sets its own via pageMetadata() from "@/lib/seo".
  alternates: {
    types: { "text/plain": "/llms.txt" },
  },

  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  applicationName: SITE_NAME,
  category: "Web Development and Digital Services",
  classification:
    "Web Development, Mobile App Development and Digital Services",

  keywords: [
    "web development Philippines",
    "mobile app development Philippines",
    "web developer Makati",
    "custom software development Philippines",
    "digital marketing Philippines",
    "branding Philippines",
    "Infinitech Advertising Corporation",
  ],

  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },

  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  openGraph: {
    type: "website",
    locale: "en_PH",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Web & Mobile App Development in Makati, Philippines`,
    description:
      "Web and mobile app development company in Makati, Philippines, also offering digital marketing, advertising, photography, videography, and branding solutions.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} - Web and Mobile App Development`,
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Web & Mobile App Development`,
    description:
      "Infinitech specializes in web development and mobile app development, with additional digital marketing, advertising, photography, videography, and branding services.",
    images: ["/twitter-image.jpg"],
    creator: "@infinitechcorp",
  },

  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      {
        url: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },

  manifest: "/manifest.json",

  // Local / regional signals (rendered as <meta name="...">)
  other: {
    language: "English",
    company: SITE_NAME,
    "geo.region": "PH-NCR",
    "geo.placename": "Makati City",
    coverage: "Philippines, Metro Manila, Makati",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ff470a",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en-PH" suppressHydrationWarning>
      <body className={`${poppins.className} antialiased`}>
        {/* Organization, WebSite and Service structured data (one @graph) */}
        <JsonLd data={siteGraph()} />

        <Providers>
          <ConditionalLayout>{children}</ConditionalLayout>

          {/* Floating Components */}
          {/* <FloatingWidgets /> */}

          {/* Toast Notifications */}
          <Toaster position="top-center" reverseOrder={false} />

          {/* Vercel Analytics */}
          <Analytics />

          {/* Vercel Speed Insights */}
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
};

export default RootLayout;
