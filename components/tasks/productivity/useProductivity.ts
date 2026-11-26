import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import { localToday } from "@/lib/time";
import type { ProductivityRow } from "@/lib/productivity";

export function useProductivity(enabled: boolean) {
  const [date, setDate] = useState(localToday());
  const [rows, setRows] = useState<ProductivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isToday = date === localToday();

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setError("");
      const res = await adminFetch(
        `/api/admin/task-management/productivity?date=${date}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(json.message || "Unable to load productivity.");
      setRows(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load productivity.");
    } finally {
      setLoading(false);
    }
  }, [date, enabled]);

  useEffect(() => {
    void load();
    if (!isToday || !enabled) return;
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load, isToday, enabled]);

  const byEmployee = useMemo(
    () => new Map(rows.map((r) => [r.employee_id, r])),
    [rows],
  );

  return { date, setDate, rows, byEmployee, loading, error, isToday };
}
