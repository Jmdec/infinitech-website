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
  Building2,
  Trash2,
} from "lucide-react";

interface DemoRequirement {
  id: number;
  business_name: string;
  business_type: string;
  contact_info: string;
  tagline: string;
  primary_purposes: string[];
  primary_purposes_other: string[];
  target_audience: string;
  key_features: string[];
  key_features_other: string[];
  product_image_sources: string[];
  color_style: string;
  social_media_links: string[];
  location: string;
  created_at: string;
}

const ITEMS_PER_PAGE = 10;

// Shows array items and swaps the "Other" placeholder for the custom values.
const displayArrayItems = (
  items: string[] | string | null | undefined,
  otherValue?: string[] | string,
): string[] => {
  if (!items) return [];

  const otherArray = otherValue
    ? Array.isArray(otherValue)
      ? otherValue
      : [otherValue]
    : [];

  if (Array.isArray(items)) {
    if (items.includes("Other") && otherArray.length > 0) {
      return Array.from(
        new Set([...items.filter((item) => item !== "Other"), ...otherArray]),
      );
    }
    return Array.from(new Set(items));
  }

  if (items === "Other" && otherArray.length > 0) return otherArray;
  return [items];
};

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-200 pb-4 last:border-b-0 last:pb-0">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <div className="text-slate-900">{children}</div>
    </div>
  );
}

function LinkList({ links }: { links: string[] }) {
  return (
    <div className="space-y-2">
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
  );
}

