"use client";
// components/admin/RequestsAdminPage.tsx
//
// Shared admin page for "request" style submissions (graphic design, social
// media, paid ads, market research, TikTok shop). Each page under app/admin/*
// only passes a config, so the table logic lives in one place.
//
// Two tracking modes:
//   - default:        simple New / Read tracking via the `is_read` column
//   - config.status:  a multi-step status workflow (e.g. pending → contacted →
//                     approved → rejected) via a status column of your choice

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Filter,
  Inbox,
  Loader,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Send,
  Trash2,
  User,
} from "lucide-react";
import jsPDF from "jspdf";

/* ── types ── */

export interface BaseRequest {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  /** Only used when the page has no `status` config. */
  is_read?: boolean;
  created_at: string;
  [key: string]: unknown;
}

export interface FieldConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  /** "list" = comma separated text shown as "a, b, c". */
  kind?: "text" | "list";
}

export interface StatusOption {
  value: string;
  label: string;
  /** Tailwind classes for the badge, e.g. "bg-orange-500 hover:bg-orange-600". */
  badgeClass: string;
}

export interface StatusConfig {
  /** Column on the record that holds the status, e.g. "status". */
  key: string;
  options: StatusOption[];
  /** Optional: when a request in `from` is opened, move it to `to`. */
  onView?: { from: string; to: string };
}

export interface RequestsPageConfig {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** List / PATCH / DELETE endpoint, e.g. "/api/paid-ads-requests". */
  apiPath: string;
  /** POST endpoint that sends the email. */
  emailApiPath: string;
  /** Singular noun used in toasts, e.g. "request". */
  entity: string;
  /** Key of the business / company column. */
  orgKey: string;
  orgLabel: "Business" | "Company";
  /** Extra columns, view rows and PDF rows. */
  fields: FieldConfig[];
  /** Label for the free-text `details` column. */
  detailsLabel: string;
  searchKeys: string[];
  searchPlaceholder: string;
  showPhoneColumn?: boolean;
  /** Omit to use the simple New / Read (`is_read`) tracking. */
  status?: StatusConfig;
  pdf: {
    title: string;
    footer: string;
    section: string;
    filePrefix: string;
  };
  email: {
    subjectPrefix: string;
    build: (request: BaseRequest) => string;
  };
}

const ITEMS_PER_PAGE = 10;

// Card colours for the per-status stat cards (cycled by option index).
const STATUS_CARD_STYLES = [
  {
    border: "border-orange-200",
    valueColor: "text-orange-600",
    iconBg: "from-orange-500 to-orange-600",
  },
  {
    border: "border-blue-200",
    valueColor: "text-blue-600",
    iconBg: "from-blue-500 to-blue-600",
  },
  {
    border: "border-emerald-200",
    valueColor: "text-emerald-600",
    iconBg: "from-emerald-500 to-emerald-600",
  },
  {
    border: "border-red-200",
    valueColor: "text-red-600",
    iconBg: "from-red-500 to-red-600",
  },
];

const text = (request: BaseRequest, key: string): string => {
  const value = request[key];
  return typeof value === "string" ? value : "";
};

const display = (request: BaseRequest, field: FieldConfig): string => {
  const value = text(request, field.key);
  if (!value) return "";
  if (field.kind === "list")
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");
  return value;
};

const authHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

