"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader,
  BarChart3,
  Filter,
  Search,
  Calendar,
  Trash2,
  Globe,
  TrendingUp,
  Target,
} from "lucide-react";

interface ClientAssessment {
  id: number;
  business_name: string;
  industry_niche: string;
  industry_niche_other: string;
  business_type: string;
  years_in_operation: string;
  company_size: string;
  company_size_other: string;
  branches_locations: string;
  geographic_scope: string;
  geographic_scope_other: string;
  has_physical_stores: boolean;
  has_online_presence: boolean;
  website_url: string;
  website_type: string;
  website_type_other: string;
  website_condition: string;
  page_speed: string;
  mobile_responsive: boolean;
  clear_cta: boolean;
  google_brand_search: boolean;
  non_brand_keywords: boolean;
  has_blog_content: boolean;
  meta_optimized: boolean;
  seo_opportunity_level: string;
  seo_notes: string;
  google_ads_running: boolean;
  search_ads_visible: boolean;
  shopping_ads_visible: boolean;
  display_ads_visible: boolean;
  ad_quality: string;
  paid_ads_opportunity: string;
  paid_ads_opportunity_other: string;
  facebook_status: string;
  instagram_status: string;
  tiktok_status: string;
  linkedin_status: string;
  other_social: string;
  posting_frequency: string;
  posting_frequency_other: string;
  engagement_level: string;
  online_purchasing_enabled: string;
  payment_gateways_visible: string;
  product_pages_optimized: string;
  has_reviews_testimonials: string;
  funnel_health: string;
  funnel_health_other: string;
  likely_client_intent: {
    lead_generation: boolean;
    online_sales_growth: boolean;
    brand_visibility: boolean;
    website_traffic_increase: boolean;
    market_expansion: boolean;
    other: boolean;
    other_text: string;
  };
  inquiry_source: string;
  inquiry_source_other: string;
  social_media_links: string[];
  primary_recommendation: {
    website_development: boolean;
    mobile_app_development: boolean;
    seo: boolean;
    google_ads: boolean;
    seo_google_ads_bundle: boolean;
    website_redesign: boolean;
    analytics_conversion_tracking: boolean;
    multimedia_services: boolean;
    other: boolean;
    other_text: string;
  };
  secondary_recommendations: {
    landing_pages: boolean;
    google_shopping_ads: boolean;
    remarketing: boolean;
    content_creation: boolean;
    other: boolean;
    other_text: string;
  };
  contact_info: string;
  location: string;
  additional_notes: string;
  created_at: string;
}

const ITEMS_PER_PAGE = 10;

// Shows the custom text when "Other" was picked, otherwise the picked value.
const otherOr = (
  value: string | null | undefined,
  other: string | null | undefined,
): string => {
  if (value === "Other") return other || "Other";
  return value || "N/A";
};

const seoBadgeVariant = (
  level: string,
): "destructive" | "default" | "secondary" =>
  level === "High"
    ? "destructive"
    : level === "Medium"
      ? "default"
      : "secondary";

// These read nested objects, so they guard against a missing object
// instead of crashing the whole table.
const getRecommendations = (assessment: ClientAssessment): string[] => {
  const p = assessment.primary_recommendation;
  if (!p) return [];
  const result: string[] = [];
  if (p.website_development) result.push("Website Dev");
  if (p.mobile_app_development) result.push("Mobile App");
  if (p.seo) result.push("SEO");
  if (p.google_ads) result.push("Google Ads");
  if (p.seo_google_ads_bundle) result.push("SEO + Ads Bundle");
  if (p.website_redesign) result.push("Redesign");
  if (p.analytics_conversion_tracking) result.push("Analytics");
  if (p.multimedia_services) result.push("Multimedia");
  if (p.other && p.other_text) result.push(p.other_text);
  return result;
};

const getSecondaryRecommendations = (
  assessment: ClientAssessment,
): string[] => {
  const s = assessment.secondary_recommendations;
  if (!s) return [];
  const result: string[] = [];
  if (s.landing_pages) result.push("Landing Pages");
  if (s.google_shopping_ads) result.push("Google Shopping Ads");
  if (s.remarketing) result.push("Remarketing");
  if (s.content_creation) result.push("Content Creation");
  if (s.other && s.other_text) result.push(s.other_text);
  return result;
};

