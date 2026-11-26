import Link from "next/link";
import { ArrowRight, Compass, Home, Mail } from "lucide-react";

export default function NotFound() {
  return (
    <section className="relative isolate flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-[#0b1238] px-4 py-16 text-white">
      {/* Background glow + grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/20 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 -z-10 h-[360px] w-[360px] rounded-full bg-blue-600/30 blur-[120px]"
      />

      <div className="mx-auto w-full max-w-3xl text-center">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-amber-400 sm:text-sm">
          Error · Page Not Found
        </p>

        <h1 className="bg-gradient-to-b from-white via-cyan-300 to-blue-500 bg-clip-text text-8xl font-extrabold leading-none tracking-tight text-transparent drop-shadow-[0_0_30px_rgba(34,211,238,0.35)] sm:text-[10rem] lg:text-[12rem]">
          404
        </h1>

        <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
          Looks like you&apos;re{" "}
          <span className="text-cyan-400 [text-shadow:0_0_24px_rgba(34,211,238,0.5)]">
            off course
          </span>
        </h2>

        <p className="mx-auto mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
          The page you&apos;re looking for doesn&apos;t exist or may have been
          moved. Let&apos;s get you back to growing your digital presence.
        </p>

        {/* Status card, echoing the hero dashboard cards */}
        <div className="mx-auto mt-8 flex w-fit items-center gap-3 rounded-xl border border-cyan-400/30 bg-[#0f1a4a]/70 px-4 py-3 text-left shadow-[0_0_30px_rgba(34,211,238,0.12)] backdrop-blur">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            <Compass className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Route status</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              Not found
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-7 py-3.5 text-base font-semibold text-[#0b1238] shadow-[0_0_28px_rgba(34,211,238,0.45)] transition hover:bg-cyan-300 focus:outline-none focus:ring-4 focus:ring-cyan-400/40"
          >
            <Home className="h-5 w-5" />
            Back to Homepage
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-cyan-400/70 px-7 py-3.5 text-base font-semibold text-cyan-300 transition hover:bg-cyan-400/10 focus:outline-none focus:ring-4 focus:ring-cyan-400/30"
          >
            <Mail className="h-5 w-5" />
            Contact Us
          </Link>
        </div>

        <nav
          aria-label="Helpful links"
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400"
        >
          <Link href="/about" className="transition hover:text-cyan-300">
            About Us
          </Link>
          <Link href="/services" className="transition hover:text-cyan-300">
            Services
          </Link>
          <Link href="/blog" className="transition hover:text-cyan-300">
            Blog
          </Link>
          <Link href="/pricing" className="transition hover:text-cyan-300">
            Pricing
          </Link>
        </nav>
      </div>
    </section>
  );
}
