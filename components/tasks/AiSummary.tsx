"use client";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";

type Result = {
  summary: string;
  driver: string;
  risks?: { task_id: number; task: string; reasons: string[] }[];
};

export default function AiSummary({ url }: { url: string }) {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    adminFetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((r) => active && setData(r.data))
      .catch(() => active && setError("Summary unavailable."));
    return () => {
      active = false;
    };
  }, [url]);

  if (error) return <p className="text-xs text-slate-400">{error}</p>;
  if (!data)
    return <div className="h-12 animate-pulse rounded-xl bg-slate-100" />;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2.5">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-violet-700">
        <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
        Auto-generated summary
      </p>
      <p className="text-sm text-slate-700">{data.summary}</p>
      {data.risks?.map((r) => (
        <p className="mt-1.5 text-xs text-amber-800" key={r.task_id}>
          <span className="font-semibold">May need help:</span> {r.task}:{" "}
          {r.reasons.join("; ")}
        </p>
      ))}
    </div>
  );
}