const getClientIntents = (assessment: ClientAssessment): string[] => {
  const i = assessment.likely_client_intent;
  if (!i) return [];
  const result: string[] = [];
  if (i.lead_generation) result.push("Lead Gen");
  if (i.online_sales_growth) result.push("Sales Growth");
  if (i.brand_visibility) result.push("Brand Visibility");
  if (i.website_traffic_increase) result.push("Traffic");
  if (i.market_expansion) result.push("Expansion");
  if (i.other && i.other_text) result.push(i.other_text);
  return result;
};

function Section({
  title,
  color,
  last,
  children,
}: {
  title: string;
  color: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={last ? "" : "border-b border-slate-200 pb-4"}>
      <h3 className={`font-bold text-lg mb-3 ${color}`}>{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <div className="text-slate-900 break-words">{children}</div>
    </div>
  );
}

function FlagBadges({ flags }: { flags: [string, boolean | undefined][] }) {
  const active = flags.filter(([, on]) => on);
  if (active.length === 0) return <span className="text-slate-400">None</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {active.map(([label]) => (
        <Badge key={label} variant="outline">
          {label}
        </Badge>
      ))}
    </div>
  );
}

function AssessmentDetails({ a }: { a: ClientAssessment }) {
  const intents = getClientIntents(a);
  const primary = getRecommendations(a);
  const secondary = getSecondaryRecommendations(a);
  const links = (a.social_media_links ?? []).filter(Boolean);

  return (
    <div className="space-y-6 text-sm">
      <Section title="Company Information" color="text-blue-600">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Business Name">{a.business_name}</Field>
          <Field label="Industry/Niche">
            {otherOr(a.industry_niche, a.industry_niche_other)}
          </Field>
          <Field label="Business Type">{a.business_type || "N/A"}</Field>
          <Field label="Years in Operation">
            {a.years_in_operation || "N/A"}
          </Field>
          <Field label="Company Size">
            {otherOr(a.company_size, a.company_size_other)}
          </Field>
          <Field label="Geographic Scope">
            {otherOr(a.geographic_scope, a.geographic_scope_other)}
          </Field>
        </div>
        <Field label="Presence" className="mt-3">
          <FlagBadges
            flags={[
              ["Physical Stores", a.has_physical_stores],
              ["Online Presence", a.has_online_presence],
            ]}
          />
        </Field>
        {a.branches_locations && (
          <Field label="Branches/Locations" className="mt-3">
            {a.branches_locations}
          </Field>
        )}
      </Section>

      <Section title="Website & Digital Assets" color="text-blue-600">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Website URL">
            {a.website_url ? (
              <a
                href={a.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {a.website_url}
              </a>
            ) : (
              "N/A"
            )}
          </Field>
          <Field label="Website Type">
            {otherOr(a.website_type, a.website_type_other)}
          </Field>
          <Field label="Website Condition">
            {a.website_condition || "N/A"}
          </Field>
          <Field label="Page Speed">{a.page_speed || "N/A"}</Field>
        </div>
        <Field label="Quick Checks" className="mt-3">
          <FlagBadges
            flags={[
              ["Mobile Responsive", a.mobile_responsive],
              ["Clear CTA", a.clear_cta],
            ]}
          />
        </Field>
      </Section>

      <Section title="Search Visibility (SEO)" color="text-green-600">
        <Field label="SEO Opportunity Level">
          {a.seo_opportunity_level ? (
            <Badge variant={seoBadgeVariant(a.seo_opportunity_level)}>
              {a.seo_opportunity_level}
            </Badge>
          ) : (
            "N/A"
          )}
        </Field>
        <div className="mt-3">
          <FlagBadges
            flags={[
              ["Brand Search Visible", a.google_brand_search],
              ["Non-brand Keywords", a.non_brand_keywords],
              ["Has Blog", a.has_blog_content],
              ["Meta Optimized", a.meta_optimized],
            ]}
          />
        </div>
        {a.seo_notes && (
          <Field label="SEO Notes" className="mt-3">
            {a.seo_notes}
          </Field>
        )}
      </Section>

      <Section title="Google Ads / Paid Ads" color="text-orange-600">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <Field label="Ad Quality">{a.ad_quality || "N/A"}</Field>
          <Field label="Paid Ads Opportunity">
            {otherOr(a.paid_ads_opportunity, a.paid_ads_opportunity_other)}
          </Field>
        </div>
        <FlagBadges
          flags={[
            ["Google Ads Running", a.google_ads_running],
            ["Search Ads", a.search_ads_visible],
            ["Shopping Ads", a.shopping_ads_visible],
            ["Display Ads", a.display_ads_visible],
          ]}
        />
      </Section>

      <Section title="Social Media Presence" color="text-purple-600">
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ["Facebook", a.facebook_status],
              ["Instagram", a.instagram_status],
              ["TikTok", a.tiktok_status],
              ["LinkedIn", a.linkedin_status],
            ] as const
          ).map(([label, status]) => (
            <Field key={label} label={label}>
              <Badge variant="outline">{status || "N/A"}</Badge>
            </Field>
          ))}
          <Field label="Posting Frequency">
            {otherOr(a.posting_frequency, a.posting_frequency_other)}
          </Field>
          <Field label="Engagement Level">{a.engagement_level || "N/A"}</Field>
        </div>
        {links.length > 0 && (
          <Field label="Social Media Links" className="mt-3">
            <div className="space-y-1">
              {links.map((link, idx) => (
                <a
                  key={idx}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all block"
                >
                  {link}
                </a>
              ))}
            </div>
          </Field>
        )}
      </Section>

      <Section title="E-commerce / Sales Funnel" color="text-teal-600">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Online Purchasing">
            {a.online_purchasing_enabled || "N/A"}
          </Field>
          <Field label="Payment Gateways">
            {a.payment_gateways_visible || "N/A"}
          </Field>
          <Field label="Product Pages Optimized">
            {a.product_pages_optimized || "N/A"}
          </Field>
          <Field label="Reviews/Testimonials">
            {a.has_reviews_testimonials || "N/A"}
          </Field>
          <Field label="Funnel Health" className="col-span-2">
            {otherOr(a.funnel_health, a.funnel_health_other)}
          </Field>
        </div>
      </Section>

      <Section title="Client Intent" color="text-indigo-600">
        {intents.length === 0 ? (
          <span className="text-slate-400">None selected</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {intents.map((intent, idx) => (
              <Badge key={idx} variant="secondary">
                {intent}
              </Badge>
            ))}
          </div>
        )}
      </Section>

      <Section title="Service Recommendations" color="text-pink-600">
        <Field label="Primary Recommendations" className="mb-4">
          {primary.length === 0 ? (
            <span className="text-slate-400">None</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {primary.map((rec, idx) => (
                <Badge key={idx} variant="default">
                  {rec}
                </Badge>
              ))}
            </div>
          )}
        </Field>
        <Field label="Secondary Recommendations">
          {secondary.length === 0 ? (
            <span className="text-slate-400">None</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {secondary.map((rec, idx) => (
                <Badge key={idx} variant="outline">
                  {rec}
                </Badge>
              ))}
            </div>
          )}
        </Field>
      </Section>

      <Section title="Additional Information" color="text-slate-700" last>
        <div className="space-y-3">
          <Field label="Contact Information">{a.contact_info || "N/A"}</Field>
          {a.location && <Field label="Location">{a.location}</Field>}
          {a.additional_notes && (
            <Field label="Additional Notes">
              <p className="whitespace-pre-wrap">{a.additional_notes}</p>
            </Field>
          )}
        </div>
      </Section>
    </div>
  );
}

