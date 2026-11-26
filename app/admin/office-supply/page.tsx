//admin office supplies inventory page

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  History,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StockMovementDialog, type StockAction } from "./InventoryStockDialog";

type SupplyItem = {
  id: number;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  location: string | null;
  notes: string | null; // optional
  is_active: boolean;
  updated_at: string;
};

type Movement = {
  id: number;
  item_id: number;
  item_name: string;
  type: "in" | "out" | "adjust";
  quantity: number;
  balance_after: number;
  issued_to: string | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
};

type ItemForm = {
  name: string;
  category: string;
  unit: string;
  quantity: string; // opening stock, only used when creating
  location: string; // optional
  notes: string; // optional
  is_active: boolean;
};

type ApiResult = { message?: string; data?: unknown };
type TabKey = "items" | "movements";
type StockStatus = "in" | "out";

// Keep these in sync with the validation rules in OfficeSuppliesController.
const CATEGORIES = [
  "Paper",
  "Writing",
  "Filing & Folders",
  "Desk Accessories",
  "Printer & Ink",
  "Cleaning",
  "Pantry",
  "Other",
];
const UNITS = ["pc", "box", "pack", "ream", "set", "bottle", "roll"];

const emptyForm: ItemForm = {
  name: "",
  category: "Paper",
  unit: "pc",
  quantity: "0",
  location: "",
  notes: "",
  is_active: true,
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10";
const SKELETON_ROWS = [0, 1, 2, 3, 4];

async function readJson(response: Response): Promise<ApiResult> {
  try {
    return (await response.json()) as ApiResult;
  } catch {
    return {};
  }
}

function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current)
    ? [...options, current]
    : options;
}

function stockStatus(item: SupplyItem): StockStatus {
  if (item.quantity <= 0) return "out";
  return "in";
}

const STATUS_STYLE: Record<StockStatus, { label: string; tone: string }> = {
  in: { label: "In stock", tone: "bg-emerald-50 text-emerald-800" },
  out: { label: "Out of stock", tone: "bg-rose-50 text-rose-800" },
};

const MOVEMENT_STYLE: Record<
  Movement["type"],
  { label: string; tone: string }
