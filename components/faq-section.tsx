// components/faq-section.tsx

import Link from "next/link";

type FaqItem = {
  question: string;
  answer: string;
};

// Keep answers short and factual: 1-2 sentences. Update when details change.
const FAQS: FaqItem[] = [
  {
    question: "What is Infinitech Advertising Corporation?",
    answer:
      "Infinitech Advertising Corporation is a digital and creative company in Makati, Philippines. It specializes in web development and mobile app development, and also offers digital marketing, advertising, photography, videography, and branding.",
  },
  {
    question: "Where is Infinitech Advertising Corporation located?",
    answer:
      "The company is at Campos Rueda Building, 311 Urban Ave, Makati City, 1206 Metro Manila, Philippines. It serves businesses across Metro Manila and the rest of the Philippines.",
  },
  {
    question: "What services does Infinitech Advertising Corporation offer?",
    answer:
      "It offers web design and development, mobile app development, digital marketing and SEO, advertising, branding, photography, and videography.",
  },
  {
    question: "How much are Infinitech's website plans?",
    answer:
      "Website plans start at ₱5,523/month for Standard. Premium is ₱9,999/month, Business is ₱14,999/month, and Commerce is ₱21,999/month. All plans include support and updates.",
  },
  {
    question: "What is included in the Standard website plan?",
    answer:
      "The Standard plan includes up to 5 pages, social media links integration, a simple contact form, email alerts for form inquiries, a 1-year domain and hosting, 5GB storage (upgradeable to 50GB or 100GB), and a mobile-responsive design.",
  },
  {
    question: "Does Infinitech offer plans other than websites?",
    answer:
      "Yes. Besides website plans, Infinitech offers JuanTap, Multimedia, and Social Media plans.",
  },
  {
    question: "How many projects has Infinitech completed?",
    answer: "Infinitech has completed more than 20 projects for its clients.",
  },
  {
    question: "Does Infinitech accept interns?",
    answer: "Yes, Infinitech Advertising Corporation accepts interns.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: answer,
    },
  })),
};

export default function FaqSection() {
  return (
    <section
      aria-labelledby="faq-heading"
      className="relative overflow-hidden bg-[#050b1a] py-20"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Decorative glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-500/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-3xl px-4">
        {/* Header */}
        <div className="mb-12 text-center">
          <h2
            id="faq-heading"
            className="text-3xl font-extrabold uppercase tracking-tight text-amber-500 sm:text-5xl"
          >
            Frequently Asked Questions
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-base text-gray-300 sm:text-lg">
            Quick answers about Infinitech Advertising Corporation and what we
            can build for your business.
          </p>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {FAQS.map(({ question, answer }) => (
            <details
              key={question}
              className="group rounded-2xl border border-slate-700/70 bg-slate-800/40 backdrop-blur transition-all duration-200 hover:border-cyan-500/50 open:border-cyan-400 open:bg-slate-800/60 open:shadow-[0_0_30px_-8px_rgba(34,211,238,0.45)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
                <h3 className="text-base font-semibold text-white sm:text-lg">
                  {question}
                </h3>

                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400 transition-all duration-200 group-open:rotate-180 group-open:bg-gradient-to-r group-open:from-cyan-400 group-open:to-blue-500 group-open:text-white">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              </summary>

              <div className="border-t border-slate-700/70 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                <p className="text-sm leading-relaxed text-gray-300 sm:text-base">
                  {answer}
                </p>
              </div>
            </details>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-2xl border border-cyan-500/30 bg-slate-800/50 p-8 text-center shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)]">
          <p className="text-lg font-semibold text-white">
            Still have questions?
          </p>
          <p className="mt-1 text-sm text-gray-300">
            Tell us about your project and we&apos;ll get back to you.
          </p>

          <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Contact Us
            </Link>

            <Link
              href="/quote"
              className="inline-flex items-center justify-center rounded-full border border-slate-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:border-cyan-400 hover:text-cyan-300"
            >
              Request a Quote
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
