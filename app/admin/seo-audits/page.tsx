"use client";


import { useEffect, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Filter,
  Trash2,
  Mail,
  Globe,
  Phone,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  X,
  Send,
  Minimize2,
  Maximize2,
  RefreshCw,
  Inbox,
  Loader,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Reply {
  id: number;
  direction: "outbound";
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  created_at: string;
}

interface SeoAudit {
  id: number;
  full_name: string;
  email: string;
  mobile: string;
  website_url: string;
  status: string;
  notes: string | null;
  replies: Reply[];
  created_at: string;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {};

// ─── Gmail Compose Modal ─────────────────────────────────────────────────────
interface ComposeProps {
  audit: SeoAudit;
  onClose: () => void;
  onSent: (updatedAudit: SeoAudit) => void;
}

function GmailCompose({ audit, onClose, onSent }: ComposeProps) {
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState(
    `Re: SEO Audit — ${audit.website_url}`,
  );
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!minimized) textareaRef.current?.focus();
  }, [minimized]);

  const handleSend = async () => {
    if (!body.trim()) {
      setError("Message body cannot be empty.");
      return;
    }
    const token = localStorage.getItem("adminSessionActive");
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/seo-audit/${audit.id}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify({
          reply_body: body,
          subject,
          full_name: audit.full_name,
          email: audit.email,
          website_url: audit.website_url,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success)
        throw new Error(data.message || "Failed to send");

      // Optimistically append the reply
      const newReply: Reply = {
        id: data.data?.id ?? Date.now(),
        direction: "outbound",
        from_email: data.data?.from_email ?? "admin",
        to_email: audit.email,
        subject,
        body,
        created_at: new Date().toISOString(),
      };
      onSent({
        ...audit,
        status: "replied",
        replies: [...(audit.replies ?? []), newReply],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  };

  // Minimized pill
  if (minimized) {
    return (
      <div
        className="fixed bottom-0 right-6 z-50 w-64 rounded-t-xl overflow-hidden shadow-2xl cursor-pointer"
        style={{ background: "#1a306e" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          onClick={() => setMinimized(false)}
        >
          <span className="text-white text-sm font-semibold truncate">
            New Message — {audit.full_name}
          </span>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="text-white/70 hover:text-white"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-white/70 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed z-50 shadow-2xl rounded-t-xl overflow-hidden flex flex-col",
        maximized ? "inset-4 rounded-xl" : "bottom-0 right-6 w-[520px]",
      )}
      style={{ maxHeight: maximized ? "calc(100vh - 32px)" : "520px" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 flex-shrink-0 select-none"
        style={{ background: "#1a306e" }}
      >
        <span className="text-white text-sm font-semibold">New Message</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="text-white/70 hover:text-white transition-colors"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMaximized((m) => !m)}
            className="text-white/70 hover:text-white transition-colors"
          >
            {maximized ? (
              <Minimize2 className="w-3.5 h-3.5 rotate-45" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="bg-white flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
          <span className="text-xs text-slate-400 w-12 flex-shrink-0">To</span>
          <span className="text-sm text-slate-700">{audit.email}</span>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
          <span className="text-xs text-slate-400 w-12 flex-shrink-0">
            Subject
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 text-sm text-slate-700 outline-none bg-transparent"
          />
        </div>

        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Hi ${audit.full_name},\n\n`}
          className="flex-1 px-4 py-3 text-sm text-slate-700 bg-white resize-none outline-none min-h-[200px]"
          style={{ fontFamily: "inherit" }}
        />

        {error && <p className="text-red-500 text-xs px-4 pb-2">{error}</p>}

        <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 flex-shrink-0">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !body.trim()}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold text-white transition-all",
              sending || !body.trim()
                ? "opacity-50 cursor-not-allowed"
                : "hover:opacity-90 active:scale-95",
            )}
            style={{ background: "linear-gradient(135deg, #0d1b3e, #1a306e)" }}
          >
            {sending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />{" "}
                Sending...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" /> Send
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-slate-400 hover:text-red-500 transition-colors"
            aria-label="Discard draft"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status helpers ──────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-700 border border-amber-200",
  },
  replied: {
    label: "Replied",
    className: "bg-blue-100 text-blue-700 border border-blue-200",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-purple-100 text-purple-700 border border-purple-200",
  },
  completed: {
    label: "Completed",
    className: "bg-green-100 text-green-700 border border-green-200",
  },
};

function StatusSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const sc = statusConfig[value] || statusConfig.pending;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-8 text-xs bg-white text-slate-900 border-slate-200",
          sc.className,
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[200] bg-white text-slate-900 border-slate-200">
        <SelectItem value="pending">Pending</SelectItem>
        <SelectItem value="replied">Replied</SelectItem>
        <SelectItem value="in_progress">In Progress</SelectItem>
        <SelectItem value="completed">Completed</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ─── Thread Drawer ───────────────────────────────────────────────────────────
interface ThreadDrawerProps {
  audit: SeoAudit;
  onClose: () => void;
  onReply: () => void;
  onStatusChange: (id: number, status: string) => void;
}

function ThreadDrawer({
  audit,
  onClose,
  onReply,
  onStatusChange,
}: ThreadDrawerProps) {
  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-xl bg-white text-slate-900 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #0d1b3e 0%, #1a306e 100%)",
          }}
        >
          <div>
            <h2 className="text-white font-bold text-base">
              {audit.full_name}
            </h2>
            <p className="text-white/60 text-xs mt-0.5">{audit.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meta */}
        <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0 space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            <a
              href={audit.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline truncate"
            >
              {audit.website_url}
            </a>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Phone className="w-3.5 h-3.5 text-slate-400" />
            {audit.mobile}
          </div>
          <div className="flex items-center gap-4 mt-3">
            <StatusSelect
              value={audit.status}
              onChange={(v) => onStatusChange(audit.id, v)}
              className="w-36"
            />
            <span className="text-xs text-slate-400">
              {new Date(audit.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* Conversation thread */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-slate-50/60">
          {/* Original inquiry */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, #f5a623, #e8891a)",
                }}
              >
                {audit.full_name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">
                  {audit.full_name}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(audit.created_at).toLocaleString()}
                </p>
              </div>
              <span className="ml-auto text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">
                Inquiry
              </span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Requested a free SEO audit for{" "}
              <a
                href={audit.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 font-medium hover:underline"
              >
                {audit.website_url}
              </a>
            </p>
          </div>

          {/* Reply bubbles */}
          {(audit.replies ?? []).map((reply) => (
            <div
              key={reply.id}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #0d1b3e, #1a306e)",
                  }}
                >
                  A
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    You (Admin)
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(reply.created_at).toLocaleString()}
                  </p>
                </div>
                <span className="ml-auto text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
                  Sent
                </span>
              </div>
              {reply.subject && (
                <p className="text-xs font-semibold text-slate-500 mb-1">
                  {reply.subject}
                </p>
              )}
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {reply.body}
              </p>
            </div>
          ))}

          {(audit.replies ?? []).length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">
                No replies yet. Click Reply to start the conversation.
              </p>
            </div>
          )}
        </div>

        {/* Reply button bar */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-white">
          <button
            type="button"
            onClick={onReply}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white w-full justify-center transition-all hover:opacity-90 active:scale-95"
            style={{ background: "linear-gradient(135deg, #0d1b3e, #1a306e)" }}
          >
            <Mail className="w-4 h-4" />
            Reply to {audit.full_name}
          </button>
        </div>
      </div>
    </div>
  );
}

const ITEMS_PER_PAGE = 12;

// ─── Main Admin Page ─────────────────────────────────────────────────────────
export default function AdminSeoAuditPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [audits, setAudits] = useState<SeoAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [message, setMessage] = useState("");

  // Thread drawer
  const [selectedAudit, setSelectedAudit] = useState<SeoAudit | null>(null);
  // Gmail compose
  const [composeAudit, setComposeAudit] = useState<SeoAudit | null>(null);
  // Delete confirmation
  const [auditToDelete, setAuditToDelete] = useState<SeoAudit | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("adminSessionActive");
    if (!token) {
      router.push("/admin/login");
      return;
    }

    fetchAudits(token);
  }, [router]);

  const fetchAudits = async (token: string) => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/seo-audit", {
        headers: authHeaders(token),
      });

      if (!res.ok) {
        throw new Error("Failed to fetch SEO audits");
      }

      const data = await res.json();

      let auditsData: SeoAudit[] = [];
      if (data.success && data.data) {
        if (data.data.data && Array.isArray(data.data.data)) {
          auditsData = data.data.data;
        } else if (Array.isArray(data.data)) {
          auditsData = data.data;
        }
      }

      setMessage("");
      setAudits(auditsData);
    } catch (error) {
      console.error("Error fetching audits:", error);
      setMessage("Failed to load SEO audits");
      setAudits([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    const token = localStorage.getItem("adminSessionActive");
    if (!token) {
      router.push("/admin/login");
      return;
    }
    fetchAudits(token);
  };

  const handleStatusChange = async (id: number, status: string) => {
    const token = localStorage.getItem("adminSessionActive");
    if (!token) return;

    try {
      const res = await fetch(`/api/seo-audit/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");

      setAudits((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a)),
      );
      setSelectedAudit((prev) =>
        prev && prev.id === id ? { ...prev, status } : prev,
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

  const handleDeleteAudit = async () => {
    if (!auditToDelete) return;

    const token = localStorage.getItem("adminSessionActive");
    if (!token) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/seo-audit/${auditToDelete.id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (!res.ok) throw new Error("Failed to delete audit request");

      toast({
        title: "Success",
        description: `SEO audit request from ${auditToDelete.full_name} deleted successfully!`,
        variant: "default",
      });

      setAudits((prev) => prev.filter((a) => a.id !== auditToDelete.id));
      setSelectedAudit((prev) => (prev?.id === auditToDelete.id ? null : prev));
      setAuditToDelete(null);
    } catch (error) {
      console.error("Error deleting audit:", error);
      toast({
        title: "Error",
        description: "Failed to delete audit request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleReplySent = (updated: SeoAudit) => {
    setAudits((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setSelectedAudit(updated);
    setComposeAudit(null);
    toast({
      title: "Success",
      description: `Reply sent to ${updated.full_name}!`,
      variant: "default",
    });
  };

  const query = searchQuery.toLowerCase();

  // Filter + search, newest first
  const filteredAudits = audits
    .filter((a) => {
      const matchesSearch =
        a.full_name?.toLowerCase().includes(query) ||
        a.email?.toLowerCase().includes(query) ||
        a.website_url?.toLowerCase().includes(query);

      const matchesStatus = filterStatus === "all" || a.status === filterStatus;

      return matchesSearch && matchesStatus;
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  const stats = {
    total: audits.length,
    pending: audits.filter((a) => a.status === "pending").length,
    replied: audits.filter((a) => a.status === "replied").length,
    completed: audits.filter((a) => a.status === "completed").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading SEO audits...</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(filteredAudits.length / ITEMS_PER_PAGE);
  // Stay on a valid page after a delete or filter shrinks the list.
  const page = Math.min(currentPage, Math.max(totalPages, 1));
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedAudits = filteredAudits.slice(startIndex, endIndex);

  const statCards = [
    {
      label: "Total",
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
      border: "border-amber-200",
      valueColor: "text-amber-600",
      iconBg: "from-amber-500 to-amber-600",
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
      label: "Completed",
      value: stats.completed,
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
                <Search className="h-8 w-8 sm:h-10 sm:w-10" />
                SEO Audit Requests
              </h1>
              <p className="text-blue-100">
                Manage, reply and track all audit inquiries
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-white hover:bg-gray-100 text-blue-900"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
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
          <Alert className="mb-6 border-2" variant="destructive">
            <AlertDescription className="font-medium">
              {message}
            </AlertDescription>
          </Alert>
        )}

        {/* Audits table */}
        <Card className="border-2 border-slate-200 shadow-xl bg-white overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-blue-50/30 px-4 sm:px-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl sm:text-2xl flex items-center gap-2 text-slate-900">
                  <Search className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  All Audit Requests
                </CardTitle>
                <CardDescription className="mt-1 text-slate-600">
                  {filteredAudits.length === 0
                    ? "Showing 0 of 0"
                    : `Showing ${startIndex + 1}-${Math.min(
                        endIndex,
                        filteredAudits.length,
                      )} of ${filteredAudits.length}`}
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 sm:min-w-[260px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Search by name, email, or URL..."
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
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
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
                      Contact
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden md:table-cell px-4 py-3">
                      Website
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden lg:table-cell px-4 py-3">
                      Mobile
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 px-4 py-3">
                      Status
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 hidden sm:table-cell px-4 py-3">
                      Replies
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
                  {paginatedAudits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 px-4">
                        <div className="flex flex-col items-center gap-2">
                          <Inbox className="h-12 w-12 text-slate-300" />
                          <p className="text-slate-600 font-medium">
                            No audit requests found
                          </p>
                          <p className="text-sm text-slate-500">
                            Try adjusting your search or filters
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedAudits.map((audit) => {
                      const replyCount = audit.replies?.length ?? 0;

                      return (
                        <TableRow
                          key={audit.id}
                          className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedAudit(audit)}
                        >
                          <TableCell className="font-medium text-slate-900 px-4 sm:px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                                {audit.full_name?.charAt(0)?.toUpperCase() ||
                                  "?"}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate max-w-[220px]">
                                  {audit.full_name}
                                </p>
                                <p className="text-xs text-slate-500 truncate max-w-[220px] font-normal">
                                  {audit.email}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell px-4 py-3">
                            <a
                              href={audit.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-sm truncate max-w-[200px] block"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {audit.website_url?.replace(/^https?:\/\//, "")}
                            </a>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell px-4 py-3 text-sm text-slate-600">
                            {audit.mobile}
                          </TableCell>
                          <TableCell
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <StatusSelect
                              value={audit.status}
                              onChange={(v) => handleStatusChange(audit.id, v)}
                              className="w-36"
                            />
                          </TableCell>
                          <TableCell className="hidden sm:table-cell px-4 py-3">
                            <span
                              className={cn(
                                "text-xs font-semibold px-2.5 py-1 rounded-full",
                                replyCount > 0
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-slate-100 text-slate-500",
                              )}
                            >
                              {replyCount}{" "}
                              {replyCount === 1 ? "reply" : "replies"}
                            </span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell px-4 py-3 text-sm text-slate-600">
                            {new Date(audit.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell
                            className="px-4 sm:px-6 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setComposeAudit(audit)}
                                className="border-2 border-blue-200 text-slate-800 hover:bg-blue-50 hover:text-blue-700"
                              >
                                <Mail className="h-4 w-4" />
                                <span className="hidden sm:inline ml-1">
                                  Reply
                                </span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAuditToDelete(audit)}
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

      {/* Thread drawer */}
      {selectedAudit && !composeAudit && (
        <ThreadDrawer
          audit={selectedAudit}
          onClose={() => setSelectedAudit(null)}
          onReply={() => setComposeAudit(selectedAudit)}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Gmail compose */}
      {composeAudit && (
        <GmailCompose
          audit={composeAudit}
          onClose={() => setComposeAudit(null)}
          onSent={handleReplySent}
        />
      )}

      {/* Delete confirmation dialog (one dialog for the whole page) */}
      <Dialog
        open={!!auditToDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setAuditToDelete(null);
        }}
      >
        <DialogContent className="bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>Delete Audit Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the audit request from{" "}
              {auditToDelete?.full_name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setAuditToDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAudit}
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
