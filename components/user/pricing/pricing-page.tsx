"use client";

import { useState, useEffect } from "react";
import PricingCard from "@/components/pricingCard";
import ToggleSwitch from "@/components/ToggleSwitch";
import { X, ShoppingCart, Mail, Loader2, Phone } from "lucide-react";
import { useMediaQuery } from "react-responsive";
import Link from "next/link";
import {
  type Currency,
  convertPrice,
  formatPrice,
  currencySymbol,
} from "@/lib/currency";

interface CartItem {
  planName: string;
  service: string;
  price: number;
  currency: Currency;
  billingPeriod: "monthly" | "yearly" | "piece";
  storageLabel?: string;
}

// Storage add-on tiers for Website plans. Base plan includes 7GB;
// upgrading adds a flat PHP amount that gets converted like any other price.
type StorageTier = "7" | "50" | "100";
const STORAGE_ADDON_PRICE_PHP: Record<StorageTier, number> = {
  "7": 0,
  "50": 2500,
  "100": 3500,
};
const storageGb = (t: StorageTier) => (t === "7" ? 5 : Number(t));
const PricingPage = () => {
  const [activeService, setActiveService] = useState("website");
  const [billingPeriod, setBillingPeriod] = useState<
    "monthly" | "yearly" | "piece"
  >("monthly");
  const [currency, setCurrency] = useState<Currency>("PHP");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientEmail, setClientEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(
    null,
  );

  // Per-plan storage selection, keyed by plan name (Website service only).
  // Defaults to "7" (the included 7GB) when a plan has no entry yet.
  const [storageSelections, setStorageSelections] = useState<
    Record<string, StorageTier>
  >({});

  const services = {
    website: {
      title: "Website / Web App With Mobile App",
      description:
        "Professional website solutions with mobile app and advanced features",
      plans: [
        {
          name: "Standard",
          monthlyPrice: 5522.88,
          yearlyPrice: 55722,
          usdMonthlyPrice: 88,
          usdYearlyPrice: 1056,
          features: [
            "Up to 5 pages",
            "Social Media Links integration",
            "Simple Contact Form",
            "Email Alerts for Form Inquiries",
            "1-Year Domain and Hosting",
            "5GB Storage (Upgradeable to 50GB or 100GB)",
            "Mobile-Responsive Design",
            "Basic On-Page SEO Setup",
            "Free SSL Security Certificate",
            "30 Days of Free Minor Revisions",
          ],
          popular: false,
          cta: "Get Started",
        },
        {
          name: "Premium",
          monthlyPrice: 9999,
          yearlyPrice: 119988,
          features: [
            "Everything in Standard, plus:",
            "Up to 10 Website Pages",
            "Dashboard Login for Clients",
            "Traffic Insights & Analytics",
            "Enhanced Site Customization",
            "Smart Chat System",
            "Design Upgrade",
            "Free Maintenance (while your contract is active)",
          ],
          popular: true,
          cta: "Choose Plan",
        },
        {
          name: "Business",
          monthlyPrice: 14999,
          yearlyPrice: 179988,
          features: [
            "Everything in Premium, plus:",
            "SEO Pro Setup +",
            "Dashboard Reports",
            "eCommerce - Ready Products Catalog",
            "Admin Staff & Client Management",
            "Upgraded Motion & Animation Website",
            "Lead Form With Dashboard Tracking",
            "Video Testimonials Section",
            "Free Maintenance (while your contract is active)",
          ],
          popular: false,
          cta: "Contact Sales",
        },
        {
          name: "Commerce",
          monthlyPrice: 21999,
          yearlyPrice: 263988,
          features: [
            "Everything in Business, plus:",
            "Advanced Conversion Tracking",
            "Full eCommerce System",
            "Booking Calendar & Tools",
            "Real-Time Notifications System",
            "VIP Priority Support (Phone, Chat, Email)",
            "Dashboard for Clients",
            "Free Maintenance (while your contract is active)",
          ],
          popular: false,
          cta: "Contact Sales",
        },
      ],
    },
    juantap: {
      title: "JuanTap - Modern NFC Card",
      description:
        "Digital business cards with NFC technology (per piece pricing)",
      plans: [
        {
          name: "Standard",
          monthlyPrice: 588,
          yearlyPrice: 588,
          features: [
            "Editable and customizable design",
            "QR Code for non-NFC phones",
            "Simple card design (logo and name in background)",
            "Name on front, Logo or QR on back",
            "Click-to-call, click-to-email",
            "Lifetime reusable",
          ],
          popular: false,
          cta: "Get Started",
          badge: "BEST FOR Freelancers, individuals, basic use",
        },
        {
          name: "Premium",
          monthlyPrice: 888,
          yearlyPrice: 888,
          features: [
            "Full-Color Premium Design",
            "Choose your style (Silver, Laser, Leather)",
            "Personal info (Name, Title, Company, Contact)",
            "QR Code for non-NFC phones",
            "Business location Maps + Save Contact Button",
            "Social media & website links",
            "Online dashboard (edit anytime)",
            "File upload (PDF / Portfolio)",
            "Lifetime reusable",
          ],
          popular: true,
          cta: "Choose Plan",
          badge: "BEST FOR Small business owners, entrepreneurs",
        },
        {
          name: "Elite",
          monthlyPrice: 1288,
          yearlyPrice: 1288,
          features: [
            "Premium card design (laser printed logo and name)",
            "Premium metal finish",
            "Personal info (Name, Title, Company, Contact)",
            "Business location Maps + Save Contact Button",
            "Analytics (taps/views counts)",
            "Multiple profile support (Business & Personal)",
            "Full-color creative design",
            "File upload (PDF / Portfolio)",
            "QR Code for non-NFC phones",
            "Editable and customizable design",
          ],
          popular: false,
          cta: "Contact Sales",
          badge: "BEST FOR VIP clients, brokers, executives",
        },
      ],
    },
    multimedia: {
      title: "Multimedia Advertising",
      description:
        "Professional multimedia content creation and advertising packages",
      plans: [
        {
          name: "Standard",
          monthlyPrice: 4950,
          yearlyPrice: 59400,
          features: [
            "Product or Corporate Photo Shoot (up to 10 items or 5 pax)",
            "1 Short Promo Video (30–60s)",
            "Basic Editing (Photo + Video)",
            "Background Music",
            "20 Edited Photos",
            "1 Export Format (Web-optimized)",
          ],
          popular: false,
          cta: "Get Started",
        },
        {
          name: "Business Growth",
          monthlyPrice: 14750,
          yearlyPrice: 177000,
          features: [
            "Product + Lifestyle + Corporate Photography (up to 30 items / 8 pax)",
            "1 Full Promo Video (1–3 mins) + 3 Social Media Shorts",
            "Event Coverage (up to 4 hrs)",
            "Scriptwriting & Concept",
            "50 Edited Photos",
            "Subtitles & Captions",
            "Optimized for TikTok, IG, FB & Website",
          ],
          popular: true,
          cta: "Choose Plan",
        },
        {
          name: "Business",
          monthlyPrice: 29500,
          yearlyPrice: 354000,
          features: [
            "Full Product + Corporate + Lifestyle Coverage (unlimited products/team)",
            "Full Event Coverage (up to 8 hrs)",
            "On-site Interviews + Voice-over",
            "Scriptwriting & Storyboarding",
            "1 Main Video (3–5 mins) + 5 Social Media Shorts",
            "Full Color Grading + Advanced Retouching + Creative Branding Overlays",
            "1 Export Format (Web-optimized)",
          ],
          popular: false,
          cta: "Contact Sales",
        },
      ],
    },
    socialmedia: {
      title: "Social Media Management",
      description:
        "Complete social media management and content creation packages",
      plans: [
        {
          name: "Starter",
          monthlyPrice: 5999,
          yearlyPrice: 71988,
          features: [
            "1-2 Social Media Platforms",
            "4 Posts per Month",
            "Basic Content Calendar",
            "Hashtag Research",
            "Community Engagement",
            "Monthly Performance Report",
          ],
          popular: false,
          cta: "Get Started",
        },
        {
          name: "Growth",
          monthlyPrice: 12999,
          yearlyPrice: 155988,
          features: [
            "2-3 Social Media Platforms",
            "8 Posts per Month",
            "Advanced Content Calendar",
            "Hashtag & Keyword Optimization",
            "Daily Community Engagement",
            "Monthly Analytics Report",
            "Content Strategy Consultation",
          ],
          popular: true,
          cta: "Choose Plan",
        },
        {
          name: "Premium",
          monthlyPrice: 24999,
          yearlyPrice: 299988,
          features: [
            "4+ Social Media Platforms",
            "20 Posts per Month",
            "Professional Content Creation",
            "Influencer Coordination",
            "Paid Ads Management",
            "Weekly Engagement Reports",
            "Brand Strategy & Consulting",
            "Crisis Management Support",
          ],
          popular: false,
          cta: "Contact Sales",
        },
      ],
    },
  };

  const currentService = services[activeService as keyof typeof services];
  const currentPlans = currentService.plans;

  const removeFromCart = (planName: string, service: string) => {
    setCart(
      cart.filter(
        (item) => !(item.planName === planName && item.service === service),
      ),
    );
  };

  const getServiceTitle = (serviceKey: string) => {
    const titles: Record<string, string> = {
      website: "Website",
      juantap: "JuanTap",
      multimedia: "Multimedia",
      socialmedia: "Social Media",
    };
    return titles[serviceKey] || serviceKey;
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);
  const cartHasMixedCurrencies = cart.some(
    (item) => item.currency !== currency,
  );

  // Storage add-on price is a MONTHLY rate. When billing is yearly, it needs
  // to be scaled ×12 so the yearly total reflects 12 months of the upgrade
  // (otherwise a yearly plan would only be charged one month's worth of it).
  const getStorageAddonPhp = (
    tier: StorageTier,
    period: "monthly" | "yearly" | "piece",
  ) => {
    const monthlyAddon = STORAGE_ADDON_PRICE_PHP[tier];
    if (monthlyAddon === 0) return 0;
    return period === "yearly" ? monthlyAddon * 12 : monthlyAddon;
  };

  // PricingCard computes its own displayed price straight from
  // plan.monthlyPrice/yearlyPrice (and plan.usdMonthlyPrice/usdYearlyPrice
  // when set, e.g. Standard). To make the price shown ON the card reflect
  // the chosen storage tier, we pass PricingCard a copy of the plan with
  // the add-on already folded into every price field it might read from —
  // including the USD overrides, since those otherwise bypass the PHP
  // add-on entirely when currency is USD.
  const getDisplayPlan = (plan: any) => {
    if (activeService !== "website") return plan;
    const tier: StorageTier = storageSelections[plan.name] ?? "7";
    if (tier === "7") return plan;

    const monthlyAddonPhp = STORAGE_ADDON_PRICE_PHP[tier];
    const yearlyAddonPhp = monthlyAddonPhp * 12;
    const monthlyAddonUsd = convertPrice(monthlyAddonPhp, undefined, "USD");
    const yearlyAddonUsd = convertPrice(yearlyAddonPhp, undefined, "USD");

    return {
      ...plan,
      monthlyPrice: plan.monthlyPrice + monthlyAddonPhp,
      yearlyPrice: plan.yearlyPrice + yearlyAddonPhp,
      usdMonthlyPrice:
        plan.usdMonthlyPrice !== undefined
          ? plan.usdMonthlyPrice + monthlyAddonUsd
          : undefined,
      usdYearlyPrice:
        plan.usdYearlyPrice !== undefined
          ? plan.usdYearlyPrice + yearlyAddonUsd
          : undefined,
    };
  };

  // Computes the effective price used for the cart: base plan price plus
  // the storage add-on (Website plans only), converted into the active
  // currency.
  const computeEffectivePrice = (plan: any) => {
    const isYearly = billingPeriod === "yearly";
    const phpAmount = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
    const usdOverride = isYearly ? plan.usdYearlyPrice : plan.usdMonthlyPrice;
    const basePrice = convertPrice(phpAmount, usdOverride, currency);

    const storageTier: StorageTier =
      activeService === "website" ? (storageSelections[plan.name] ?? "7") : "7";
    const storageAddonPhp = getStorageAddonPhp(
      storageTier,
      activeService === "juantap" ? "piece" : billingPeriod,
    );
    const storageAddonPrice =
      storageAddonPhp > 0
        ? convertPrice(storageAddonPhp, undefined, currency)
        : 0;

    return {
      price: basePrice + storageAddonPrice,
      storageTier,
      hasStorageAddon: storageAddonPrice > 0,
    };
  };

  const handleAddToCart = (plan: any) => {
    const { price, storageTier } = computeEffectivePrice(plan);

    setCart([
      ...cart,
      {
        planName: plan.name,
        service: activeService,
        price,
        currency,
        billingPeriod: activeService === "juantap" ? "piece" : billingPeriod,
        storageLabel:
          activeService === "website"
            ? `${storageGb(storageTier)}GB Storage`
            : undefined,
      },
    ]);
  };

  // SEO / SSR: useMediaQuery is false for both queries on the server, which
  // would leave the plans out of the initial HTML. Until the component has
  // mounted we render the desktop grid (so crawlers see every plan), then
  // switch to the mobile layout on the client when needed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDesktopOrLaptop = useMediaQuery({
    query: "(min-width: 1000px)",
  });
  const isTabletOrMobile = useMediaQuery({ query: "(max-width: 999px)" });

  const showMobileLayout = mounted && isTabletOrMobile;
  const showDesktopLayout = !mounted || isDesktopOrLaptop;

  // Shared billing/currency toggle row (reused in both layouts below).
  const controlsRow = (
    <div className="flex justify-start items-center gap-5 flex-wrap">
      {activeService !== "juantap" && (
        <>
          <ToggleSwitch
            leftLabel="Monthly"
            rightLabel="Yearly"
            checked={billingPeriod === "yearly"}
            onChange={(checked) =>
              setBillingPeriod(checked ? "yearly" : "monthly")
            }
          />
          <div className="w-px h-6 bg-slate-700" />
        </>
      )}
      <ToggleSwitch
        leftLabel="PHP"
        rightLabel="USD"
        checked={currency === "USD"}
        onChange={(checked) => setCurrency(checked ? "USD" : "PHP")}
      />
    </div>
  );

  // Storage upgrade selector, rendered under each Website plan card.
  // Clicks stop propagation so they don't trigger the card-select handler
  // that wraps cards on the tablet/mobile layout. The price on the card
  // above updates on its own via getDisplayPlan — no need to repeat it here.
  const renderStorageSelector = (planName: string) => {
    const selected = storageSelections[planName] ?? "7";

    const tierButtonClass = (tier: StorageTier) =>
      `px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
        selected === tier
          ? "bg-gradient-to-r from-cyan-500 to-blue-500 border-cyan-400 text-white"
          : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
      }`;

    return (
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs text-slate-400">
          Storage:{" "}
          <span className="text-slate-200 font-medium">
            {storageGb(selected)}GB
          </span>
          {selected === "7" ? " (included)" : " (upgraded)"}
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setStorageSelections((prev) => ({ ...prev, [planName]: "7" }));
            }}
            className={tierButtonClass("7")}
          >
            5GB (included)
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setStorageSelections((prev) => ({ ...prev, [planName]: "50" }));
            }}
            className={tierButtonClass("50")}
          >
            +50GB (₱2,500/mo)
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setStorageSelections((prev) => ({ ...prev, [planName]: "100" }));
            }}
            className={tierButtonClass("100")}
          >
            +100GB (₱3,500/mo)
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white py-16">
      {/* Header Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 mb-4 lg:mb-6 mt-8">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl text-accent font-bold tracking-tight mb-4 uppercase">
            Our Pricing Plans
          </h1>
          <p className="text-base sm:text-lg text-slate-300 mb-6 leading-relaxed">
            Choose the perfect plan for your business. All plans include support
            and updates.
          </p>

          {/* Service Selector */}
          <div className="flex justify-center gap-2 mb-6 overflow-x-auto pb-2 flex-wrap md:flex-nowrap">
            {Object.entries(services).map(([key, service]) => (
              <button
                key={key}
                onClick={() => {
                  setActiveService(key);
                  setSelectedCardIndex(null);
                  if (key === "juantap") {
                    setBillingPeriod("piece");
                  } else if (billingPeriod === "piece") {
                    setBillingPeriod("monthly");
                  }
                }}
                className={`px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap text-sm ${
                  activeService === key
                    ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {key === "website" && "Website"}
                {key === "juantap" && "JuanTap"}
                {key === "multimedia" && "Multimedia"}
                {key === "socialmedia" && "Social Media"}
              </button>
            ))}
          </div>

          <p className="text-slate-400 text-sm">{currentService.description}</p>
        </div>
      </section>

      {/* Consultation CTA Section - only for Social Media */}
      {activeService === "socialmedia" && (
        <section className="container mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-2xl p-8 max-w-3xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Phone className="w-6 h-6 text-cyan-400" />
              <h2 className="text-2xl md:text-3xl font-bold text-white">
                Custom Solutions?
              </h2>
            </div>
            <p className="text-slate-300 mb-6 text-lg">
              Need a tailored package? Schedule a consultation with our team to
              discuss your specific needs and requirements.
            </p>
            <Link
              href="/contact"
              className="inline-block px-8 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-600 hover:to-blue-600 transition-all"
            >
              Schedule Consultation
            </Link>
            <p className="text-slate-400 text-sm mt-4">
              <strong>Price Range:</strong>{" "}
              {currency === "USD"
                ? `$${formatPrice(convertPrice(10000, undefined, "USD"), "USD")} - $${formatPrice(convertPrice(150000, undefined, "USD"), "USD")}+`
                : "₱10,000 - ₱150,000+"}
            </p>
          </div>
        </section>
      )}

      {showMobileLayout && activeService !== "socialmedia" && (
        <section className="mx-auto w-full px-4 sm:px-6 pb-10">
          <div className="mb-5">{controlsRow}</div>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-10 items-stretch pt-4"
            onClick={() => setSelectedCardIndex(null)}
          >
            {currentPlans.map((plan, index) => {
              const isSelected = selectedCardIndex === index;

              return (
                <div
                  key={index}
                  className="flex flex-col w-full sm:last:odd:col-span-2 sm:last:odd:w-[calc(50%-0.75rem)] sm:last:odd:justify-self-center [&>*:first-child]:!w-full [&>*:first-child]:!max-w-none [&>*:first-child]:flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCardIndex(isSelected ? null : index);
                  }}
                >
                  <PricingCard
                    plan={getDisplayPlan(plan)}
                    billingPeriod={
                      activeService === "juantap" ? "piece" : billingPeriod
                    }
                    currency={currency}
                    onAddToCart={() => handleAddToCart(plan)}
                    isHovered={isSelected}
                    isSmall={false}
                  />
                  {activeService === "website" &&
                    renderStorageSelector(plan.name)}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {showDesktopLayout && activeService !== "socialmedia" && (
        <section className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Controls row now sits directly above the cards */}
          <div className="mb-6">{controlsRow}</div>

          <div className="grid grid-cols-4 gap-6">
            {currentPlans.map((plan, index) => (
              <div key={index} className="flex flex-col">
                <PricingCard
                  plan={getDisplayPlan(plan)}
                  billingPeriod={
                    activeService === "juantap" ? "piece" : billingPeriod
                  }
                  currency={currency}
                  onAddToCart={() => handleAddToCart(plan)}
                  isHovered={false}
                  isSmall={false}
                />
                {activeService === "website" &&
                  renderStorageSelector(plan.name)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default PricingPage;
