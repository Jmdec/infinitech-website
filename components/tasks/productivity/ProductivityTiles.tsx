import type { ProductivityRow } from "@/lib/productivity";

type Person = { id: number; name: string };

export default function ProductivityTiles({
  rows,
  people,
}: {
  rows: ProductivityRow[];
  people: Person[];
}) {
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const names = (pick: (r: ProductivityRow) => boolean) =>
    rows
      .filter(pick)
      .map((r) => nameOf.get(r.employee_id))
      .filter((n): n is string => Boolean(n))
      .sort((a, b) => a.localeCompare(b));

  // Average ng mga na-score lang, para hindi hilahin pababa ng "No tasks".
  const utils = rows
    .filter((r) => r.label !== "none")
    .map((r) => r.metrics.utilization)
    .filter((u): u is number => u !== null);
  const avg = utils.length
    ? Math.round((utils.reduce((a, b) => a + b, 0) / utils.length) * 100)
    : null;

  const tiles = [
    {
      label: "Productive",
      accent: "border-t-emerald-500",
      list: names((r) => r.label === "productive"),
    },
    {
      label: "Needs attention",
      accent: "border-t-amber-400",
      list: names((r) => r.label === "attention"),
    },
    {
      label: "Low activity",
      accent: "border-t-rose-500",
      list: names((r) => r.label === "low"),
    },
    {
      label: "Forgot to pause",
      accent: "border-t-orange-400",
      list: names((r) => r.flags.forgot_to_pause),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`rounded-2xl border border-t-4 border-slate-200 bg-white p-4 shadow-sm ${t.accent}`}
        >
          <p className="text-sm text-slate-500">{t.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {t.list.length}
          </p>
          {t.list.length > 0 && (
            <ul className="mt-2 max-h-28 space-y-0.5 overflow-y-auto text-xs text-slate-600">
              {t.list.map((n) => (
                <li className="truncate" key={n} title={n}>
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <div className="rounded-2xl border border-t-4 border-slate-200 border-t-blue-500 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Avg utilization</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
          {avg === null ? "—" : `${avg}%`}
        </p>
      </div>
    </div>
  );
}
