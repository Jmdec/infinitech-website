// lib/seo.ts
import type { Metadata } from "next";

/* -------------------------------------------------------------------- */
/*  Constants                                                           */
/* -------------------------------------------------------------------- */

export const SITE_URL = "https://infinitechphil.com";
export const SITE_NAME = "Infinitech Advertising Corporation";
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const DEFAULT_OG_IMAGE = "/og-image.jpg";

export const COMPANY = {
  logo: `${SITE_URL}/android-chrome-512x512.png`,
  foundingDate: "2024",
  description:
    "Digital and creative company in Makati, Philippines specializing in web development, mobile app development, digital marketing, advertising, photography, videography, and branding.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Unit 311, Campos Rueda Building, 101 Urban Ave",
    addressLocality: "Makati City",
    addressRegion: "Metro Manila",
    postalCode: "1206",
    addressCountry: "PH",
  },
  sameAs: [
    "https://www.facebook.com/p/Infinitech-Advertising-Corporation-61562146592005/",
    // Add LinkedIn, Instagram, TikTok, YouTube, Google Business Profile URLs here
  ],
  // Only added to the schema when set.
  email: "infinitechcorp.ph@gmail.com" as string | undefined,
  phone: "+63 2 7001 6157" as string | undefined,
  geo: { latitude: 14.559916, longitude: 121.013534 } as
    | { latitude: number; longitude: number }
    | undefined,
};

export const KNOWS_ABOUT = [
  "Web Development",
  "Website Development",
  "Custom Web Development",
  "Web Application Development",
  "Mobile App Development",
  "Custom Mobile App Development",
  "Software Development",
  "Business System Development",
  "API Development",
  "Database Development",
  "Digital Solutions",
  "Digital Marketing",
  "Search Engine Optimization",
  "Advertising",
  "Branding",
  "Photography",
  "Videography",
  "Video Production",
];

/* -------------------------------------------------------------------- */
/*  Per-page metadata helper                                            */
/* -------------------------------------------------------------------- */

type PageMetaInput = {
  title: string;
  description: string;
  /** Path starting with "/", e.g. "/about". Use "/" for the home page. */
  path: string;
  image?: string;
  type?: "website" | "article";
  /** Skip the "| Infinitech Advertising Corporation" template (home page). */
  absoluteTitle?: boolean;
  noIndex?: boolean;
};

export function pageMetadata({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  type = "website",
  absoluteTitle = false,
  noIndex = false,
}: PageMetaInput): Metadata {
  const ogTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      locale: "en_PH",
      url: path,
      siteName: SITE_NAME,
      title: ogTitle,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [image],
      creator: "@infinitechcorp",
    },
    ...(noIndex && { robots: { index: false, follow: false } }),
  };
}

/* -------------------------------------------------------------------- */
/*  Schema.org builders                                                 */
/* -------------------------------------------------------------------- */

const country = { "@type": "Country", name: "Philippines" };

const organizationSchema = () => ({
  "@type": "ProfessionalService", // LocalBusiness subtype, also an Organization
  "@id": ORG_ID,
  name: SITE_NAME,
  legalName: SITE_NAME,
  alternateName: ["Infinitech Advertising", "Infinitech"],
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: COMPANY.logo,
    width: 512,
    height: 512,
  },
  image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
  description: COMPANY.description,
  foundingDate: COMPANY.foundingDate,
  address: COMPANY.address,
  areaServed: [country, { "@type": "City", name: "Makati City" }],
  sameAs: COMPANY.sameAs,
  knowsAbout: KNOWS_ABOUT,
  ...(COMPANY.email && { email: COMPANY.email }),
  ...(COMPANY.phone && { telephone: COMPANY.phone }),
  ...(COMPANY.geo && {
    geo: { "@type": "GeoCoordinates", ...COMPANY.geo },
  }),
  ...((COMPANY.email || COMPANY.phone) && {
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      areaServed: "PH",
      availableLanguage: ["English", "Filipino"],
      ...(COMPANY.email && { email: COMPANY.email }),
      ...(COMPANY.phone && { telephone: COMPANY.phone }),
    },
  }),
});

const websiteSchema = () => ({
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: "en-PH",
  publisher: { "@id": ORG_ID },
});

const serviceSchema = (
  slug: string,
  name: string,
  description: string,
  serviceType: string[],
) => ({
  "@type": "Service",
  "@id": `${SITE_URL}/#service-${slug}`,
  name,
  description,
  url: `${SITE_URL}/solutions`,
  provider: { "@id": ORG_ID },
  areaServed: country,
  serviceType,
});

/** Site-wide graph: rendered once in app/layout.tsx. */
export const siteGraph = () => ({
  "@context": "https://schema.org",
  "@graph": [
    organizationSchema(),
    websiteSchema(),
    serviceSchema(
      "web",
      "Web Development Services",
      "Custom website and web application development services for businesses and organizations in the Philippines.",
      [
        "Web Development",
        "Website Development",
        "Custom Web Development",
        "Web Application Development",
        "E-commerce Development",
        "Business Website Development",
      ],
    ),
    serviceSchema(
      "mobile",
      "Mobile App Development Services",
      "Custom mobile application development services for businesses and organizations in the Philippines.",
      [
        "Mobile App Development",
        "Android App Development",
        "iOS App Development",
        "Cross-Platform App Development",
        "Custom Mobile Applications",
      ],
    ),
    serviceSchema(
      "digital-creative",
      "Digital and Creative Services",
      "Digital marketing, advertising, branding, photography, and videography services for businesses in the Philippines.",
      [
        "Digital Marketing",
        "SEO Services",
        "Advertising",
        "Branding",
        "Photography",
        "Videography",
        "Video Production",
      ],
    ),
  ],
});

export const breadcrumbSchema = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: item.name,
    item: `${SITE_URL}${item.path}`,
  })),
});

export const faqSchema = (faqs: { question: string; answer: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
});

export const articleSchema = (post: {
  title: string;
  description: string;
  path: string;
  image?: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
}) => ({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  headline: post.title,
  description: post.description,
  mainEntityOfPage: `${SITE_URL}${post.path}`,
  image: post.image
    ? post.image.startsWith("http")
      ? post.image
      : `${SITE_URL}${post.image}`
    : `${SITE_URL}${DEFAULT_OG_IMAGE}`,
  datePublished: post.datePublished,
  dateModified: post.dateModified ?? post.datePublished,
  inLanguage: "en-PH",
  author: post.authorName
    ? { "@type": "Person", name: post.authorName }
    : { "@id": ORG_ID },
  publisher: { "@id": ORG_ID },
});

/* -------------------------------------------------------------------- */
/*  FAQ content (render it visibly on the page AND pass to faqSchema)   */
/* -------------------------------------------------------------------- */

export const FAQS = [
  {
    question: "What services does Infinitech Advertising Corporation offer?",
    answer:
      "Infinitech Advertising Corporation specializes in web development and mobile app development, and also offers digital marketing, advertising, branding, photography, and videography services.",
  },
  {
    question: "Where is Infinitech Advertising Corporation located?",
    answer:
      "We are based in Makati City, Metro Manila, Philippines, at Unit 311, Campos Rueda Building, 101 Urban Ave.",
  },
  {
    question: "Do you work with businesses across the Philippines?",
    answer:
      "Yes. We build websites, web applications, and mobile apps for businesses and organizations throughout the Philippines.",
  },
  {
    question: "How do I get a quote for my project?",
    answer:
      "Send us your project details through our quote request page and our team will get back to you to discuss your goals and requirements.",
  },
];
