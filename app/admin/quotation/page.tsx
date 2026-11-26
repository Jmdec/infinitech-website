// app/admin/quotation/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  FileText,
  History as HistoryIcon,
  Loader,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ── Company (fixed letterhead) ── */
const COMPANY = {
  name: "INFINITECH ADVERTISING CORPORATION",
  address: "Unit 311, Campos Rueda Building, Urban Avenue, Makati City",
  phone: "(02)7001-6157",
  website: "www.infinitechphil.com",
};
const LOGO_SRC = "/infinitech-logo.png";

/* ── Types ── */
type Item = {
  id: number;
  product: string; // bold title of the row
  description: string; // lines under the title
  qty: string;
  price: string;
  boxed: boolean; // green-bordered row, no numbers (complimentary, notes, add-ons...)
};
type Status = "Draft" | "Sent" | "Paid" | "Cancelled";
const STATUSES: Status[] = ["Draft", "Sent", "Paid", "Cancelled"];
const STATUS_STYLE: Record<Status, string> = {
  Draft: "bg-slate-50 text-slate-700 ring-slate-500/20",
  Sent: "bg-sky-50 text-sky-800 ring-sky-600/20",
  Paid: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  Cancelled: "bg-red-50 text-red-700 ring-red-600/20",
};

type QuotationRecord = {
  id: number;
  quotation_no: string;
  quotation_date: string;
  valid_until: string | null;
  terms: string | null;
  client_name: string;
  contact_person: string | null;
  email: string | null;
  mobile: string | null;
  address: string | null;
  product_description: string | null;
  items: {
    product?: string;
    description?: string;
    qty?: number | string;
    price?: number | string;
    amount?: number | string; // legacy / computed total
    boxed?: boolean;
  }[];
  discount: number;
  subtotal: number;
  balance_due: number;
  conditions: string | null;
  payment_note: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_no: string | null;
  footer: string | null;
  status: Status;
};

type Form = {
  id: number | null;
  quotationNo: string; // read-only, assigned by the server
  date: string;
  terms: string;
  validUntil: string;
  clientName: string;
  contactPerson: string;
  email: string;
  mobile: string;
  address: string;
  productDescription: string;
  items: Item[];
  discount: string;
  conditions: string;
  paymentNote: string;
  bankName: string;
  accountName: string;
  accountNo: string;
  footer: string;
  status: Status;
};

type HistoryAction = "Created" | "Updated" | "Downloaded" | "Deleted";
type HistoryRecord = {
  id: number;
  quotation_id: number | null;
  quotation_no: string;
  client_name: string;
  action: HistoryAction;
  user_name: string | null;
  created_at: string;
};
const ACTION_STYLE: Record<HistoryAction, string> = {
  Created: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  Updated: "bg-sky-50 text-sky-800 ring-sky-600/20",
  Downloaded: "bg-violet-50 text-violet-800 ring-violet-600/20",
  Deleted: "bg-red-50 text-red-700 ring-red-600/20",
};
const HISTORY_FILTERS = ["All", "Created", "Updated", "Downloaded", "Deleted"];

/* ── Helpers ── */
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const today = () => new Date().toLocaleDateString("en-CA");
const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
};
const toNum = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const longDate = (ymd?: string | null) =>
  ymd
    ? new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

// A blank quantity counts as 1.
const qtyOf = (i: Item) => (i.qty.trim() === "" ? 1 : toNum(i.qty));
const lineTotal = (i: Item) => (i.boxed ? 0 : qtyOf(i) * toNum(i.price));

const newItem = (boxed = false, id = Date.now()): Item => ({
  id,
  product: "",
  description: "",
  qty: "1",
  price: "",
  boxed,
});

function adminFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const token = localStorage.getItem("adminSessionActive");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers, cache: "no-store" });
}

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = data.errors
      ? Object.values(data.errors as Record<string, string[]>)
          .flat()
          .join(" ")
      : "";
    throw new Error(
      errors || data.message || "The request could not be completed.",
    );
  }
  return data as T;
}

