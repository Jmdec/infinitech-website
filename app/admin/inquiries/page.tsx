"use client";
// app/admin/inquiries/page.tsx

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  Mail,
  Clock,
  CheckCircle2,
  BarChart3,
  MessageSquare,
  Filter,
  Search,
  Calendar,
  Trash2,
  Phone,
  Loader,
} from "lucide-react";

interface Inquiry {
  id: number;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: string;
  created_at: string;
}

const ITEMS_PER_PAGE = 10;

const getStatusBadgeColor = (status: string) => {
  const colors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
    replied: "bg-blue-500/10 text-blue-700 border-blue-200",
    resolved: "bg-green-500/10 text-green-700 border-green-200",
  };
  return colors[status] || colors.pending;
};

function StatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={`w-32 border-2 bg-white text-slate-900 ${getStatusBadgeColor(value)}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[200] bg-white border-2 shadow-xl text-slate-900 border-slate-200">
        <SelectItem value="pending">Pending</SelectItem>
        <SelectItem value="replied">Replied</SelectItem>
        <SelectItem value="resolved">Resolved</SelectItem>
      </SelectContent>
    </Select>
  );
}

export default function AdminInquiriesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [inquiryToDelete, setInquiryToDelete] = useState<Inquiry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    const token = localStorage.getItem("adminSessionActive");
    if (!token) {
      router.push("/admin/login");
      return;
    }

    fetchInquiries(token);
  }, [router]);

  const fetchInquiries = async (token: string) => {
    try {
      const response = await fetch("/api/inquiries", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch inquiries");
      }

      const data = await response.json();

      let inquiriesData: Inquiry[] = [];
      if (data.success && data.data) {
        if (data.data.data && Array.isArray(data.data.data)) {
          inquiriesData = data.data.data;
        } else if (Array.isArray(data.data)) {
          inquiriesData = data.data;
        }
      } else if (Array.isArray(data)) {
        inquiriesData = data;
      }

      setInquiries(inquiriesData);
    } catch (error) {
      console.error("Error fetching inquiries:", error);
      setMessage("Failed to load inquiries");
      setInquiries([]);
    } finally {
      setLoading(false);
    }
  };

  const openReply = (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setReplyMessage("");
    setNewStatus(inquiry.status);
  };

  const closeReply = () => {
    if (sending) return;
    setSelectedInquiry(null);
    setReplyMessage("");
    setNewStatus("");
  };

  const handleReply = async () => {
    if (!selectedInquiry) return;

    if (!replyMessage.trim()) {
      toast({
        title: "Error",
        description: "Please enter a reply message.",
        variant: "destructive",
      });
      return;
    }

    const token = localStorage.getItem("adminSessionActive");
    if (!token) return;

    setSending(true);
    try {
      const response = await fetch("/api/inquiries/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          email: selectedInquiry.email,
          name: selectedInquiry.name,
          message: replyMessage,
          status: newStatus || selectedInquiry.status,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to send reply");
      }

      toast({
        title: "Success",
        description: `Reply sent to ${selectedInquiry.name}!`,
        variant: "default",
      });

      setSelectedInquiry(null);
      setReplyMessage("");
      setNewStatus("");
      fetchInquiries(token);
    } catch (error) {
      console.error("Error sending reply:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to send reply",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (inquiryId: number, status: string) => {
    const token = localStorage.getItem("adminSessionActive");
    if (!token) return;

    try {
      const response = await fetch(`/api/inquiries/${inquiryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      setInquiries((prev) =>
        prev.map((i) => (i.id === inquiryId ? { ...i, status } : i)),
      );
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update status. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteInquiry = async () => {
    if (!inquiryToDelete) return;

    const token = localStorage.getItem("adminSessionActive");
    if (!token) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/inquiries/${inquiryToDelete.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to delete inquiry");
      }

      toast({
        title: "Success",
        description: `Inquiry from ${inquiryToDelete.name} deleted successfully!`,
        variant: "default",
      });

      setInquiries((prev) => prev.filter((i) => i.id !== inquiryToDelete.id));
      setInquiryToDelete(null);
    } catch (error) {
      console.error("Error deleting inquiry:", error);
      toast({
        title: "Error",
        description: "Failed to delete inquiry. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const query = searchQuery.toLowerCase();

  const filteredInquiries = inquiries
    .filter((inquiry) => {
      const matchesSearch =
        inquiry.name?.toLowerCase().includes(query) ||
        inquiry.email?.toLowerCase().includes(query) ||
        inquiry.message?.toLowerCase().includes(query);

      const matchesStatus =
        filterStatus === "all" || inquiry.status === filterStatus;

      return matchesSearch && matchesStatus;
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  const stats = {
    total: inquiries.length,
    pending: inquiries.filter((i) => i.status === "pending").length,
    replied: inquiries.filter((i) => i.status === "replied").length,
    resolved: inquiries.filter((i) => i.status === "resolved").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading inquiries...</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(filteredInquiries.length / ITEMS_PER_PAGE);
  // Stay on a valid page after a delete or filter shrinks the list.
  const page = Math.min(currentPage, Math.max(totalPages, 1));
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedInquiries = filteredInquiries.slice(startIndex, endIndex);

  const statCards = [
    {
      label: "Total Inquiries",
      value: stats.total,
      icon: BarChart3,
      border: "border-slate-200",
      valueColor: "text-slate-900",
      iconBg: "from-blue-500 to-purple-500",
    },
    {
      label: "Pending",
      value: stats.pending,
      icon: Clock,
      border: "border-yellow-200",
      valueColor: "text-yellow-600",
      iconBg: "from-yellow-500 to-yellow-600",
    },
    {
      label: "Replied",
      value: stats.replied,
      icon: Mail,
      border: "border-blue-200",
      valueColor: "text-blue-600",
      iconBg: "from-blue-500 to-blue-600",
    },
    {
      label: "Resolved",
      value: stats.resolved,
      icon: CheckCircle2,
      border: "border-green-200",
      valueColor: "text-green-600",
      iconBg: "from-green-500 to-green-600",
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
                <MessageSquare className="h-8 w-8 sm:h-10 sm:w-10" />
                Inquiries
              </h1>
              <p className="text-blue-100">
                Manage and respond to customer inquiries
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

        {/* Inquiries table */}
        <Card className="border-2 border-slate-200 shadow-xl bg-white overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-blue-50/30 px-4 sm:px-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl sm:text-2xl flex items-center gap-2 text-slate-900">
                  <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  All Inquiries
                </CardTitle>
                <CardDescription className="mt-1 text-slate-600">
                  {filteredInquiries.length === 0
                    ? "Showing 0 of 0"
                    : `Showing ${startIndex + 1}-${Math.min(
                        endIndex,
                        filteredInquiries.length,
                      )} of ${filteredInquiries.length}`}
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 sm:min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Search inquiries..."
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="replied">Replied</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
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
                    <TableHead className="font-semibold text-slate-700 hidden md:table-cell px-4 py-3">
                      Email
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden lg:table-cell px-4 py-3">
                      Phone
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 px-4 py-3">
                      Message
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 px-4 py-3">
                      Status
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
                  {paginatedInquiries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 px-4">
                        <div className="flex flex-col items-center gap-2">
                          <MessageSquare className="h-12 w-12 text-slate-300" />
                          <p className="text-slate-600 font-medium">
                            No inquiries found
                          </p>
                          <p className="text-sm text-slate-500">
                            Try adjusting your search or filters
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedInquiries.map((inquiry) => (
                      <TableRow
                        key={inquiry.id}
                        className="hover:bg-blue-50/50 transition-colors"
                      >
                        <TableCell className="font-medium text-slate-900 px-4 sm:px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                              {inquiry.name?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                            <span className="truncate max-w-[180px]">
                              {inquiry.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell px-4 py-3">
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <Mail className="h-4 w-4 text-slate-500 flex-shrink-0" />
                            <span className="truncate max-w-[200px]">
                              {inquiry.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell px-4 py-3">
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <Phone className="h-4 w-4 text-slate-500 flex-shrink-0" />
                            <span>{inquiry.phone || "N/A"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 max-w-xs">
                          <p className="truncate text-sm text-slate-700">
                            {inquiry.message}
                          </p>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <StatusSelect
                            value={inquiry.status}
                            onChange={(value) =>
                              handleStatusChange(inquiry.id, value)
                            }
                          />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell px-4 py-3">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Calendar className="h-4 w-4" />
                            {new Date(inquiry.created_at).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 sm:px-6 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReply(inquiry)}
                              className="border-2 border-blue-200 text-slate-800 hover:bg-blue-50 hover:text-blue-700"
                            >
                              Reply
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setInquiryToDelete(inquiry)}
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

      {/* Reply dialog (one dialog for the whole page) */}
      <Dialog
        open={!!selectedInquiry}
        onOpenChange={(open) => {
          if (!open) closeReply();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-2 bg-white text-slate-900">
          {selectedInquiry && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl sm:text-2xl flex items-center gap-2">
                  <Mail className="h-6 w-6 text-blue-600" />
                  Reply to Inquiry
                </DialogTitle>
                <DialogDescription>
                  Send a response to {selectedInquiry.name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 p-6 rounded-xl border-2">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-medium flex-shrink-0">
                      {selectedInquiry.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg">
                        {selectedInquiry.name}
                      </h3>
                      <p className="text-sm text-slate-500 break-all">
                        {selectedInquiry.email}
                      </p>
                      {selectedInquiry.phone && (
                        <p className="text-sm text-slate-500">
                          {selectedInquiry.phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {selectedInquiry.message}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Update Status
                  </label>
                  <StatusSelect
                    value={newStatus || selectedInquiry.status}
                    onChange={setNewStatus}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="reply"
                    className="text-sm font-semibold flex items-center gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    Reply Message
                  </label>
                  <Textarea
                    id="reply"
                    placeholder="Type your reply here..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    className="min-h-32 border-2 bg-white text-slate-900 placeholder:text-slate-400 border-slate-200"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={closeReply}
                    disabled={sending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleReply}
                    disabled={sending || !replyMessage.trim()}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold"
                  >
                    {sending ? (
                      <>
                        <Loader className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Send Reply
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog (one dialog for the whole page) */}
      <Dialog
        open={!!inquiryToDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setInquiryToDelete(null);
        }}
      >
        <DialogContent className="bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>Delete Inquiry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the inquiry from{" "}
              {inquiryToDelete?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setInquiryToDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteInquiry}
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
