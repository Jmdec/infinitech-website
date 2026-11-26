import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
      {
        // Never let the browser or a CDN cache the service worker itself,
        // otherwise new deploys can't be detected and workers get stuck.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },

  // Removed deprecated swcMinify option.
  compress: true,
  productionBrowserSourceMaps: false,

  // Keep PDF packages external to prevent runtime font-path issues.
  serverExternalPackages: ["pdfkit", "pdfmake"],

  experimental: {
    optimizePackageImports: [
      "react-icons",
      "lucide-react",
      "@heroicons/react",
      "framer-motion",
    ],
    webpackBuildWorker: true,
  },

  // Keep your existing webpack and redirects
  // configurations here, unchanged.
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,

  fallbacks: {
    document: "/~offline",
  },

  // Idagdag ang custom rules sa ibabaw ng default caching (huwag palitan).
  extendDefaultRuntimeCaching: true,

  // Huwag i-precache ang malalaking video (maca-cache pa rin sila sa runtime).
  publicExcludes: ["!*.mp4", "!noprecache/**/*"],

  workboxOptions: {
    // Mag-activate agad ang bagong worker at kontrolin ang mga bukas na tab.
    skipWaiting: true,
    clientsClaim: true,

    runtimeCaching: [
      {
        // Admin pages at sensitibong API: laging sa network lang, walang cache.
        // Ang /admin.webmanifest ay hindi kasama dahil /admin(/|$) ang pattern.
        urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
          sameOrigin &&
          (/^\/admin(\/|$)/.test(url.pathname) ||
            url.pathname.startsWith("/api/admin/") ||
            url.pathname.startsWith("/api/employee-masterfile") ||
            url.pathname.startsWith("/api/my-tasks")),
        handler: "NetworkOnly",
      },
    ],
  },
})(nextConfig);
