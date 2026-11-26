import { AlertTriangle } from "lucide-react";
import type { ProductivityRow } from "@/lib/productivity";
import ProductivityBadge from "./ProductivityBadge";

const hm = (s: number) =>
  `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

export default function DayReport({ row }: { row?: ProductivityRow }) {
  if (!row) return null;
  const m = row.metrics;

  const cells = [
    { k: "Active time", v: hm(m.active_seconds) },
    {
      k: "Utilization",
      v: m.utilization === null ? "—" : `${Math.round(m.utilization * 100)}%`,
    },
    { k: "Completed", v: m.tasks_completed },
    { k: "Progress gained", v: `+${m.progress_gained}%` },
    { k: "Sessions", v: m.segments },
    { k: "Updates w/ remarks", v: `${m.updates_with_remarks}/${m.updates}` },
  ];

  return (
    <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Day report</p>
        <ProductivityBadge row={row} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.k} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              {c.k}
            </dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">
              {c.v}
            </dd>
          </div>
        ))}
      </dl>

      <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
        {row.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      {row.flags.forgot_to_pause && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
          Task was still running after 5:30 PM. Time after the cutoff is not
          counted.
        </p>
      )}
    </div>
  );
}