const DEFAULT_CONDITIONS = [
  "1. Full payment of the rental fee is required before equipment release.",
  "2. A refundable security deposit, separate from the rental fee, is required before equipment release. It will be returned after the equipment has been inspected and confirmed complete and in good working condition.",
  "3. The renter is responsible for any damage, loss, or theft of the rented equipment during the rental period.",
  "4. All equipment, including complimentary items and accessories, must be returned complete and in good working condition.",
  "5. Late returns may incur additional fees.",
  "6. The renter must handle all equipment properly and follow the provided safety instructions.",
  "7. Rental extensions are subject to equipment availability and prior approval.",
  "8. Delivery is available through Lalamove or other couriers within Metro Manila.",
  "9. All delivery and return shipping fees shall be shouldered by the renter.",
  "10. A valid ID must be presented upon rental.",
  "By renting, the renter acknowledges and agrees to these terms and conditions.",
].join("\n");

const blankForm = (quotationNo = ""): Form => ({
  id: null,
  quotationNo,
  date: today(),
  terms: "Full Payment",
  validUntil: addDays(today(), 9),
  clientName: "",
  contactPerson: "",
  email: "",
  mobile: "",
  address: "",
  productDescription: "",
  items: [newItem(false, 1)],
  discount: "",
  conditions: DEFAULT_CONDITIONS,
  paymentNote:
    "For check payment, please make check payable to INFINITECH ADVERTISING CORPORATION. For bank deposit, kindly see below bank account details for reference. Once deposited, send us the deposit slip for payment reference.",
  bankName: "Security Bank",
  accountName: "INFINITECH ADVERTISING CORPORATION",
  accountNo: "0000-074-264-683",
  footer: "Thank you for your business!",
  status: "Draft",
});

const fromRecord = (r: QuotationRecord): Form => {
  return {
    id: r.id,
    quotationNo: r.quotation_no,
    date: r.quotation_date?.slice(0, 10) ?? today(),
    terms: r.terms ?? "",
    validUntil: r.valid_until?.slice(0, 10) ?? "",
    clientName: r.client_name ?? "",
    contactPerson: r.contact_person ?? "",
    email: r.email ?? "",
    mobile: r.mobile ?? "",
    address: r.address ?? "",
    productDescription: r.product_description ?? "",
    items: (r.items?.length ? r.items : [{}]).map((i, idx) => ({
      id: idx + 1,
      product: i.product ?? "",
      description: i.description ?? "",
      qty: i.qty != null && i.qty !== "" ? String(i.qty) : "1",
      // Old items only had "amount": treat it as price x 1.
      price:
        String(i.price ?? i.amount ?? "") === "0"
          ? ""
          : String(i.price ?? i.amount ?? ""),
      boxed: !!i.boxed,
    })),
    discount: r.discount ? String(r.discount) : "",
    conditions: r.conditions ?? "",
    paymentNote: r.payment_note ?? "",
    bankName: r.bank_name ?? "",
    accountName: r.account_name ?? "",
    accountNo: r.account_no ?? "",
    footer: r.footer ?? "",
    status: r.status,
  };
};

// quotation_no is intentionally not sent: the server generates it.
const toPayload = (f: Form) => ({
  quotation_date: f.date,
  valid_until: f.validUntil || null,
  terms: f.terms,
  client_name: f.clientName,
  contact_person: f.contactPerson,
  email: f.email,
  mobile: f.mobile,
  address: f.address,
  product_description: f.productDescription,
  items: f.items.map((i) => ({
    product: i.product,
    description: i.description,
    qty: i.boxed ? 1 : qtyOf(i),
    price: i.boxed ? 0 : toNum(i.price),
    boxed: i.boxed,
  })),
  discount: toNum(f.discount),
  conditions: f.conditions,
  payment_note: f.paymentNote,
  bank_name: f.bankName,
  account_name: f.accountName,
  account_no: f.accountNo,
  footer: f.footer,
  status: f.status,
});

const labelCls = "mb-1 block text-xs font-medium text-slate-600";
const areaCls =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600";

function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) =>
        line.startsWith("# ") ? (
          <p key={i} className="mt-1.5 font-bold first:mt-0">
            {line.slice(2)}
          </p>
        ) : (
          <p key={i}>{line || "\u00A0"}</p>
        ),
      )}
    </>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

/* ============================================================================
 * PAGE
 * ========================================================================== */