export default function AdminClientAssessmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [assessments, setAssessments] = useState<ClientAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAssessment, setSelectedAssessment] =
    useState<ClientAssessment | null>(null);
  const [assessmentToDelete, setAssessmentToDelete] =
    useState<ClientAssessment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBusinessType, setFilterBusinessType] = useState("all");

  useEffect(() => {
    const token = localStorage.getItem("adminSessionActive");
    if (!token) {
      router.push("/admin/login");
      return;
    }

    fetchAssessments(token);
  }, [router]);

  const fetchAssessments = async (token: string) => {
    try {
      const response = await fetch("/api/client-assessment", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch client assessments");
      }

      const data = await response.json();

      let assessmentsData: ClientAssessment[] = [];
      if (data.success && data.data) {
        if (data.data.data && Array.isArray(data.data.data)) {
          assessmentsData = data.data.data;
        } else if (Array.isArray(data.data)) {
          assessmentsData = data.data;
        }
      }

      setAssessments(assessmentsData);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      setMessage("Failed to load client assessments");
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAssessment = async () => {
    if (!assessmentToDelete) return;

    const token = localStorage.getItem("adminSessionActive");
    if (!token) return;

    setDeleting(true);
    try {
      const response = await fetch(
        `/api/client-assessment/${assessmentToDelete.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete assessment");
      }

      toast({
        title: "Success",
        description: `Client assessment for ${assessmentToDelete.business_name} deleted successfully!`,
        variant: "default",
      });

      setAssessments((prev) =>
        prev.filter((a) => a.id !== assessmentToDelete.id),
      );
      setAssessmentToDelete(null);
    } catch (error) {
      console.error("Error deleting assessment:", error);
      toast({
        title: "Error",
        description: "Failed to delete assessment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const query = searchQuery.toLowerCase();

  const filteredAssessments = assessments.filter((assessment) => {
    const matchesSearch =
      assessment.business_name?.toLowerCase().includes(query) ||
      assessment.industry_niche?.toLowerCase().includes(query) ||
      assessment.contact_info?.toLowerCase().includes(query);

    const matchesFilter =
      filterBusinessType === "all" ||
      assessment.business_type === filterBusinessType;

    return matchesSearch && matchesFilter;
  });

  const uniqueBusinessTypes = Array.from(
    new Set(assessments.map((a) => a.business_type).filter(Boolean)),
  );

  const stats = {
    total: assessments.length,
    withSEO: assessments.filter(
      (a) =>
        a.seo_opportunity_level === "High" ||
        a.seo_opportunity_level === "Medium",
    ).length,
    withAds: assessments.filter((a) => a.google_ads_running).length,
    highPriority: assessments.filter((a) => a.seo_opportunity_level === "High")
      .length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading client assessments...</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(filteredAssessments.length / ITEMS_PER_PAGE);
  // Stay on a valid page after a delete or filter shrinks the list.
  const page = Math.min(currentPage, Math.max(totalPages, 1));
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedAssessments = filteredAssessments.slice(startIndex, endIndex);

  const statCards = [
    {
      label: "Total Assessments",
      value: stats.total,
      icon: BarChart3,
      border: "border-slate-200",
      valueColor: "text-slate-900",
      iconBg: "from-blue-500 to-purple-500",
    },
    {
      label: "SEO Opportunities",
      value: stats.withSEO,
      icon: TrendingUp,
      border: "border-green-200",
      valueColor: "text-green-600",
      iconBg: "from-green-500 to-green-600",
    },
    {
      label: "Running Ads",
      value: stats.withAds,
      icon: Globe,
      border: "border-orange-200",
      valueColor: "text-orange-600",
      iconBg: "from-orange-500 to-orange-600",
    },
    {
      label: "High Priority",
      value: stats.highPriority,
      icon: Target,
      border: "border-red-200",
      valueColor: "text-red-600",
      iconBg: "from-red-500 to-red-600",
    },
  ];

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* Header banner */}
      <div className="w-full px-3 sm:px-4 pt-4">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl shadow-lg px-6 sm:px-8 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <Target className="h-8 w-8 sm:h-10 sm:w-10" />
                Client Assessments
              </h1>
              <p className="text-blue-100">
                Manage and view all client assessment submissions
              </p>
            </div>
            <Link href="/admin/dashboard">
              <Button
                variant="secondary"
                className="bg-white hover:bg-gray-100 text-blue-900"
              >
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="w-full px-3 sm:px-4 py-6">
        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          {statCards.map(
            ({ label, value, icon: Icon, border, valueColor, iconBg }) => (
              <Card
                key={label}
                className={`border-2 ${border} bg-white hover:shadow-lg transition-shadow`}
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-slate-600 mb-1">
                        {label}
                      </p>
                      <p
                        className={`text-2xl sm:text-3xl font-bold ${valueColor}`}
                      >
                        {value}
                      </p>
                    </div>
                    <div
                      className={`p-2 sm:p-3 bg-gradient-to-br ${iconBg} rounded-xl`}
                    >
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ),
          )}
        </div>

        {message && (
          <Alert
            className="mb-6 border-2"
            variant={
              message.includes("successfully") ? "default" : "destructive"
            }
          >
            <AlertDescription className="font-medium">
              {message}
            </AlertDescription>
          </Alert>
        )}

        {/* Assessments table */}
        <Card className="border-2 border-slate-200 shadow-xl bg-white overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-blue-50/30 px-4 sm:px-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl sm:text-2xl flex items-center gap-2 text-slate-900">
                  <Target className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  All Assessments
                </CardTitle>
                <CardDescription className="mt-1 text-slate-600">
                  {filteredAssessments.length === 0
                    ? "Showing 0 of 0"
                    : `Showing ${startIndex + 1}-${Math.min(
                        endIndex,
                        filteredAssessments.length,
                      )} of ${filteredAssessments.length}`}
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 sm:min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Search assessments..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-9 border-2 bg-white"
                  />
                </div>
                {uniqueBusinessTypes.length > 0 && (
                  <Select
                    value={filterBusinessType}
                    onValueChange={(value) => {
                      setFilterBusinessType(value);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[200px] border-2 bg-white">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[100] bg-white border-2 shadow-xl">
                      <SelectItem value="all">All Types</SelectItem>
                      {uniqueBusinessTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="font-semibold text-slate-700 px-4 sm:px-6 py-3">
                      Business Name
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden md:table-cell px-4 py-3">
                      Industry
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden lg:table-cell px-4 py-3">
                      Recommendations
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden xl:table-cell px-4 py-3">
                      SEO Level
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden sm:table-cell px-4 py-3">
                      Date
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 px-4 sm:px-6 py-3">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAssessments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 px-4">
                        <div className="flex flex-col items-center gap-2">
                          <Target className="h-12 w-12 text-slate-300" />
                          <p className="text-slate-600 font-medium">
                            No client assessments found
                          </p>
                          <p className="text-sm text-slate-500">
                            Try adjusting your search or filters
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedAssessments.map((assessment) => {
                      const recommendations = getRecommendations(assessment);

                      return (
                        <TableRow
                          key={assessment.id}
                          className="hover:bg-blue-50/50 transition-colors"
                        >
                          <TableCell className="font-medium text-slate-900 px-4 sm:px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                                {assessment.business_name
                                  ?.charAt(0)
                                  ?.toUpperCase() || "?"}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate max-w-[220px]">
                                  {assessment.business_name}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {assessment.business_type}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell px-4 py-3">
                            <Badge variant="outline">
                              {otherOr(
                                assessment.industry_niche,
                                assessment.industry_niche_other,
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell px-4 py-3">
                            <div className="flex gap-1 flex-wrap max-w-xs">
                              {recommendations.slice(0, 2).map((rec, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {rec}
                                </Badge>
                              ))}
                              {recommendations.length > 2 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{recommendations.length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell px-4 py-3">
                            {assessment.seo_opportunity_level && (
                              <Badge
                                variant={seoBadgeVariant(
                                  assessment.seo_opportunity_level,
                                )}
                              >
                                {assessment.seo_opportunity_level}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell px-4 py-3">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Calendar className="h-4 w-4" />
                              {new Date(
                                assessment.created_at,
                              ).toLocaleDateString()}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 sm:px-6 py-3">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setSelectedAssessment(assessment)
                                }
                                className="border-2 border-blue-200 text-slate-800 hover:bg-blue-50 hover:text-blue-700"
                              >
                                <Eye className="h-4 w-4" />
                                <span className="hidden sm:inline ml-1">
                                  View
                                </span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setAssessmentToDelete(assessment)
                                }
                                className="border-2 border-red-200 text-slate-800 hover:bg-red-50 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(page - 1, 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium text-slate-700">
              Page {page} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(page + 1, totalPages))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* View details dialog (one dialog for the whole page) */}
      <Dialog
        open={!!selectedAssessment}
        onOpenChange={(open) => {
          if (!open) setSelectedAssessment(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto border-2 bg-white text-slate-900">
          {selectedAssessment && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl sm:text-2xl flex items-center gap-2">
                  <Target className="h-6 w-6 text-blue-600" />
                  Client Assessment Details
                </DialogTitle>
                <DialogDescription>
                  Submitted:{" "}
                  {new Date(selectedAssessment.created_at).toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              <AssessmentDetails a={selectedAssessment} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog (one dialog for the whole page) */}
      <Dialog
        open={!!assessmentToDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setAssessmentToDelete(null);
        }}
      >
        <DialogContent className="bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>Delete Client Assessment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the assessment for{" "}
              {assessmentToDelete?.business_name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setAssessmentToDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAssessment}
              disabled={deleting}
            >
              {deleting ? (
                <Loader className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