export default function RequestsAdminPage({
  config,
}: {
  config: RequestsPageConfig;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const HeaderIcon = config.icon;

  const [requests, setRequests] = useState<BaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<BaseRequest | null>(
    null,
  );
  const [requestToDelete, setRequestToDelete] = useState<BaseRequest | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailRequest, setEmailRequest] = useState<BaseRequest | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("adminSessionActive");
    if (!token) {
      router.push("/admin/login");
      return;
    }

    fetchRequests(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchRequests = async (token: string) => {
    try {
      const response = await fetch(config.apiPath, {
        headers: authHeaders(token),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch requests: ${response.status}`);
      }

      const data = await response.json();

      let requestsData: BaseRequest[] = [];
      if (Array.isArray(data)) {
        requestsData = data;
      } else if (data.data) {
        if (Array.isArray(data.data)) {
          requestsData = data.data;
        } else if (data.data.data && Array.isArray(data.data.data)) {
          requestsData = data.data.data;
        }
      }

      setRequests(requestsData);
    } catch (error) {
      console.error("Error fetching requests:", error);
      setMessage(
        `Failed to load requests: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  /** PATCH a request and mirror the change in local state. */
  const patchRequest = async (
    request: BaseRequest,
    patch: Record<string, unknown>,
  ): Promise<boolean> => {
    const token = localStorage.getItem("adminSessionActive");
    if (!token) return false;

    try {
      const response = await fetch(`${config.apiPath}/${request.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify(patch),
      });

      if (!response.ok) throw new Error("Failed to update request");

      setRequests((prev) =>
        prev.map((r) =>
          r.id === request.id ? ({ ...r, ...patch } as BaseRequest) : r,
        ),
      );
      return true;
    } catch (error) {
      console.error("Error updating request:", error);
      return false;
    }
  };

  const markAsRead = (request: BaseRequest) =>
    patchRequest(request, { is_read: true });

  const updateStatus = async (request: BaseRequest, value: string) => {
    if (!config.status) return;
    setUpdatingStatusId(request.id);
    const ok = await patchRequest(request, { [config.status.key]: value });
    if (!ok) {
      toast({
        title: "Error",
        description: "Failed to update status.",
        variant: "destructive",
      });
    }
    setUpdatingStatusId(null);
  };

  const openView = (request: BaseRequest) => {
    setSelectedRequest(request);

    const status = config.status;
    if (status) {
      if (status.onView && text(request, status.key) === status.onView.from) {
        updateStatus(request, status.onView.to);
      }
    } else if (!request.is_read) {
      markAsRead(request);
    }
  };

  const handleDeleteRequest = async () => {
    if (!requestToDelete) return;

    const token = localStorage.getItem("adminSessionActive");
    if (!token) return;

    setDeleting(true);
    try {
      const response = await fetch(`${config.apiPath}/${requestToDelete.id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });

      if (!response.ok) throw new Error("Failed to delete request");

      toast({
        title: "Success",
        description: `The ${config.entity} from ${requestToDelete.name} was deleted successfully!`,
        variant: "default",
      });

      setRequests((prev) => prev.filter((r) => r.id !== requestToDelete.id));
      setRequestToDelete(null);
    } catch (error) {
      console.error("Error deleting request:", error);
      toast({
        title: "Error",
        description: `Failed to delete the ${config.entity}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const generatePDF = async (request: BaseRequest) => {
    setDownloadingId(request.id);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const tableWidth = pageWidth - margin * 2;
      const labelWidth = 50;
      const valueWidth = tableWidth - labelWidth;
      let y = 20;

      const colors = {
        primaryDark: [15, 23, 42] as [number, number, number],
        white: [255, 255, 255] as [number, number, number],
        lightGray: [248, 250, 252] as [number, number, number],
        borderGray: [226, 232, 240] as [number, number, number],
        textDark: [30, 41, 59] as [number, number, number],
        textMuted: [71, 85, 105] as [number, number, number],
      };

      const addHeader = () => {
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, 45, "F");

        doc.setTextColor(...colors.primaryDark);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(config.pdf.title, pageWidth / 2, 15, { align: "center" });

        doc.setTextColor(...colors.textMuted);
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text("Client Submission Details", pageWidth / 2, 25, {
          align: "center",
        });

        doc.setFontSize(8);
        doc.text(`Request ID: ${request.id}`, pageWidth / 2, 32, {
          align: "center",
        });
        doc.text(
          `Date: ${new Date(request.created_at).toLocaleDateString()}`,
          pageWidth / 2,
          38,
          { align: "center" },
        );
      };

      const addFooter = (pageNum: number, totalPages: number) => {
        doc.setFillColor(255, 255, 255);
        doc.rect(0, pageHeight - 18, pageWidth, 18, "F");

        doc.setDrawColor(...colors.borderGray);
        doc.line(margin, pageHeight - 18, pageWidth - margin, pageHeight - 18);

        doc.setTextColor(...colors.textDark);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(config.pdf.footer, pageWidth / 2, pageHeight - 12, {
          align: "center",
        });

        doc.setTextColor(...colors.textMuted);
        doc.setFontSize(7);
        doc.text(
          `Page ${pageNum} of ${totalPages}`,
          pageWidth - margin,
          pageHeight - 6,
          { align: "right" },
        );
      };

      const checkPageBreak = (height: number) => {
        if (y + height > pageHeight - 25) {
          doc.addPage();
          y = 15;
        }
      };

      const addSectionHeader = (title: string) => {
        checkPageBreak(8);
        doc.setFillColor(...colors.primaryDark);
        doc.rect(margin, y, tableWidth, 7, "F");
        doc.setDrawColor(...colors.borderGray);
        doc.rect(margin, y, tableWidth, 7, "S");
        doc.setTextColor(...colors.white);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(title, margin + 3, y + 5);
        y += 7;
      };

      const addTableRow = (label: string, value: string, isAlt = false) => {
        checkPageBreak(7);
        const rowHeight = 7;
        const bgColor = isAlt ? colors.lightGray : colors.white;

        doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
        doc.rect(margin, y, tableWidth, rowHeight, "F");
        doc.setDrawColor(...colors.borderGray);
        doc.rect(margin, y, labelWidth, rowHeight, "S");
        doc.rect(margin + labelWidth, y, valueWidth, rowHeight, "S");

        doc.setTextColor(...colors.textMuted);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(label, margin + 2, y + 5);

        doc.setTextColor(...colors.textDark);
        doc.setFont("helvetica", "normal");
        const truncatedValue =
          value && value.length > 80
            ? value.substring(0, 77) + "..."
            : value || "N/A";
        doc.text(truncatedValue, margin + labelWidth + 2, y + 5);

        y += rowHeight;
      };

      const addMultilineRow = (label: string, value: string, isAlt = false) => {
        if (!value) return;
        doc.setFontSize(8);
        const lines = doc.splitTextToSize(value, valueWidth - 4);
        const rowHeight = Math.max(7, lines.length * 4 + 3);

        checkPageBreak(rowHeight);
        const bgColor = isAlt ? colors.lightGray : colors.white;

        doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
        doc.rect(margin, y, tableWidth, rowHeight, "F");
        doc.setDrawColor(...colors.borderGray);
        doc.rect(margin, y, labelWidth, rowHeight, "S");
        doc.rect(margin + labelWidth, y, valueWidth, rowHeight, "S");

        doc.setTextColor(...colors.textMuted);
        doc.setFont("helvetica", "bold");
        doc.text(label, margin + 2, y + 5);

        doc.setTextColor(...colors.textDark);
        doc.setFont("helvetica", "normal");
        for (let i = 0; i < lines.length; i++) {
          doc.text(lines[i], margin + labelWidth + 2, y + 5 + i * 4);
        }

        y += rowHeight;
      };

      addHeader();
      y = 48;

      addSectionHeader("CONTACT INFORMATION");
      const contactRows: [string, string][] = [
        ["Full Name", request.name],
        ["Email", request.email],
        ["Phone", request.phone || "N/A"],
        [
          config.orgLabel === "Business" ? "Business Name" : config.orgLabel,
          text(request, config.orgKey) || "N/A",
        ],
      ];
      contactRows.forEach(([label, value], i) =>
        addTableRow(label, value, i % 2 === 1),
      );

      addSectionHeader(config.pdf.section);
      config.fields.forEach((field, i) =>
        addTableRow(field.label, display(request, field) || "N/A", i % 2 === 1),
      );
      addMultilineRow(
        config.detailsLabel,
        text(request, "details") || "N/A",
        config.fields.length % 2 === 1,
      );

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        addFooter(i, pageCount);
      }

      doc.save(
        `${config.pdf.filePrefix}-${request.id}-${request.name
          .replace(/\s+/g, "-")
          .toLowerCase()}.pdf`,
      );

      toast({
        title: "Success",
        description: "PDF downloaded successfully!",
        variant: "default",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error",
        description: "Error generating PDF.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const openEmailDialog = (request: BaseRequest) => {
    setEmailRequest(request);
    setEmailSubject(
      `${config.email.subjectPrefix} - ${text(request, config.orgKey) || request.name}`,
    );
    setEmailMessage(config.email.build(request));
    setEmailDialogOpen(true);
  };

  const sendRequestEmail = async () => {
    if (!emailRequest?.email) {
      toast({
        title: "Error",
        description: `This ${config.entity} has no email address!`,
        variant: "destructive",
      });
      return;
    }

    const token = localStorage.getItem("adminSessionActive");
    if (!token) return;

    setSendingEmailId(emailRequest.id);
    try {
      const response = await fetch(config.emailApiPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify({
          to: emailRequest.email,
          subject: emailSubject,
          message: emailMessage,
          requestId: emailRequest.id,
          requestData: emailRequest,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send email");
      }

      toast({
        title: "Success",
        description: `Email sent to ${emailRequest.name}!`,
        variant: "default",
      });
      setEmailDialogOpen(false);
      setEmailRequest(null);
      setEmailSubject("");
      setEmailMessage("");
    } catch (error) {
      console.error("Error sending email:", error);
      toast({
        title: "Error",
        description: "Failed to send email. Check SMTP configuration.",
        variant: "destructive",
      });
    } finally {
      setSendingEmailId(null);
    }
  };

  const query = searchQuery.toLowerCase();
  const statusConfig = config.status;

  const filteredRequests = requests.filter((request) => {
    const matchesSearch = config.searchKeys.some((key) =>
      text(request, key).toLowerCase().includes(query),
    );

    let matchesStatus = true;
    if (filterStatus !== "all") {
      matchesStatus = statusConfig
        ? text(request, statusConfig.key) === filterStatus
        : (filterStatus === "new" && !request.is_read) ||
          (filterStatus === "read" && !!request.is_read);
    }

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading requests...</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE);
  // Stay on a valid page after a delete or filter shrinks the list.
  const page = Math.min(currentPage, Math.max(totalPages, 1));
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRequests = filteredRequests.slice(startIndex, endIndex);

  const readCount = requests.filter((r) => r.is_read).length;

  const totalCard = {
    label: "Total Requests",
    value: requests.length,
    icon: BarChart3,
    border: "border-slate-200",
    valueColor: "text-slate-900",
    iconBg: "from-blue-500 to-purple-500",
  };

  const statCards = statusConfig
    ? [
        totalCard,
        ...statusConfig.options.map((option, i) => ({
          label: option.label,
          value: requests.filter(
            (r) => text(r, statusConfig.key) === option.value,
          ).length,
          icon: Inbox,
          ...STATUS_CARD_STYLES[i % STATUS_CARD_STYLES.length],
        })),
      ]
    : [
        totalCard,
        {
          label: "New",
          value: requests.length - readCount,
          icon: Inbox,
          border: "border-blue-200",
          valueColor: "text-blue-600",
          iconBg: "from-blue-500 to-blue-600",
        },
        {
          label: "Read",
          value: readCount,
          icon: CheckCircle2,
          border: "border-purple-200",
          valueColor: "text-purple-600",
          iconBg: "from-purple-500 to-purple-600",
        },
        {
          label: "Read Rate",
          value: `${
            requests.length > 0
              ? Math.round((readCount / requests.length) * 100)
              : 0
          }%`,
          icon: BarChart3,
          border: "border-green-200",
          valueColor: "text-green-600",
          iconBg: "from-green-500 to-green-600",
        },
      ];

  const gridCols = statCards.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";

  // Name, Status, Org, Email, [Phone], fields…, Submitted, Actions
  const columnCount =
    6 + config.fields.length + (config.showPhoneColumn ? 1 : 0);

  const filterOptions = statusConfig
    ? statusConfig.options.map((o) => ({ value: o.value, label: o.label }))
    : [
        { value: "new", label: "New" },
        { value: "read", label: "Read" },
      ];

  const renderStatusCell = (request: BaseRequest) => {
    if (!statusConfig) {
      return request.is_read ? (
        <Badge variant="secondary">Read</Badge>
      ) : (
        <Badge className="bg-blue-600 hover:bg-blue-700">New</Badge>
      );
    }

    const current = text(request, statusConfig.key);
    const option = statusConfig.options.find((o) => o.value === current);
    const updating = updatingStatusId === request.id;

    return (
      <Select
        value={current}
        onValueChange={(value) => updateStatus(request, value)}
        disabled={updating}
      >
        <SelectTrigger className="h-7 w-[110px] border-0 p-0 focus:ring-0 [&>svg]:hidden">
          <Badge className={option?.badgeClass}>
            {updating ? (
              <Loader className="h-3 w-3 animate-spin" />
            ) : (
              (option?.label ?? (current || "Unknown"))
            )}
          </Badge>
        </SelectTrigger>
        <SelectContent className="z-[100] bg-white border-2 shadow-xl">
          {statusConfig.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* Header banner */}
      <div className="w-full px-1 sm:px-2 pt-4">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl shadow-lg px-6 sm:px-8 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <HeaderIcon className="h-8 w-8 sm:h-10 sm:w-10" />
                {config.title}
              </h1>
              <p className="text-blue-100">{config.subtitle}</p>
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

      <div className="w-full px-1 sm:px-2 py-6">
        {/* Stats cards */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${gridCols} gap-4 sm:gap-6 mb-8`}
        >
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
          <Alert className="mb-6 border-2" variant="destructive">
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
                  <HeaderIcon className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  Request Submissions
                </CardTitle>
                <CardDescription className="mt-1 text-slate-600">
                  {filteredRequests.length === 0
                    ? "Showing 0 of 0"
                    : `Showing ${startIndex + 1}-${Math.min(
                        endIndex,
                        filteredRequests.length,
                      )} of ${filteredRequests.length}`}
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 sm:min-w-[260px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder={config.searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-9 border-2 bg-white"
                  />
                </div>
                <Select
                  value={filterStatus}
                  onValueChange={(value) => {
                    setFilterStatus(value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[200px] border-2 bg-white">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100] bg-white border-2 shadow-xl">
                    <SelectItem value="all">All Status</SelectItem>
                    {filterOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="font-semibold text-slate-700 px-4 sm:px-6 py-3">
                      Name
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 px-4 py-3">
                      Status
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden md:table-cell px-4 py-3">
                      {config.orgLabel}
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden lg:table-cell px-4 py-3">
                      Email
                    </TableHead>
                    {config.showPhoneColumn && (
                      <TableHead className="font-semibold text-slate-700 hidden xl:table-cell px-4 py-3">
                        Phone
                      </TableHead>
                    )}
                    {config.fields.map((field) => (
                      <TableHead
                        key={field.key}
                        className="font-semibold text-slate-700 hidden xl:table-cell px-4 py-3"
                      >
                        {field.label}
                      </TableHead>
                    ))}
                    <TableHead className="font-semibold text-slate-700 hidden sm:table-cell px-4 py-3">
                      Submitted
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 px-4 sm:px-6 py-3">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRequests.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columnCount}
                        className="text-center py-12 px-4"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Inbox className="h-12 w-12 text-slate-300" />
                          <p className="text-slate-600 font-medium">
                            No requests found
                          </p>
                          <p className="text-sm text-slate-500">
                            Try adjusting your search or filters
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRequests.map((request) => (
                      <TableRow
                        key={request.id}
                        className="hover:bg-blue-50/50 transition-colors"
                      >
                        <TableCell className="font-medium text-slate-900 px-4 sm:px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                              {request.name?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                            <span className="truncate max-w-[180px]">
                              {request.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {renderStatusCell(request)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell px-4 py-3 text-sm text-slate-700">
                          {text(request, config.orgKey) || "N/A"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell px-4 py-3 text-sm text-blue-600">
                          {request.email}
                        </TableCell>
                        {config.showPhoneColumn && (
                          <TableCell className="hidden xl:table-cell px-4 py-3 text-sm text-slate-700">
                            {request.phone || "N/A"}
                          </TableCell>
                        )}
                        {config.fields.map((field) => (
                          <TableCell
                            key={field.key}
                            className="hidden xl:table-cell px-4 py-3 text-sm text-slate-700 max-w-[180px] truncate"
                          >
                            {display(request, field) || "N/A"}
                          </TableCell>
                        ))}
                        <TableCell className="hidden sm:table-cell px-4 py-3 text-sm text-slate-600">
                          {new Date(request.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4 sm:px-6 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openView(request)}
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
                              onClick={() => generatePDF(request)}
                              disabled={downloadingId === request.id}
                              className="border-2 border-green-200 text-slate-800 hover:bg-green-50 hover:text-green-700"
                            >
                              {downloadingId === request.id ? (
                                <Loader className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                              <span className="hidden sm:inline ml-1">PDF</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEmailDialog(request)}
                              disabled={
                                sendingEmailId === request.id || !request.email
                              }
                              className="border-2 border-blue-200 text-slate-800 hover:bg-blue-50 hover:text-blue-700"
                            >
                              {sendingEmailId === request.id ? (
                                <Loader className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                              <span className="hidden sm:inline ml-1">
                                Email
                              </span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRequestToDelete(request)}
                              className="border-2 border-red-200 text-slate-800 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
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
        open={!!selectedRequest}
        onOpenChange={(open) => {
          if (!open) setSelectedRequest(null);
        }}
      >
        <DialogContent className="max-w-[92vw] sm:max-w-md max-h-[85vh] overflow-y-auto border-2 bg-white text-slate-900 p-0 gap-0">
          {selectedRequest && (
            <div className="space-y-0">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 pr-12 text-white">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-base font-bold truncate text-white">
                      {selectedRequest.name}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-white/80 truncate">
                      {text(selectedRequest, config.orgKey) || config.title}
                    </DialogDescription>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 space-y-3">
                <div className="space-y-1.5">
                  <h3 className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">
                    Contact
                  </h3>

                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded-md">
                    <a
                      href={`mailto:${selectedRequest.email}`}
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline break-all"
                    >
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      {selectedRequest.email}
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(selectedRequest.email)
                      }
                      className="p-1 hover:bg-slate-200 rounded flex-shrink-0"
                      aria-label="Copy email"
                    >
                      <Copy className="h-3 w-3 text-slate-500" />
                    </button>
                  </div>

                  {selectedRequest.phone && (
                    <div className="flex items-center justify-between p-2 bg-slate-50 rounded-md">
                      <a
                        href={`tel:${selectedRequest.phone}`}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                        {selectedRequest.phone}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard.writeText(
                            selectedRequest.phone ?? "",
                          )
                        }
                        className="p-1 hover:bg-slate-200 rounded flex-shrink-0"
                        aria-label="Copy phone"
                      >
                        <Copy className="h-3 w-3 text-slate-500" />
                      </button>
                    </div>
                  )}

                  {text(selectedRequest, config.orgKey) && (
                    <div className="flex items-center gap-1.5 p-2 bg-slate-50 rounded-md text-xs">
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                      {text(selectedRequest, config.orgKey)}
                    </div>
                  )}

                  {config.fields.map((field) => {
                    const value = display(selectedRequest, field);
                    if (!value) return null;
                    const FieldIcon = field.icon;
                    return (
                      <div
                        key={field.key}
                        className="flex items-start gap-1.5 p-2 bg-slate-50 rounded-md text-xs"
                      >
                        <FieldIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-500 mt-px" />
                        <span className="min-w-0 break-words">
                          <span className="font-medium">{field.label}: </span>
                          {value}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {text(selectedRequest, "details") && (
                  <div className="space-y-1">
                    <h3 className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" />
                      {config.detailsLabel}
                    </h3>
                    <p className="text-xs bg-slate-50 rounded-md p-2 leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap">
                      {text(selectedRequest, "details")}
                    </p>
                  </div>
                )}

                <p className="text-[10px] text-slate-500">
                  Submitted{" "}
                  {new Date(selectedRequest.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog (one dialog for the whole page) */}
      <Dialog
        open={!!requestToDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setRequestToDelete(null);
        }}
      >
        <DialogContent className="bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>Delete Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the {config.entity} from{" "}
              {requestToDelete?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setRequestToDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRequest}
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

      {/* Email dialog */}
      <Dialog
        open={emailDialogOpen}
        onOpenChange={(open) => {
          if (!open && sendingEmailId !== null) return;
          setEmailDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Send Email to {emailRequest?.name || "User"}
            </DialogTitle>
            <DialogDescription>
              Compose your message to {emailRequest?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email-to">To</Label>
              <Input
                id="email-to"
                value={emailRequest?.email || ""}
                disabled
                className="bg-slate-50 text-slate-900 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Enter email subject..."
                className="bg-white text-slate-900 placeholder:text-slate-400 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-message">Message</Label>
              <Textarea
                id="email-message"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Enter your message..."
                rows={10}
                className="resize-none bg-white text-slate-900 placeholder:text-slate-400 border-slate-200"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmailDialogOpen(false)}
              disabled={sendingEmailId !== null}
            >
              Cancel
            </Button>
            <Button
              onClick={sendRequestEmail}
              disabled={
                sendingEmailId !== null || !emailSubject || !emailMessage
              }
              className="bg-blue-600 hover:bg-blue-700"
            >
              {sendingEmailId !== null ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