export default function AdminDemoRequirementsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [requirements, setRequirements] = useState<DemoRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequirement, setSelectedRequirement] =
    useState<DemoRequirement | null>(null);
  const [requirementToDelete, setRequirementToDelete] =
    useState<DemoRequirement | null>(null);
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

    fetchRequirements(token);
  }, [router]);

  const fetchRequirements = async (token: string) => {
    try {
      const response = await fetch("/api/demoRequirements", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch demo requirements");
      }

      const data = await response.json();

      let requirementsData: DemoRequirement[] = [];
      if (data.success && data.data) {
        if (data.data.data && Array.isArray(data.data.data)) {
          requirementsData = data.data.data;
        } else if (Array.isArray(data.data)) {
          requirementsData = data.data;
        }
      }

      setRequirements(requirementsData);
    } catch (error) {
      console.error("Error fetching requirements:", error);
      setMessage("Failed to load demo requirements");
      setRequirements([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRequirement = async () => {
    if (!requirementToDelete) return;

    const token = localStorage.getItem("adminSessionActive");
    if (!token) return;

    setDeleting(true);
    try {
      const response = await fetch(
        `/api/demoRequirements/${requirementToDelete.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete requirement");
      }

      toast({
        title: "Success",
        description: `Demo requirement for ${requirementToDelete.business_name} deleted successfully!`,
        variant: "default",
      });

      setRequirements((prev) =>
        prev.filter((r) => r.id !== requirementToDelete.id),
      );
      setRequirementToDelete(null);
    } catch (error) {
      console.error("Error deleting requirement:", error);
      toast({
        title: "Error",
        description: "Failed to delete requirement. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const query = searchQuery.toLowerCase();

  const filteredRequirements = requirements.filter((req) => {
    const matchesSearch =
      req.business_name?.toLowerCase().includes(query) ||
      req.business_type?.toLowerCase().includes(query) ||
      req.contact_info?.toLowerCase().includes(query);

    const matchesFilter =
      filterBusinessType === "all" || req.business_type === filterBusinessType;

    return matchesSearch && matchesFilter;
  });

  const uniqueBusinessTypes = Array.from(
    new Set(requirements.map((r) => r.business_type).filter(Boolean)),
  );

  const stats = {
    total: requirements.length,
    submitted: requirements.length,
    completed: requirements.filter((r) => r.business_name && r.contact_info)
      .length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading demo requirements...</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(filteredRequirements.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRequirements = filteredRequirements.slice(
    startIndex,
    endIndex,
  );

  const statCards = [
    {
      label: "Total Requests",
      value: stats.total,
      icon: BarChart3,
      border: "border-slate-200",
      valueColor: "text-slate-900",
      iconBg: "from-blue-500 to-purple-500",
    },
    {
      label: "Submitted",
      value: stats.submitted,
      icon: Building2,
      border: "border-blue-200",
      valueColor: "text-blue-600",
      iconBg: "from-blue-500 to-blue-600",
    },
    {
      label: "Completed",
      value: stats.completed,
      icon: Building2,
      border: "border-purple-200",
      valueColor: "text-purple-600",
      iconBg: "from-purple-500 to-purple-600",
    },
    {
      label: "Completion Rate",
      value: `${
        stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
      }%`,
      icon: BarChart3,
      border: "border-green-200",
      valueColor: "text-green-600",
      iconBg: "from-green-500 to-green-600",
    },
  ];

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* Header banner */}
      <div className="w-full px-3 sm:px-4 pt-4">
        <div className="bg-gradient-to-r from-sky-600 to-blue-600 rounded-3xl shadow-lg px-6 sm:px-8 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <Building2 className="h-8 w-8 sm:h-10 sm:w-10" />
                Website Demo Requirements
              </h1>
              <p className="text-blue-100">
                Manage and view all website demo submission requests
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

        {/* Requests table */}
        <Card className="border-2 border-slate-200 shadow-xl bg-white overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-blue-50/30 px-4 sm:px-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl sm:text-2xl flex items-center gap-2 text-slate-900">
                  <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  All Requests
                </CardTitle>
                <CardDescription className="mt-1 text-slate-600">
                  {filteredRequirements.length === 0
                    ? "Showing 0 of 0"
                    : `Showing ${startIndex + 1}-${Math.min(
                        endIndex,
                        filteredRequirements.length,
                      )} of ${filteredRequirements.length}`}
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 sm:min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Search requests..."
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
                      Type
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden lg:table-cell px-4 py-3">
                      Purpose
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
                  {paginatedRequirements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 px-4">
                        <div className="flex flex-col items-center gap-2">
                          <Building2 className="h-12 w-12 text-slate-300" />
                          <p className="text-slate-600 font-medium">
                            No demo requirements found
                          </p>
                          <p className="text-sm text-slate-500">
                            Try adjusting your search or filters
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRequirements.map((req) => {
                      const displayedPurposes = displayArrayItems(
                        req.primary_purposes,
                        req.primary_purposes_other,
                      );

                      return (
                        <TableRow
                          key={req.id}
                          className="hover:bg-blue-50/50 transition-colors"
                        >
                          <TableCell className="font-medium text-slate-900 px-4 sm:px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                                {req.business_name?.charAt(0)?.toUpperCase() ||
                                  "?"}
                              </div>
                              <span className="truncate max-w-[220px]">
                                {req.business_name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell px-4 py-3">
                            <Badge variant="outline">{req.business_type}</Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell px-4 py-3">
                            <div className="flex gap-1 flex-wrap max-w-xs">
                              {displayedPurposes
                                .slice(0, 2)
                                .map((purpose, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {purpose}
                                  </Badge>
                                ))}
                              {displayedPurposes.length > 2 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{displayedPurposes.length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell px-4 py-3">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Calendar className="h-4 w-4" />
                              {new Date(req.created_at).toLocaleDateString()}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 sm:px-6 py-3">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedRequirement(req)}
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
                                onClick={() => setRequirementToDelete(req)}
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
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium text-slate-700">
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* View details dialog (one dialog for the whole page) */}
      <Dialog
        open={!!selectedRequirement}
        onOpenChange={(open) => {
          if (!open) setSelectedRequirement(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-2 bg-white text-slate-900">
          {selectedRequirement && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl sm:text-2xl flex items-center gap-2">
                  <Building2 className="h-6 w-6 text-blue-600" />
                  Demo Requirement Details
                </DialogTitle>
                <DialogDescription>
                  Submitted:{" "}
                  {new Date(selectedRequirement.created_at).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <p className="font-semibold text-slate-700">
                      Business Name
                    </p>
                    <p>{selectedRequirement.business_name}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700">
                      Business Type
                    </p>
                    <p>{selectedRequirement.business_type}</p>
                  </div>
                </div>

                {selectedRequirement.tagline && (
                  <DetailField label="Tagline">
                    {selectedRequirement.tagline}
                  </DetailField>
                )}

                <DetailField label="Contact Info">
                  {selectedRequirement.contact_info}
                </DetailField>

                <DetailField label="Primary Purposes">
                  <div className="flex flex-wrap gap-2 mt-1">
                    {displayArrayItems(
                      selectedRequirement.primary_purposes,
                      selectedRequirement.primary_purposes_other,
                    ).map((purpose, idx) => (
                      <Badge key={idx} variant="secondary">
                        {purpose}
                      </Badge>
                    ))}
                  </div>
                </DetailField>

                <DetailField label="Target Audience">
                  {selectedRequirement.target_audience}
                </DetailField>

                <DetailField label="Key Features">
                  <div className="flex flex-wrap gap-2 mt-1">
                    {displayArrayItems(
                      selectedRequirement.key_features,
                      selectedRequirement.key_features_other,
                    ).map((feature, idx) => (
                      <Badge key={idx} variant="outline">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </DetailField>

                {selectedRequirement.product_image_sources?.length > 0 && (
                  <DetailField label="Product Image Sources">
                    <LinkList
                      links={selectedRequirement.product_image_sources}
                    />
                  </DetailField>
                )}

                <DetailField label="Color Style">
                  {selectedRequirement.color_style}
                </DetailField>

                {selectedRequirement.social_media_links?.length > 0 && (
                  <DetailField label="Social Media Links">
                    <LinkList links={selectedRequirement.social_media_links} />
                  </DetailField>
                )}

                {selectedRequirement.location && (
                  <DetailField label="Location">
                    {selectedRequirement.location}
                  </DetailField>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog (one dialog for the whole page) */}
      <Dialog
        open={!!requirementToDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setRequirementToDelete(null);
        }}
      >
        <DialogContent className="bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>Delete Demo Requirement</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the requirement for{" "}
              {requirementToDelete?.business_name}? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setRequirementToDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRequirement}
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
