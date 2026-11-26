export type ProductivityLabel = "productive" | "attention" | "low" | "none";

export type ProductivityRow = {
  employee_id: number;
  label: ProductivityLabel;
  reasons: string[];
  flags: { forgot_to_pause: boolean; interruptions: number };
  metrics: {
    active_seconds: number;
    available_seconds: number;
    utilization: number | null; // null kapag wala pang available time
    tasks_completed: number;
    progress_gained: number;
    segments: number;
    updates: number;
    updates_with_remarks: number;
  };
};

export const LABEL_META: Record<
  ProductivityLabel,
  { text: string; dot: string; cls: string }
> = {
  productive: {
    text: "Productive",
    dot: "bg-emerald-500",
    cls: "bg-emerald-50 text-emerald-800",
  },
  attention: {
    text: "Needs attention",
    dot: "bg-amber-400",
    cls: "bg-amber-50 text-amber-800",
  },
  low: {
    text: "Low activity",
    dot: "bg-rose-500",
    cls: "bg-rose-50 text-rose-700",
  },
  none: {
    text: "Not scored",
    dot: "bg-slate-300",
    cls: "bg-slate-100 text-slate-600",
  },
};