export default function QuotationPage() {
  const router = useRouter();

  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [form, setForm] = useState<Form | null>(null); // null = list view
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState<QuotationRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [tab, setTab] = useState<"quotations" | "history">("quotations");
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readJson<{ data: QuotationRecord[] }>(
        await adminFetch("/api/admin/quotations"),
      );
      setQuotations(data.data);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to load quotations.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("adminSessionActive")) {
      router.push("/admin/login");
      return;
    }
    void load();
  }, [router, load]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await readJson<{ data: HistoryRecord[] }>(
        await adminFetch("/api/admin/quotations/history"),
      );
      setHistory(data.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Refresh whenever the History tab is shown (also when coming back from a quotation).
  const inListView = form === null;
  useEffect(() => {
    if (tab === "history" && inListView) void loadHistory();
  }, [tab, inListView, loadHistory]);

  const shownHistory = useMemo(
    () =>
      history.filter(
        (h) => historyFilter === "All" || h.action === historyFilter,
      ),
    [history, historyFilter],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotations.filter(
      (i) =>
        (!q ||
          i.quotation_no.toLowerCase().includes(q) ||
          i.client_name.toLowerCase().includes(q)) &&
        (statusFilter === "All" || i.status === statusFilter),
    );
  }, [quotations, search, statusFilter]);

  const totals = useMemo(
    () => ({
      billed: quotations
        .filter((i) => i.status !== "Cancelled")
        .reduce((s, i) => s + i.balance_due, 0),
      unpaid: quotations
        .filter((i) => i.status === "Draft" || i.status === "Sent")
        .reduce((s, i) => s + i.balance_due, 0),
      paid: quotations
        .filter((i) => i.status === "Paid")
        .reduce((s, i) => s + i.balance_due, 0),
    }),
    [quotations],
  );

  // Shows the upcoming number; the server assigns the real one on save.
  const startNew = async () => {
    let no = "";
    try {
      const d = await readJson<{ data: { quotation_no: string } }>(
        await adminFetch("/api/admin/quotations/next-number"),
      );
      no = d.data.quotation_no;
    } catch {
      /* the server will generate one on save */
    }
    setForm(blankForm(no));
  };

  const save = async () => {
    if (!form) return;
    if (!form.clientName.trim()) return toast.error("Enter the client name.");
    if (
      form.items.every(
        (i) => !i.product.trim() && !i.description.trim() && !toNum(i.price),
      )
    )
      return toast.error("Add at least one item.");

    setSaving(true);
    try {
      const data = await readJson<{ data: QuotationRecord }>(
        await adminFetch(
          form.id
            ? `/api/admin/quotations/${form.id}`
            : "/api/admin/quotations",
          {
            method: form.id ? "PUT" : "POST",
            body: JSON.stringify(toPayload(form)),
          },
        ),
      );
      setForm(fromRecord(data.data));
      toast.success(`Quotation ${data.data.quotation_no} saved.`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save quotation.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await readJson(
        await adminFetch(`/api/admin/quotations/${toDelete.id}`, {
          method: "DELETE",
        }),
      );
      setQuotations((p) => p.filter((i) => i.id !== toDelete.id));
      toast.success("Quotation deleted.");
      setToDelete(null);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to delete quotation.",
      );
    } finally {
      setDeleting(false);
    }
  };

  // Records the download in History, then opens the print / save-as-PDF dialog.
  const printQuotation = () => {
    if (!form?.id) {
      toast.error("Save the quotation first so the download is recorded.");
      return;
    }
    void adminFetch(`/api/admin/quotations/${form.id}/downloaded`, {
      method: "POST",
      body: JSON.stringify({}),
    }).catch(() => {});
    window.print();
  };

  const header = (title: string, sub: string, action?: React.ReactNode) => (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg print:hidden">
      <div className="flex flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <FileText className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              {title}
            </h1>
            <p className="mt-1 text-sm text-blue-100">{sub}</p>
          </div>
        </div>
        {action}
      </div>
    </div>
  );

  /* ───────────────────────── EDITOR ───────────────────────── */
  if (form) {
    const set = <K extends keyof Form>(k: K, v: Form[K]) =>
      setForm((p) => (p ? { ...p, [k]: v } : p));
    const patchItem = (id: number, patch: Partial<Item>) =>
      set(
        "items",
        form.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      );

    const subtotal = form.items.reduce((s, i) => s + lineTotal(i), 0);
    const discount = toNum(form.discount);
    const balance = subtotal - discount;

    const clientRows: [string, string][] = [
      ["Client Name", form.clientName],
      ["Contact Person", form.contactPerson],
      ["Email Address", form.email],
      ["Mobile Number", form.mobile],
      ["Address", form.address],
    ];

    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
        <style>{`
          #quotation-print, #quotation-print * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            html, body { background: #fff !important; }
            body * { visibility: hidden !important; }
            #quotation-print, #quotation-print * { visibility: visible !important; }
            #quotation-print {
              position: absolute; left: 0; top: 0; width: 100%;
              box-sizing: border-box;
              min-width: 0 !important; max-width: none !important;
              box-shadow: none !important; border: 0 !important;
              padding: 0 14mm !important;
            }
            #quotation-print .items tr { break-inside: avoid; }
            #quotation-print .avoid-break { break-inside: avoid; }
            @page { size: A4; margin: 0; }
          }
        `}</style>

        {header(
          form.id ? `Quotation ${form.quotationNo}` : "New quotation",
          form.id
            ? "Edit and print this quotation"
            : "Fill in the details, then save",
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => setForm(null)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={printQuotation}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print / PDF
            </Button>
            <Button
              className="bg-white font-semibold text-blue-700 hover:bg-blue-50"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>,
        )}

        <div className="grid gap-5 py-5 sm:py-8 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* FORM */}
          <div className="space-y-4 print:hidden">
            <Card className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Quotation details
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Quotation #</label>
                  <Input
                    readOnly
                    tabIndex={-1}
                    className="bg-slate-50 font-mono text-slate-600"
                    value={form.quotationNo || "Assigned on save"}
                  />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                    value={form.status}
                    onChange={(e) => set("status", e.target.value as Status)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => set("date", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Valid until</label>
                  <Input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => set("validUntil", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Terms</label>
                  <Input
                    value={form.terms}
                    onChange={(e) => set("terms", e.target.value)}
                  />
                </div>
              </div>
            </Card>

            <Card className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Client information
              </h2>
              <div>
                <label className={labelCls}>Client name *</label>
                <Input
                  value={form.clientName}
                  onChange={(e) => set("clientName", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Contact person</label>
                  <Input
                    value={form.contactPerson}
                    onChange={(e) => set("contactPerson", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Mobile number</label>
                  <Input
                    inputMode="numeric"
                    value={form.mobile}
                    onChange={(e) =>
                      set("mobile", e.target.value.replace(/\D/g, ""))
                    }
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Email address</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <textarea
                  className={areaCls}
                  rows={2}
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Product description (optional)
                </label>
                <Input
                  placeholder="e.g. G-Limit Studio"
                  value={form.productDescription}
                  onChange={(e) => set("productDescription", e.target.value)}
                />
              </div>
            </Card>

            <Card className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Items</h2>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      set("items", [...form.items, newItem(false)])
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add item
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => set("items", [...form.items, newItem(true)])}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add boxed
                  </Button>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                One line = one row. Start a line with{" "}
                <code className="rounded bg-slate-100 px-1"># </code> for a bold
                heading. Use a boxed row for complimentary items, add-ons, or
                notes (no price).
              </p>

              {form.items.map((item, idx) => (
                <div
                  key={item.id}
                  className={`space-y-2 rounded-xl border p-3 ${
                    item.boxed
                      ? "border-green-700/40 bg-green-50/40"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      {item.boxed ? "Boxed row" : "Item"} {idx + 1}
                    </span>
                    {form.items.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-500 hover:text-red-600"
                        aria-label="Remove item"
                        onClick={() =>
                          set(
                            "items",
                            form.items.filter((i) => i.id !== item.id),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div>
                    <label className={labelCls}>Product / Label</label>
                    <Input
                      value={item.product}
                      placeholder={
                        item.boxed
                          ? "e.g. Complimentary Equipment — Free of Charge"
                          : "e.g. Studio Equipment Rental"
                      }
                      onChange={(e) =>
                        patchItem(item.id, { product: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Details</label>
                    <textarea
                      className={areaCls}
                      rows={item.boxed ? 4 : 6}
                      value={item.description}
                      onChange={(e) =>
                        patchItem(item.id, { description: e.target.value })
                      }
                    />
                  </div>

                  {!item.boxed && (
                    <div className="grid grid-cols-[80px_1fr_auto] items-end gap-2">
                      <div>
                        <label className={labelCls}>Qty</label>
                        <Input
                          inputMode="decimal"
                          className="text-right tabular-nums"
                          value={item.qty}
                          onChange={(e) =>
                            patchItem(item.id, { qty: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Price</label>
                        <Input
                          inputMode="decimal"
                          className="text-right tabular-nums"
                          value={item.price}
                          onChange={(e) =>
                            patchItem(item.id, { price: e.target.value })
                          }
                        />
                      </div>
                      <p className="pb-2 text-right text-xs tabular-nums text-slate-500">
                        Total {money(lineTotal(item))}
                      </p>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={item.boxed}
                      onChange={(e) =>
                        patchItem(item.id, { boxed: e.target.checked })
                      }
                    />
                    Boxed (green border, no price)
                  </label>
                </div>
              ))}
            </Card>

            <Card className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Discount</h2>
              <Input
                inputMode="decimal"
                className="text-right tabular-nums"
                aria-label="Discount"
                value={form.discount}
                onChange={(e) => set("discount", e.target.value)}
              />
            </Card>

            <Card className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Terms & payment
              </h2>
              <div>
                <label className={labelCls}>
                  Terms & conditions (one per line)
                </label>
                <textarea
                  className={areaCls}
                  rows={8}
                  value={form.conditions}
                  onChange={(e) => set("conditions", e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Payment note</label>
                <textarea
                  className={areaCls}
                  rows={3}
                  value={form.paymentNote}
                  onChange={(e) => set("paymentNote", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className={labelCls}>Bank</label>
                  <Input
                    value={form.bankName}
                    onChange={(e) => set("bankName", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Account name</label>
                  <Input
                    value={form.accountName}
                    onChange={(e) => set("accountName", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Account no.</label>
                  <Input
                    value={form.accountNo}
                    onChange={(e) => set("accountNo", e.target.value)}
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* PREVIEW / EXPORT */}
          <div className="min-w-0 overflow-x-auto">
            <div
              id="quotation-print"
              className="mx-auto w-full min-w-[640px] max-w-[820px] border border-slate-200 bg-white p-8 text-[11px] leading-snug text-black shadow-sm"
            >
              <table className="w-full border-collapse">
                <thead className="table-header-group">
                  <tr>
                    <td>
                      <div className="hidden h-[12mm] print:block" />
                    </td>
                  </tr>
                </thead>
                <tfoot className="table-footer-group">
                  <tr>
                    <td>
                      <div className="hidden h-[12mm] print:block" />
                    </td>
                  </tr>
                </tfoot>
                <tbody>
                  <tr>
                    <td className="align-top">
                      {/* Letterhead */}
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[17px] font-bold">
                            {COMPANY.name}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                            {COMPANY.address}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-500">
                            {COMPANY.phone}
                          </p>
                          <p className="text-[10px] font-semibold text-blue-600 underline">
                            {COMPANY.website}
                          </p>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={LOGO_SRC}
                          alt="Infinitech"
                          className="h-28 w-auto max-w-[240px] object-contain"
                          onError={(e) =>
                            ((
                              e.currentTarget as HTMLImageElement
                            ).style.display = "none")
                          }
                        />
                      </div>

                      <h2 className="mt-6 text-[26px] font-extrabold leading-none tracking-tight">
                        QUOTATION
                      </h2>

                      {/* Client information + quotation meta */}
                      <div className="mt-2 flex justify-between gap-6">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold">
                            CLIENT INFORMATION
                          </p>
                          <div className="mt-2 space-y-1.5 text-[10px] font-semibold text-slate-500">
                            {clientRows.map(([k, v]) => (
                              <div
                                key={k}
                                className="grid grid-cols-[110px_1fr]"
                              >
                                <span>{k}</span>
                                <span className="whitespace-pre-wrap">
                                  : {v}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <table className="h-fit text-[10px]">
                          <tbody>
                            {[
                              ["QUOTATION #", form.quotationNo],
                              ["DATE", longDate(form.date)],
                              ["TERMS", form.terms],
                              ["VALID UNTIL", longDate(form.validUntil)],
                            ].map(([k, v]) => (
                              <tr key={k}>
                                <td className="pr-6 font-semibold text-slate-500">
                                  {k}
                                </td>
                                <td className="py-0.5 font-medium">{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {form.productDescription.trim() && (
                        <div className="mt-4 grid grid-cols-[130px_1fr] text-[11px]">
                          <span className="font-bold">Product Description</span>
                          <span>: {form.productDescription}</span>
                        </div>
                      )}

                      {/* Items */}
                      <table className="items mt-5 w-full border-collapse">
                        <thead>
                          <tr className="border-b-2 border-black text-[10px] font-bold">
                            <th className="px-2 py-1 text-left">Description</th>
                            <th className="w-[8%] px-2 py-1 text-right">Qty</th>
                            <th className="w-[18%] px-2 py-1 text-right">
                              Price
                            </th>
                            <th className="w-[18%] px-2 py-1 text-right">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.items.map((item) =>
                            item.boxed ? (
                              <tr key={item.id} className="align-top">
                                <td colSpan={4} className="px-2 py-2">
                                  {item.product && (
                                    <p className="mb-1 font-bold text-[#1f3864]">
                                      {item.product}
                                    </p>
                                  )}
                                  <div className="border border-green-700 px-2 py-1.5">
                                    <Lines text={item.description} />
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              <tr key={item.id} className="align-top">
                                <td className="px-2 py-2">
                                  {item.product && (
                                    <p className="font-bold">{item.product}</p>
                                  )}
                                  <Lines text={item.description} />
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums">
                                  {toNum(item.price) ? qtyOf(item) : ""}
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums">
                                  {toNum(item.price)
                                    ? `PHP ${money(toNum(item.price))}`
                                    : ""}
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums">
                                  {toNum(item.price)
                                    ? `PHP ${money(lineTotal(item))}`
                                    : ""}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>

                      {/* Totals */}
                      <div className="avoid-break mt-5 border-t-2 border-black pt-1.5">
                        <div className="ml-auto w-[55%] text-[10px] font-bold">
                          <div className="grid grid-cols-[1fr_140px] items-center py-0.5">
                            <span className="pl-2">Subtotal</span>
                            <span className="pr-2 text-right tabular-nums">
                              PHP {money(subtotal)}
                            </span>
                          </div>
                          {discount > 0 && (
                            <div className="grid grid-cols-[1fr_140px] items-center py-0.5">
                              <span className="pl-2">Less: Discount</span>
                              <span className="pr-2 text-right tabular-nums text-red-600">
                                (PHP {money(discount)})
                              </span>
                            </div>
                          )}
                          <div className="grid grid-cols-[1fr_140px] items-center py-0.5">
                            <span className="pl-2">Balance Due</span>
                            <span className="bg-[#1f3864] px-2 py-1 text-right tabular-nums text-white">
                              PHP {money(balance)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Terms & conditions */}
                      {form.conditions.trim() && (
                        <div className="avoid-break mt-5 bg-[#d9d9d9] p-2.5">
                          <p className="text-[10px] font-bold">
                            TERMS & CONDITIONS
                          </p>
                          <div className="mt-1 space-y-0.5 text-[9px] text-slate-800">
                            {form.conditions.split("\n").map((l, i) => (
                              <p key={i}>{l}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Payment */}
                      <div className="avoid-break mt-5 bg-[#ececec] p-2.5 text-[9px]">
                        <p>{form.paymentNote}</p>
                        <div className="mt-0.5 font-bold">
                          <p>Bank Name: {form.bankName}</p>
                          <p>Bank Account Name: {form.accountName}</p>
                          <p>Account No.: {form.accountNo}</p>
                        </div>
                      </div>

                      {/* Signature */}
                      <div className="avoid-break mt-10 flex justify-end">
                        <div className="w-60">
                          <p className="text-[10px] font-semibold text-slate-400">
                            Accepted By:
                          </p>
                          <div className="mt-8 border-t border-black pt-1 text-center text-[10px] font-bold">
                            CLIENT SIGNATURE
                          </div>
                        </div>
                      </div>

                      <p className="mt-8 text-center text-[10px] italic text-slate-500">
                        {form.footer}
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ───────────────────────── LIST ───────────────────────── */
  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {header(
        "Quotations",
        "Create, track and print client quotations",
        <Button
          className="bg-white font-semibold text-blue-700 hover:bg-blue-50"
          onClick={() => void startNew()}
        >
          <Plus className="mr-2 h-4 w-4" />
          New quotation
        </Button>,
      )}

      <div className="space-y-5 py-5 sm:py-8">
        <div className="flex gap-1 border-b border-slate-200">
          {(
            [
              ["quotations", "Quotations"],
              ["history", "History"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab === k
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "quotations" ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["Total billed", totals.billed],
                ["Unpaid (Draft + Sent)", totals.unpaid],
                ["Paid", totals.paid],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                    ₱{money(value as number)}
                  </p>
                </div>
              ))}
            </div>

            <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search by quotation # or client"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter by status"
                  className="h-9 rounded-md border border-input bg-white px-3 text-sm sm:w-44"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="All">All statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
                  <Loader className="h-4 w-4 animate-spin" /> Loading quotations
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-14 text-center">
                  <p className="font-medium text-slate-900">
                    {quotations.length === 0
                      ? "No quotations yet"
                      : "No quotations match"}
                  </p>
                  {quotations.length === 0 && (
                    <Button className="mt-4" onClick={() => void startNew()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create your first quotation
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Quotation #</th>
                        <th className="px-3 py-2.5 font-medium">Client</th>
                        <th className="px-3 py-2.5 font-medium">Date</th>
                        <th className="px-3 py-2.5 font-medium">Valid until</th>
                        <th className="px-3 py-2.5 text-right font-medium">
                          Balance due
                        </th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                        <th className="w-[130px] px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((r) => (
                        <tr
                          key={r.id}
                          className="text-slate-700 hover:bg-slate-50/60"
                        >
                          <td className="px-4 py-3 font-mono text-xs">
                            {r.quotation_no}
                          </td>
                          <td className="max-w-[240px] truncate px-3 py-3 font-medium text-slate-900">
                            {r.client_name}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {longDate(r.quotation_date)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {longDate(r.valid_until) || "—"}
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-900">
                            ₱{money(r.balance_due)}
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-9 w-9"
                                aria-label="Open quotation"
                                title="Open / print"
                                onClick={() => setForm(fromRecord(r))}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-9 w-9 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                aria-label="Delete quotation"
                                onClick={() => setToDelete(r)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        ) : (
          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <HistoryIcon className="h-4 w-4 text-slate-500" />
                Created and downloaded files
              </div>
              <select
                aria-label="Filter by action"
                className="h-9 rounded-md border border-input bg-white px-3 text-sm sm:w-44"
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
              >
                {HISTORY_FILTERS.map((a) => (
                  <option key={a} value={a}>
                    {a === "All" ? "All actions" : a}
                  </option>
                ))}
              </select>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
                <Loader className="h-4 w-4 animate-spin" /> Loading history
              </div>
            ) : shownHistory.length === 0 ? (
              <div className="px-4 py-14 text-center text-sm text-slate-500">
                No history yet. Created, updated and downloaded quotations will
                show up here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Date & time</th>
                      <th className="px-3 py-2.5 font-medium">Action</th>
                      <th className="px-3 py-2.5 font-medium">Quotation #</th>
                      <th className="px-3 py-2.5 font-medium">Client</th>
                      <th className="px-3 py-2.5 font-medium">By</th>
                      <th className="w-[110px] px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shownHistory.map((h) => {
                      const inv = quotations.find(
                        (i) => i.id === h.quotation_id,
                      );
                      return (
                        <tr
                          key={h.id}
                          className="text-slate-700 hover:bg-slate-50/60"
                        >
                          <td className="whitespace-nowrap px-4 py-3">
                            {dateTime(h.created_at)}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ACTION_STYLE[h.action]}`}
                            >
                              {h.action}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs">
                            {h.quotation_no}
                          </td>
                          <td className="max-w-[240px] truncate px-3 py-3 font-medium text-slate-900">
                            {h.client_name}
                          </td>
                          <td className="px-3 py-3">{h.user_name || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            {inv ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setForm(fromRecord(inv))}
                              >
                                Open
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">
                                Deleted
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      <Dialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setToDelete(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete quotation?</DialogTitle>
            <DialogDescription>
              This will permanently delete quotation{" "}
              <span className="font-medium text-slate-900">
                {toDelete?.quotation_no}
              </span>
              {toDelete ? ` (${toDelete.client_name})` : ""}. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void confirmDelete()}
            >
              {deleting ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
