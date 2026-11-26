import { LABEL_META, type ProductivityRow } from "@/lib/productivity";

export default function ProductivityBadge({ row }: { row?: ProductivityRow }) {
  if (!row) return null;
  const meta = LABEL_META[row.label];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}
      title={row.reasons.join(" · ")}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.text}
    </span>
  );
}