> = {
  in: { label: "Stock in", tone: "bg-emerald-50 text-emerald-800" },
  out: { label: "Stock out", tone: "bg-rose-50 text-rose-800" },
  adjust: { label: "Adjustment", tone: "bg-sky-50 text-sky-800" },
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function normalizeItem(item: SupplyItem): SupplyItem {
  return {
    ...item,
    quantity: Number(item.quantity) || 0,
    location: item.location ?? null,
    notes: item.notes ?? null,
  };
}

function Detail({
  label,
  children,
  wide = false,
  block = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  block?: boolean;
}) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-sm text-slate-800 ${
          block
            ? "whitespace-pre-wrap rounded-xl bg-slate-50 p-3 leading-6 text-slate-700"
            : ""
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

function StatusPill({ item }: { item: SupplyItem }) {
  const { label, tone } = STATUS_STYLE[stockStatus(item)];
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  );
}

export default function OfficeSuppliesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("items");
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  // Movements tab filter: "All" or an item id.
  const [itemFilter, setItemFilter] = useState<number | "All">("All");
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<SupplyItem | null>(null);
  const [stockAction, setStockAction] = useState<StockAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    items: null,
    movements: null,
  });

  const setField = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const loadData = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setError("");
      try {
        const [itemsResponse, movementsResponse] = await Promise.all([
          fetch("/api/admin/office-supplies/items", { cache: "no-store" }),
          fetch("/api/admin/office-supplies/movements", { cache: "no-store" }),
        ]);
        const responses = [itemsResponse, movementsResponse];
        if (responses.some((r) => r.status === 401)) {
          router.replace("/admin/login");
          return;
        }
        if (responses.some((r) => r.status === 403)) {
          throw new Error(
            "You need Office Supplies permission to access this page.",
          );
        }
        const [itemsResult, movementsResult] = await Promise.all([
          readJson(itemsResponse),
          readJson(movementsResponse),
        ]);
        if (responses.some((r) => !r.ok)) {
          throw new Error(
            itemsResult.message ||
              movementsResult.message ||
              "Could not load the office supplies inventory.",
          );
        }
        setItems(
          Array.isArray(itemsResult.data)
            ? (itemsResult.data as SupplyItem[]).map(normalizeItem)
            : [],
        );
        setMovements(
          Array.isArray(movementsResult.data)
            ? (movementsResult.data as Movement[])
            : [],
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the office supplies inventory.",
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setItemDialogOpen(false);
    setError("");
  };

  const saveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    setNotice("");

    const name = form.name.trim();
    const opening = Number(form.quantity);

    if (!name) {
      setError("Item name can't be blank.");
      return;
    }
    if (editingId === null && (!Number.isFinite(opening) || opening < 0)) {
      setError("Opening quantity must be 0 or more.");
      return;
    }

    setSaving(true);
    const wasEditing = editingId !== null;
    // Quantity is only sent when creating. Later changes go through Stock in / out.
    const body = {
      name,
      category: form.category,
      unit: form.unit,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
      ...(wasEditing ? {} : { quantity: opening }),
    };
    try {
      const response = await fetch(
        editingId
          ? `/api/admin/office-supplies/items/${editingId}`
          : "/api/admin/office-supplies/items",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await readJson(response);
      if (!response.ok) {
        throw new Error(result.message || "Could not save this item.");
      }
      resetForm();
      setNotice(wasEditing ? "Item updated." : "Item added.");
      await loadData(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this item.",
      );
    } finally {
      setSaving(false);
    }
  };

  const editItem = (item: SupplyItem) => {
    setError("");
    setNotice("");
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity: String(item.quantity),
      location: item.location ?? "",
      notes: item.notes ?? "",
      is_active: item.is_active,
    });
    setItemDialogOpen(true);
  };

  const deleteItem = async (item: SupplyItem) => {
    if (deletingId !== null) return;
    if (
      !window.confirm(`Delete ${item.name}? Its stock history is deleted too.`)
    )
      return;
    setError("");
    setNotice("");
    setDeletingId(item.id);
    try {
      const response = await fetch(
        `/api/admin/office-supplies/items/${item.id}`,
        {
          method: "DELETE",
        },
      );
      const result = await readJson(response);
      if (!response.ok) {
        throw new Error(result.message || "Could not delete this item.");
      }
      if (editingId === item.id) resetForm();
      setNotice("Item deleted.");
      await loadData(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete this item.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const outOfStockCount = items.filter((i) => stockStatus(i) === "out").length;
  const activeCount = items.filter((i) => i.is_active).length;

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return Array.from(counts, ([category, count]) => ({
      category,
      count,
    })).sort((a, b) => a.category.localeCompare(b.category));
  }, [items]);

  const activeCategory = categoryOptions.some(
    (o) => o.category === categoryFilter,
  )
    ? categoryFilter
    : "All";

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter(
      (item) =>
        (activeCategory === "All" || item.category === activeCategory) &&
        (!query ||
          item.name.toLowerCase().includes(query) ||
          (item.location ?? "").toLowerCase().includes(query)),
    );
  }, [items, activeCategory, search]);

  const visibleMovements = useMemo(
    () =>
      itemFilter === "All"
        ? movements
        : movements.filter((m) => m.item_id === itemFilter),
    [movements, itemFilter],
  );

  const filteredItemName =
    itemFilter === "All"
      ? null
      : (items.find((i) => i.id === itemFilter)?.name ?? null);

  const viewHistory = (item: SupplyItem) => {
    setItemFilter(item.id);
    setActiveTab("movements");
  };

  const subtitle = loading
    ? "Loading…"
    : activeTab === "items"
      ? `${items.length} item${items.length === 1 ? "" : "s"} · ${activeCount} active · ${outOfStockCount} out of stock`
      : `${visibleMovements.length} movement${visibleMovements.length === 1 ? "" : "s"}${filteredItemName ? ` for ${filteredItemName}` : ""}`;

  const startNewItem = () => {
    setActiveTab("items");
    resetForm();
    setNotice("");
    setItemDialogOpen(true);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "items", label: "Items" },
    { key: "movements", label: "Stock movements" },
  ];

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.key === activeTab);
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextKey = tabs[nextIndex].key;
    setActiveTab(nextKey);
    tabRefs.current[nextKey]?.focus();
  };

  const iconBtn =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50";

  // Row actions shared by the table and the mobile cards.
  const renderActions = (item: SupplyItem) => (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => viewHistory(item)}
        className={`${iconBtn} w-9 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700`}
        aria-label={`History for ${item.name}`}
        title="View history"
      >
        <History size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => editItem(item)}
        className={`${iconBtn} w-9 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700`}
        aria-label={`Edit ${item.name}`}
        title="Edit item"
      >
        <Pencil size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => void deleteItem(item)}
        disabled={deletingId !== null}
        className={`${iconBtn} w-9 hover:border-red-200 hover:bg-red-50 hover:text-red-600`}
        aria-label={`Delete ${item.name}`}
        title="Delete item"
      >
        {deletingId === item.id ? (
          <LoaderCircle size={15} className="animate-spin" />
        ) : (
          <Trash2 size={15} />
        )}
      </button>
    </div>
  );

  const thClass =
    "h-11 whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500";

  const skeleton = (
    <div role="status" aria-label="Loading inventory" aria-busy="true">
      <div className="divide-y divide-slate-100">
        {SKELETON_ROWS.map((row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-5">
            <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
            <div className="ml-auto h-6 w-20 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full">
        {/* Pill tabs */}
        <div
          role="tablist"
          aria-label="Office supplies sections"
          onKeyDown={onTabKeyDown}
          className="mb-4 flex flex-wrap gap-2"
        >
          {tabs.map(({ key, label }) => {
            const selected = activeTab === key;
            return (
              <button
                key={key}
                ref={(node) => {
                  tabRefs.current[key] = node;
                }}
                type="button"
                role="tab"
                id={`supplies-tab-${key}`}
                aria-selected={selected}
                aria-controls={`supplies-panel-${key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(key)}
                className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60 ${
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {label}
                {key === "items" && outOfStockCount > 0 && (
                  <span
                    className="h-2 w-2 rounded-full bg-amber-400"
                    role="img"
                    aria-label={`${outOfStockCount} out of stock`}
                    title={`${outOfStockCount} out of stock`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Gradient banner */}
        <section className="mb-6 flex flex-wrap items-center justify-between gap-5 rounded-3xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-6 py-7 text-white shadow-lg sm:px-10">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              {activeTab === "items" ? (
                <Package size={28} aria-hidden="true" />
              ) : (
                <Boxes size={28} aria-hidden="true" />
              )}
            </span>
            <div>
              <h1 className="text-3xl font-bold leading-tight">
                Office Supplies Inventory
              </h1>
              <p className="mt-0.5 text-sm text-white/80">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startNewItem}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-sky-800 shadow-sm hover:bg-sky-50"
            >
              <Plus size={16} aria-hidden="true" />
              Add item
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                aria-hidden="true"
                className={loading ? "animate-spin" : undefined}
              />
              Refresh
            </button>
          </div>
        </section>

        {error && !itemDialogOpen && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            {notice}
          </div>
        )}

        {/* Items */}
        <div
          role="tabpanel"
          id="supplies-panel-items"
          aria-labelledby="supplies-tab-items"
          hidden={activeTab !== "items"}
        >
          {items.length > 0 && (
            <div className="mb-4 space-y-3">
              <label className="relative block max-w-sm">
                <span className="sr-only">Search items</span>
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or location"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
                />
              </label>
              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Filter items by category"
              >
                {[
                  { category: "All", count: items.length },
                  ...categoryOptions,
                ].map(({ category, count }) => {
                  const on = activeCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCategoryFilter(category)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60 ${
                        on
                          ? "bg-blue-600 text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {category === "All" ? "All categories" : category}
                      <span
                        className={`tabular-nums ${on ? "text-blue-100" : "text-slate-400"}`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              skeleton
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                  <Package size={22} aria-hidden="true" />
                </span>
                <p className="mt-4 font-semibold text-[#0f1a3d]">
                  No items yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
                  Add your first office supply to start tracking stock.
                </p>
              </div>
            ) : visibleItems.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-600">
                No items match your search or filter.
              </p>
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr>
                        <th className={thClass}>Item</th>
                        <th className={thClass}>Category</th>
                        <th className={`${thClass} text-right`}>On hand</th>
                        <th className={thClass}>Status</th>
                        <th className={`${thClass} text-center`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-100 text-slate-700 transition-colors hover:bg-blue-50/40 last:border-0"
                        >
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => setViewingItem(item)}
                              className="text-left font-semibold text-slate-900 hover:text-blue-700"
                            >
                              {item.name}
                            </button>
                            {item.location && (
                              <p className="mt-0.5 text-xs text-slate-500">
                                {item.location}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-slate-600">
                            {item.category}
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums">
                            <span className="font-semibold text-slate-900">
                              {item.quantity}
                            </span>{" "}
                            <span className="text-xs text-slate-500">
                              {item.unit}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusPill item={item} />
                            {!item.is_active && (
                              <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">{renderActions(item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="grid gap-3 p-3 lg:hidden">
                  {visibleItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setViewingItem(item)}
                            className="break-words text-left font-semibold text-[#0f1a3d]"
                          >
                            {item.name}
                          </button>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {item.category}
                            {item.location ? ` · ${item.location}` : ""}
                          </p>
                        </div>
                        <StatusPill item={item} />
                      </div>
                      <dl className="grid grid-cols-2 gap-3">
                        <Detail label="On hand">
                          {item.quantity} {item.unit}
                        </Detail>
                      </dl>
                      <div className="border-t border-slate-100 pt-3">
                        {renderActions(item)}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* Stock movements */}
        <div
          role="tabpanel"
          id="supplies-panel-movements"
          aria-labelledby="supplies-tab-movements"
          hidden={activeTab !== "movements"}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {filteredItemName && (
                <>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                    {filteredItemName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setItemFilter("All")}
                    className="text-xs font-semibold text-blue-700 underline hover:text-blue-900"
                  >
                    Show all items
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              disabled={items.length === 0}
              onClick={() => {
                setNotice("");
                setStockAction({
                  kind: "in",
                  item:
                    itemFilter === "All"
                      ? null
                      : (items.find((i) => i.id === itemFilter) ?? null),
                });
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0f1a3d] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1b2b58] disabled:opacity-60"
            >
              <Plus size={16} aria-hidden="true" />
              Record movement
            </button>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              skeleton
            ) : visibleMovements.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-800">
                  <Boxes size={22} aria-hidden="true" />
                </span>
                <p className="mt-4 font-semibold text-[#0f1a3d]">
                  No stock movements yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
                  Stock in, stock out, and adjustments will be listed here.
                </p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr>
                        <th className={thClass}>Date</th>
                        <th className={thClass}>Item</th>
                        <th className={thClass}>Type</th>
                        <th className={`${thClass} text-right`}>Qty</th>
                        <th className={`${thClass} text-right`}>Balance</th>
                        <th className={thClass}>Issued to</th>
                        <th className={thClass}>Remarks</th>
                        <th className={thClass}>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleMovements.map((m) => (
                        <tr
                          key={m.id}
                          className="border-b border-slate-100 text-slate-700 last:border-0"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {formatDateTime(m.created_at)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {m.item_name}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${MOVEMENT_STYLE[m.type].tone}`}
                            >
                              {MOVEMENT_STYLE[m.type].label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {m.type === "in"
                              ? "+"
                              : m.type === "out"
                                ? "−"
                                : ""}
                            {m.quantity}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {m.balance_after}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {m.issued_to || "—"}
                          </td>
                          <td className="max-w-[240px] truncate px-4 py-3 text-slate-600">
                            {m.remarks || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {m.created_by || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="grid gap-3 p-3 lg:hidden">
                  {visibleMovements.map((m) => (
                    <li
                      key={m.id}
                      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 break-words font-semibold text-[#0f1a3d]">
                          {m.item_name}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${MOVEMENT_STYLE[m.type].tone}`}
                        >
                          {MOVEMENT_STYLE[m.type].label}
                        </span>
                      </div>
                      <dl className="grid grid-cols-2 gap-3">
                        <Detail label="Quantity">
                          {m.type === "in" ? "+" : m.type === "out" ? "−" : ""}
                          {m.quantity}
                        </Detail>
                        <Detail label="Balance">{m.balance_after}</Detail>
                        <Detail label="Date" wide>
                          {formatDateTime(m.created_at)}
                        </Detail>
                        {m.issued_to && (
                          <Detail label="Issued to" wide>
                            {m.issued_to}
                          </Detail>
                        )}
                        {m.remarks && (
                          <Detail label="Remarks" wide block>
                            {m.remarks}
                          </Detail>
                        )}
                      </dl>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>

      {/* Add / edit item */}
      <Dialog
        open={itemDialogOpen}
        onOpenChange={(open) => {
          if (open) setItemDialogOpen(true);
          else if (!saving) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-200 bg-white p-0 text-slate-900 sm:rounded-2xl">
          <div className="p-5 sm:p-6">
            <DialogHeader className="mb-5 flex-row items-center gap-3 space-y-0 text-left">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
                {editingId ? <Pencil size={19} /> : <Plus size={20} />}
              </span>
              <div>
                <DialogTitle className="font-bold text-[#0f1a3d]">
                  {editingId ? "Edit item" : "Add an item"}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  Office supplies inventory
                </DialogDescription>
              </div>
            </DialogHeader>

            {error && itemDialogOpen && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
              >
                {error}
              </div>
            )}

            <form onSubmit={saveItem} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                  Item name
                  <input
                    className={inputClass}
                    required
                    maxLength={160}
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Category
                  <select
                    className={inputClass}
                    value={form.category}
                    onChange={(e) => setField("category", e.target.value)}
                  >
                    {withCurrent(CATEGORIES, form.category).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Unit
                  <select
                    className={inputClass}
                    value={form.unit}
                    onChange={(e) => setField("unit", e.target.value)}
                  >
                    {withCurrent(UNITS, form.unit).map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </label>
                {editingId === null && (
                  <label className="block text-sm font-semibold text-slate-700">
                    Opening quantity
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className={inputClass}
                      value={form.quantity}
                      onChange={(e) => setField("quantity", e.target.value)}
                    />
                  </label>
                )}
                <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                  Storage location{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                  <input
                    className={inputClass}
                    maxLength={120}
                    placeholder="e.g. Supply room, shelf B"
                    value={form.location}
                    onChange={(e) => setField("location", e.target.value)}
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                  Notes{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                  <textarea
                    className={`${inputClass} resize-y`}
                    maxLength={1000}
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                  />
                </label>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-600"
                  checked={form.is_active}
                  onChange={(e) => setField("is_active", e.target.checked)}
                />
                Item is in use
              </label>

              <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="min-h-11 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    backgroundColor: "#0f1a3d",
                    color: "#ffffff",
                    borderColor: "transparent",
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : editingId ? (
                    <Pencil size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add item"}
                </button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* View item */}
      <Dialog
        open={viewingItem !== null}
        onOpenChange={(open) => {
          if (!open) setViewingItem(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-200 bg-white text-slate-900 sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold text-[#0f1a3d]">
              {viewingItem?.name ?? "Item"}
            </DialogTitle>
            <DialogDescription>Item details</DialogDescription>
          </DialogHeader>
          {viewingItem && (
            <div className="space-y-5">
              {stockStatus(viewingItem) === "out" && (
                <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                  <TriangleAlert size={14} aria-hidden="true" />
                  This item is out of stock.
                </p>
              )}
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Category">{viewingItem.category}</Detail>
                <Detail label="Unit">{viewingItem.unit}</Detail>
                <Detail label="On hand">
                  {viewingItem.quantity} {viewingItem.unit}
                </Detail>
                <Detail label="Status">
                  {STATUS_STYLE[stockStatus(viewingItem)].label}
                  {viewingItem.is_active ? "" : " (inactive)"}
                </Detail>
                <Detail label="Last updated">
                  {formatDateTime(viewingItem.updated_at)}
                </Detail>
                {viewingItem.location && (
                  <Detail label="Location" wide>
                    {viewingItem.location}
                  </Detail>
                )}
                {viewingItem.notes && (
                  <Detail label="Notes" wide block>
                    {viewingItem.notes}
                  </Detail>
                )}
              </dl>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setViewingItem(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const item = viewingItem;
                    setViewingItem(null);
                    editItem(item);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0f1a3d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b2b58]"
                >
                  <Pencil size={15} aria-hidden="true" />
                  Edit item
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stock in / out / adjust */}
      <StockMovementDialog
        action={stockAction}
        items={items}
        onClose={() => setStockAction(null)}
        onDone={(message) => {
          setStockAction(null);
          setNotice(message);
          void loadData(false);
        }}
      />
    </div>
  );
}
